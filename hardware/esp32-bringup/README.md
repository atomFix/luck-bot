# 小智 ESP32-S3 裸板与 GC9A01 圆屏联调

目标实物：ESP32-S3 N16R8、16MB QIO Flash、8MB OPI PSRAM，原生 USB Serial/JTAG。
2026-10-23 已在原有固件上完成配网、用户绑定及麦克风语音识别/云端回复验证。
MAX98357A 成品功放尚待到货，实际声音输出未验证。

## 接线

断电接线，所有信号为 3.3V。颜色仅为用户本次线束，不是接口规范。

| 模块 | 引脚 | ESP32 GPIO/电源 |
| --- | --- | --- |
| I2S 麦克风 | VDD / GND / L/R | 3V3 / GND / GND |
| I2S 麦克风 | WS / SCK / SD | 4 / 5 / 6 |
| GC9A01 240×240 SPI 圆屏 | VCC（白）/ GND（灰） | 3V3 / GND |
| 圆屏 | SCL（紫）/ SDA（蓝） | 21 / 47 |
| 圆屏 | DC（绿）/ CS（黄）/ RST（橙） | 40 / 41 / 45 |
| 预留 I2S 功放 | DIN / BCLK / LRC | 7 / 15 / 16 |

圆屏没有独立背光引脚，GPIO42 不接。不要混用原 OLED 固件的 I2C SDA41/SCL42 接法。
开发板 RGB 是 GPIO48 上的 WS2812B，BOOT 为 GPIO0。

## 固件来源与配置

- 官方源码：<https://github.com/78/xiaozhi-esp32/tree/v1.9.4>
- 板型：`bread-compact-wifi-lcd`，屏幕：`CONFIG_LCD_GC9A01_240X240=y`。
- `sdkconfig.gc9a01.defaults` 保存本机配置；官方音频和显示引脚无需改动。
- 本地仅从依赖清单移除了两个注册源已不存在、且仅供其他板型使用的组件：
  `espressif2022/image_player` 和 `espressif2022/esp_emote_gfx`。
  GC9A01 驱动、LCD 板型及音频实现沿用官方源码，未改写。
- ESP-IDF v5.5，Python 3.12。源码及 SDK 位于 `vendor/`，安装与构建日志位于 `logs/`。
- 官方 1.9.4 发布资产中的 `bread-compact-esp32-lcd` 是普通 ESP32，不应给 S3 烧录。

## 备份

备份可能含 Wi-Fi/设备凭据，仅保留本地，不应上传或分享。

- `backups/factory-2026-10-23-16mb.bin`：首次配网前、原厂小智 1.9.2。
- `backups/bound-1.9.4-before-lcd-2026-10-23.bin`：自动升级至 1.9.4 且绑定后的完整 16MB 备份。
  SHA256：`e4642de1059cea7aa0b6dc90e2c00a387fb4f4d0a80e4a88e3396418dac8df78`。

现有分区与官方 v1/16m.csv 一致：NVS 0x9000、OTA 数据 0xd000、模型 0x10000、
ota_0 0x100000（6MB）、ota_1 0x700000（6MB）。备份时运行分区为 ota_1。
后续烧录需核对实际构建产物与分区，保留 NVS、OTA 数据及现有引导程序。

## 读取日志

USB 串口目前为 `/dev/cu.usbmodem21201`，重插后可能变化。
只观察运行日志时避免切换 DTR/RTS；pyserial 打开时的控制线切换可能导致板子重启。
可以通过 `os.open(..., os.O_RDONLY | os.O_NONBLOCK | os.O_NOCTTY)` 和 select 读取。
型号与固件启动成功不能替代肉眼确认屏幕显示、颜色、方向和真实扬声器音量。

## 本次烧录与验证

2026-10-23：ESP-IDF v5.5 构建通过。SDK 的全部递归子模块已核对，无未初始化或版本偏离项。
分区表与完整备份逐字节一致；应用镜像通过 esptool 类型、校验和及 SHA256 检查。

只写入了以下两个地址，两个区域均通过设备端 Flash 数据校验：

| 文件 | Flash 地址 | 大小 | SHA256 |
| --- | --- | --- | --- |
| `firmware/srmodels-1.9.4.bin` | `0x10000` | 291042 | `56990e6b97faeced7aeea48c89f15b0d0c579c012a8106b91e96141f490051a6` |
| `firmware/xiaozhi-1.9.4-s3-gc9a01.bin` | `0x700000`（现有 ota_1） | 3513328 | `34c82b5a1a55e044a1f07701d7e8e63c3992ec1c3db5818139b7414dd156c368` |

保留了原引导程序、分区表、OTA 选择数据及 NVS。
启动日志确认本机构建（2026-10-23 18:11:11）、`bread-compact-wifi-lcd`、
`LCD panel create success`、LVGL 启动、原 Wi-Fi 自动连接、MQTT 服务器连接、
进入 idle、语音模型加载及唤醒检测任务启动。未出现原来的 OLED I2C 初始化错误。

待用户肉眼确认：圆屏是否出图、颜色、方向、文字是否被圆形边缘裁切。
新固件上的实际语音交互需后续复测；功放和扬声器输出尚未验证。

## 原创圆眼动画（2026-10-23）

固定黑色圆脸与两只白眼；49 个原创参数眼型、25 个情绪映射、6 种对话行为。
参考 grok-icon-study 的眼神表达方式，未导入其提取的轮廓资产。
常规界面无文字、无嘴巴；配网、升级、连接与错误提示使用居中文字。

源码在 `character/`，主机预览与 ESP32 共用 `EyesModel`。音频线程只发布定步长 PCM 包络和32位原子标量；LVGL 线程修改动画。眨眼约3–7秒一次；说话能量160ms过期，切换状态后旧包络失效。

```sh
hardware/esp32-bringup/scripts/build-eyes-host.sh
node hardware/esp32-bringup/preview/server.mjs
# 浏览器打开 http://127.0.0.1:4382
hardware/esp32-bringup/scripts/build-eyes-firmware.sh
```

`CONFIG_ROUND_EYES_CHARACTER` 仅适用于当前 S3 / GC9A01 板型，默认启用；`CONFIG_ROUND_EYES_CAPTIONS` 默认关闭，开启后显示两行省略字幕。关闭角色可构建原显示界面。补丁为 `patches/round-eyes-v1.9.4.patch`，应用脚本检查1.9.4版本并拒绝重复或冲突应用。上游依赖裁剪仍按本文前述步骤保留。

预览视频：`../../output/xiaozhi-character-design/eyes-motion.mp4`。这是同一 C++ 模型输出点的离线渲染，不代表实机帧率。截图：`../../output/xiaozhi-character-design/eyes-preview.png`。

运行诊断每10秒输出模型更新FPS、LVGL refresh周期FPS、最长refresh/模型更新耗时、当前行为、空闲堆和最低堆。refresh事件测量不等于面板光学测量；最长refresh包括LVGL绘制与等待前一段DMA，末段DMA完成时间未单独计量。

设备采用整眼轮廓扫描填充和RGB565画布，每行4个垂直子像素、水平覆盖率抗锯齿。画布裁为240×240，覆盖模型坐标y0–239，固定占115200字节PSRAM；其余动画/UI控制状态约1KB，不逐帧申请内存。像素回归测试检查49眼型内部无黑缝、边缘抗锯齿、旧形状完全清除。LVGL对象、绘制任务和显示缓冲的实际开销以实机堆数据为准。备份固件、NVS与凭据只保存在本机，预览HTTP服务仅暴露固定页面与帧接口。

实际烧录、启动、语音、视觉、10分钟运行及喇叭验证状态以 `VERIFICATION-eyes.json` 为准；编译通过不代替这些验收。

实机调优记录：最初整屏三角形重绘只有约13FPS；局部重绘约21FPS，50ms周期版对话中约17FPS。操作人照片暴露出LVGL三角形共享边缘抗锯齿黑缝，因此当前版改为一次绘制整眼画布，并重新以40ms周期测量。旧三角形版本的帧率/稳定性记录不能替代新画布的验收；最新统计在验证JSON中。最初诊断日志的64位格式不兼容newlib-nano，已改为32位格式，失败日志保留追溯。

最终调度：本板FreeRTOS为100Hz，LVGL port每轮额外yield一tick。UI请求30ms、显示刷新截止10ms（无脏像素时刷新计时器暂停），实测待机约27FPS、语音对话约25–26FPS。全局RTOS时钟与第三方port源码保持原配置。显示刷新周期与实际帧率分开记录，不把10ms截止时间当作100FPS。

自动声学回归使用Mac现有音频输出朗读10个非敏感算术问句，等待每轮设备回到聆听后再继续；不调整音量或输出路由，单轮超时即停止。脚本：`scripts/voice-smoke-eyes.py`。日志：`logs/eyes-acoustic-smoke.log`；仅说明输入→云端→软件音频播放链路，不代表板端喇叭已接好。

方向眼型版本（2026-10-24）采用独立胶囊轮廓与球面朝向投影；参考 grok-icon-study 的姿态表达思路，未复制其提取资产或轮廓。当前短测刷新24.5–25.3FPS，最低空闲堆7731944字节，无崩溃。详见 `../../companion/directional-eyes-verification.json`；旧版本记录仍供追溯。

巨型眼型版本（2026-10-24）增加4种可调用眼型与8个基础姿态，画布扩为240×240。大面积画面使用活动边表及差分覆盖填充，保留4倍垂直采样；49个静态眼型与此前算法逐像素一致，帧间无动态内存分配。巨型眼型持续演示约19–20FPS（优化前低至12.4FPS），小眼型约25FPS；短测与用户现场确认见 `../../companion/giant-eyes-verification.json`。
