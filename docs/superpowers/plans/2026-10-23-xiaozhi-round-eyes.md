# 小智圆屏 25 眼型角色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 GC9A01 小智上实现固定黑色圆脸、25 个基础眼型和连续双眼动画，并保持语音交互正常。

**Architecture:** 独立纯 C++ 模型生成双眼轮廓，桌面 Canvas 与 LVGL 使用同一份模型输出。
设备状态和实际播放 PCM 通过轻量信号驱动模型；现有显示负责圆屏接入与重要提示。

**Tech Stack:** C++17、ESP-IDF v5.5、LVGL 9.3、GC9A01 240×240 SPI 40MHz；主机测试使用系统 C++ 编译器，预览使用 Node.js 内置 HTTP 与 Canvas。

**Spec:** `/Users/luojuan/project/v-hard/docs/superpowers/specs/2026-10-23-xiaozhi-blob-character-design.md`

## Global Constraints

- 主色：纯黑背景、柔白眼睛。整块物理圆屏就是圆脸，半径与显示边界保持固定。
- 不缩放、拉伸、旋转或弹跳圆脸；所有情绪变化发生在眼睛内部及双眼位置上。
- 保留全部 25 基础眼型独立预览入口，兼容现有全部 21 个云端情绪键。
- 正常模式全屏纯眼睛，不常驻状态栏或字幕。关键配网、升级、异常提示仍须可读。
- 渲染目标 25 FPS，可在 20–30 FPS 内调节；待机可降至 15 FPS。帧率必须上板测量。
- 新增常驻内存目标不超过 64KB，不含现有 LVGL 图像缓存和语音缓存。
- 动画模型和每帧几何计算不得堆分配；渲染时 LVGL 内部绘制任务分配单独测量。
- 音频路径不获取 LVGL 锁，不动态分配额外帧缓存；超过 160ms 无新播放数据则衰减到静止。
- 保留当前可用应用镜像；烧录只针对应用分区，不改 Wi-Fi、绑定数据、引导程序或分区表。
- 当前工作目录不是 Git 仓库，不初始化仓库或假报提交；用可读源码、补丁和文件校验记录交付。

## Review Focus

- 情绪事件与设备事件交错：旧的 neutral 不能吞掉聆听行为，旧音频不能让新一轮等待继续说话（Task 1、3）。
- 25 种眼型中任意切换及暂停恢复：多边形不得自交、翻转或超出圆屏，闭眼仍有稳定细线（Task 1、3）。
- 黑底纯眼睛模式下断网或升级：重要提示不能被隐藏标签的逻辑吞掉（Task 3）。
- 长句、空文本、未知情绪：角色不被文字推移，空文本不会误触发等待，未知情绪可回退（Task 1、3）。
- 音频停止、打断和反复对话：能量过期会归零，动画不阻塞音频，不随轮次泄漏（Task 1、3、4）。

## 文件与边界

新实现保存在 `hardware/esp32-bringup/character/`，不把唯一源码留在被忽略的 vendor 里。

| 文件 | 职责 |
| --- | --- |
| `character/eyes_model.h/.cc` | 单调时间、行为、情绪、弹簧、眨眼和固定数组轮廓 |
| `character/eye_poses.h/.cc` | 25 眼型及 21 情绪播放列表；原创参数，不导入参考几何坐标 |
| `character/triangulate.h/.cc` | 对有凹部的眼型进行固定容量三角剖分，供 LVGL 绘制 |
| `character/animation_signals.h/.cc` | 跨任务状态与播放包络快照，不依赖 LVGL |
| `character/eyes_view.h/.cc` | LVGL 绘制、计时器、帧耗时计数 |
| `character/round_eyes_ui.h/.cc` | 角色与现有标签的生命周期、字幕和关键提示 |
| `character/CMakeLists.txt`、`character/Kconfig` | IDF 组件和角色/字幕开关 |
| `tests/eyes_model_test.cc`、`tests/signals_test.cc`、`tests/triangulate_test.cc` | 原生主机测试，无设备或网络依赖 |
| `preview/model_host.cc`、`preview/server.mjs`、`preview/index.html` | 同一 C++ 模型的浏览器预览；服务只监听 127.0.0.1 |
| `scripts/build-eyes-host.sh`、`scripts/build-eyes-firmware.sh` | 可重建的主机与设备构建命令 |
| `patches/round-eyes-v1.9.4.patch`、`scripts/apply-eyes-patch.sh` | 官方基线的最小接入改动，应用前先检查补丁和源码版本 |
| `logs/`、`firmware/`、`VERIFICATION-eyes.json` | 构建/运行证据及验证状态，备份不进入预览服务 |

## Task 1: 25 眼型与确定性动画模型

**Create:** `character/eyes_model.*`、`character/eye_poses.*`、`character/triangulate.*`、对应三个主机测试文件中的模型与剖分测试。

**Interfaces:** 后续主机预览和设备共用以下接口，不允许各自实现另一套动画。

```cpp
namespace round_eyes {
constexpr size_t kPoseCount = 25;
constexpr size_t kContourPoints = 48;
enum class Behavior { Idle, Waking, Listening, Waiting, Speaking, Reconnecting };
struct Point { float x, y; };
struct Frame {
  std::array<std::array<Point, kContourPoints>, 2> eyes;
  uint8_t pose;
  Behavior behavior;
};
class EyesModel {
 public:
  explicit EyesModel(uint32_t seed);
  void SetEmotion(std::string_view key, uint64_t now_ms);
  void SetBehavior(Behavior value, uint64_t now_ms);
  void ForcePose(std::optional<uint8_t> pose, uint64_t now_ms);
  void ObserveAudio(float energy, uint64_t now_ms);
  Frame Tick(uint64_t now_ms);
};
struct Triangle { Point a, b, c; };
struct Mesh { std::array<Triangle, kContourPoints - 2> triangles; size_t count; };
Mesh Triangulate(const std::array<Point, kContourPoints>& contour);
}
```

- [ ] 写主机测试，先断言模板数、全部 25 眼型可选择、未知情绪回退和相同种子/时序产生相同轮廓。运行并看到缺失行为导致失败，再实现相应行为。

```cpp
EyesModel a(42), b(42);
a.SetEmotion("unrecognized", 0);
b.SetEmotion("neutral", 0);
assert(SameFrame(a.Tick(200), b.Tick(200)));
for (uint8_t id = 0; id < kPoseCount; ++id) {
  a.ForcePose(id, 200);
  assert(a.Tick(2000).pose == id);
}
```

- [ ] 按设计图重画 25 个标准眼型，固定为每眼 48 个有序边界点；保持同一绕向和顶点对应。闭眼为有最小厚度的轮廓，不能退化为零面积。
- [ ] 实现弹簧积分、眨眼和受状态限制的微动作。使用固定容量成员、xorshift32 种子、单调时间；单次积分时间最大 16ms，总恢复跨度限 250ms。每段切换从当前轮廓继续，不重置为默认眼睛。

```cpp
// 每个连续参数的积分；dt_s <= 0.016。
const float acceleration = omega * omega * (target - value)
                         - 2.0f * damping * omega * velocity;
velocity += acceleration * dt_s;
value += velocity * dt_s;
```

- [ ] 情绪播放列表用固定数组与长度，按以下关系接入，避免假定 25 眼型等于 25 云端情绪：

```text
neutral:00,06  happy:02,17,20  laughing:11,02  funny:11,05
sad:16,06  angry:07  crying:16  loving:19,20  embarrassed:24
surprised:03,18  shocked:21  thinking:08,14  winking:23,05
cool:15  relaxed:06,19  delicious:17  kissy:23,24  confident:15,01
sleepy:22,13,04  silly:05,09  confused:09,14
行为辅助眼型：聆听10,01,19；等待08,14；重连12,09。
```

- [ ] 对全部 25×25 过渡按固定时间序列测试有限坐标、可见区域、正面积、稳定绕向及无自交；对凹眼型检查三角剖分面积与轮廓面积相符。覆盖 60 秒时间跳跃、倒序时间、频繁打断和音频能量 NaN/无穷/越界输入。非法输入夹紧或清零，时间倒退不积分。
- [ ] 增加测试：闭眼不变成消失；眨眼结束恢复当前情绪；换行为不把情绪清空；ForcedPose 越界被拒绝；清除 ForcedPose 回到行为/情绪编排。
- [ ] 用主机编译器运行完整测试，例如 `c++ -std=c++17 -O2 -Wall -Wextra -Werror -Ihardware/esp32-bringup hardware/esp32-bringup/character/eyes_model.cc hardware/esp32-bringup/character/eye_poses.cc hardware/esp32-bringup/tests/eyes_model_test.cc -o /tmp/xiaozhi-eyes-model-test`，然后执行生成的二进制。剖分和信号测试采用各自依赖源文件的相同构建方式。

## Task 2: 使用同一模型的动效预览

**Create:** `preview/model_host.cc`、`preview/server.mjs`、`preview/index.html`、`scripts/build-eyes-host.sh`。

**Consumes:** Task 1 的 EyesModel、Frame 和 25 模板。**Produces:** 本机可打开的 240×240 与放大预览，支持全部眼型、情绪、行为和可控音频测试输入。

- [ ] 先为协议写测试：`pose 24`、`pose auto`、`emotion happy`、`behavior listening`、`energy 0.5` 被接受；`pose 25`、非有限能量和未知命令返回明确错误，不能导致模型退出。
- [ ] 主机程序用固定 40ms 步进运行 EyesModel，从 stdin 读取上述行命令，stdout 每行输出一个 JSON Frame。JSON 只包含编号、行为和两组轮廓点；日志送 stderr。
- [ ] Node 只用内置模块启动固定路径的主机程序，维护最新帧。HTTP `GET /frame` 返回该帧，`POST /control` 经白名单校验后写入 stdin。只提供本预览目录的静态文件，不允许目录遍历、任意文件路径、任意 shell 命令或访问备份。
- [ ] Canvas 使用模型输出的 48 点闭合路径填充两只白眼，黑底固定。提供全部 25 按钮、21 情绪、6 行为、自动/暂停、模拟音量；画面正文写明“桌面预览，设备帧率另测”。预览中的按钮不控制真实开发板。
- [ ] 验证控制协议拒绝非法输入；逐个选择 25 眼型；录下待机→唤醒→聆听→等待→说话→待机及 3 个打断过程。浏览器与原生模型的同种子轮廓应一致，Canvas 不追加另一套动画参数。
- [ ] 保存可查看的预览截图/短录屏及启动命令，检查 240×240 原始尺寸下的闭眼、凹眼型和左右眼间距。

## Task 3: 小智信号与 LVGL 接入

**Create:** `character/animation_signals.*`、`character/eyes_view.*`、`character/round_eyes_ui.*`、组件 CMake/Kconfig 和接入补丁。

**Patch targets:** vendor 小智 v1.9.4 的根 CMakeLists、`main/application.cc`、`main/audio/audio_service.cc`、`main/display/lcd_display.h/.cc`。

**Interfaces:**

```cpp
struct SignalSnapshot {
  round_eyes::Behavior behavior;
  float energy;
  uint64_t audio_at_ms;
  bool critical;
};
class AnimationSignals {
 public:
  static AnimationSignals& Instance();
  void PublishDeviceState(DeviceState state, uint64_t now_ms);
  void NotifyRecognizedText(bool nonempty, uint64_t now_ms);
  void PublishPlayback(const int16_t* pcm, size_t count, uint64_t now_ms);
  SignalSnapshot Read(uint64_t now_ms) const;
};
```

跨线程用原子标量和版本快照，不能把 std::string、LVGL 对象或队列内存交给音频线程。
纯主机信号测试采用等价状态输入适配层，避免把 ESP-IDF 头文件引入模型。

- [ ] 先写信号测试：非空 STT 进入等待；空 STT 不进入；首个播放包结束等待；idle/中断清空旧音频；160ms 超时衰减；接近满幅和全零 PCM 得到有限、0..1 的能量。音频包按固定步幅采样，不额外复制向量。
- [ ] 应用 SetDeviceState 同步发布状态；STT 分支只发布非空文本标记。AudioOutputTask 在调用 `codec_->OutputData(task->pcm)` 前发布 PCM 包络。发布路径不得获取显示锁，不修改原有解码、队列、采样率或音频授权流程。
- [ ] EyesView 在 LVGL 任务中按 40ms 更新，使用现有显示锁绘制。动态动画状态只由该任务调用模型修改；外部情绪和状态先通过受控邮箱/快照传入。每帧使用固定数组剖分轮廓，再调用 LVGL 三角形绘制；避免新建/销毁对象。
- [ ] RoundEyesUi 由 LcdDisplay 持有，重用已创建的 panel/display。保留 Display 析构和通知回调会访问的标签对象；普通状态隐藏它们，关键提示时显示安全区域内的文字。不得为移除旧 emoji 而删除后继续保留旧指针。
- [ ] 修改 LcdDisplay 的情绪、文字、状态和主题接口，使启用角色时进入 RoundEyesUi，禁用时沿用原逻辑。字幕构建开关默认关闭；开启后两行省略，不移动双眼至圆屏外。主题请求不能把眼睛变黑或把背景变白。
- [ ] Kconfig 角色开关只允许本 S3 LCD 板型；配置默认沿用 16MB Flash、8MB OPI PSRAM、GC9A01 及原引脚。停止动画后再释放 EyesView/计时器；不向无注销接口的 DeviceStateEventManager 注册捕获裸 this 的回调。
- [ ] 加入低频日志：渲染帧数、平均/最大更新耗时、当前行为、空闲堆和最低堆。日志不输出 Wi-Fi 密码、令牌或音频原始数据；对话文字沿用上游现有行为。
- [ ] 复跑完整主机测试；角色开/关、字幕开/关分别构建。实际调用断网、升级提示与长文本，检查普通纯眼睛模式不会吞掉关键提示。

## Task 4: 构建、烧录与实机验收

**Modify:** `sdkconfig.gc9a01.defaults` 的角色配置扩展、`README.md`。**Create:** `scripts/build-eyes-firmware.sh`、`VERIFICATION-eyes.json`。

- [ ] 构建脚本先核对官方源码版本、应用最小补丁，把 `character/` 作为 EXTRA_COMPONENT_DIRS 接入。使用已有 Python 3.12 / ESP-IDF v5.5 工具链；不重新下载整个 SDK。补丁重复应用必须可检测，不能静默叠加。
- [ ] 保存当前可用 GC9A01 应用的原始文件和 SHA256。确认新构建仍使用原来的分区表、语音模型及引脚；比较模型文件，若不变则不写入模型分区。
- [ ] 所有主机测试与构建通过后，使用 esptool image-info 检查 S3 镜像、校验和、Flash 容量和 6MB 应用分区限制。记录新增常驻内存估算，并由实机堆数据复核。
- [ ] 读取实时 OTA 选择信息，确定当前应用槽；仅更新选定应用槽，保留 NVS、OTA 元数据、引导程序和分区表。Flash 后确认设备端校验通过，不能直接执行会初始化 OTA 数据的整包 flash 命令。
- [ ] 捕获完整启动日志，确认本地新镜像、圆屏初始化、原 Wi-Fi/绑定、MQTT、语音模型和唤醒任务。若启动失败，恢复保存的 GC9A01 基线应用，先排查，不改用户接线。
- [ ] 实机检查待机、唤醒、聆听、等待、说话及 happy/confused/sleepy；操作人确认实际屏幕上的过渡和纯眼睛布局。缺少操作人反馈时，将视觉验收明确记为未确认。
- [ ] 至少 10 轮对话、10 分钟运行：记录观察到的 FPS、最长帧耗时、空闲堆、最低堆、看门狗/重启情况。达不到 25 FPS 时降到 20 FPS 后重测；不把桌面帧率当作实机数据。
- [ ] 在 VERIFICATION-eyes.json 分别记录 hostTests、build、flash、boot、voice、visual、soak、speaker，状态只能使用 passed / failed / pending，并附日志路径。功放未安装时 speaker 必须 pending。
- [ ] 最终交付动效预览、独立源码、基线补丁、固件、重建命令和实测结果。逐项说明未验证项，不以编译通过替代硬件或视觉验收。

## 计划自审

- [x] 25 眼型、21 情绪、6 行为及黑底纯眼睛限制均有对应任务。
- [x] 模型接口、快照点数量、时间单位与预览/设备约定一致。
- [x] 五类 Review Focus 均有测试或明确实机检查步骤。
- [x] 关键提示、对象析构、音频非阻塞和现有绑定保留均有明确接入/验证步骤。
- [x] 原始参考几何不进入产品源码；桌面预览复用实际 C++ 模型。

计划待用户评审并确定执行方式；本文件不代表任何代码、动画性能或烧录工作已经完成。
