# luck-bot

ESP32-S3 圆屏 AI 伙伴：黑底圆脸、两只白眼，用眼神回应语义。板端运行原创圆眼动画，Mac Companion 处理模型调用与设备控制。

语音链路：板载麦克风 → MiniMax ASR → DeepSeek 理解 → **先反馈表情** → 生成回复 → MiniMax TTS。ASR/TTS 可分别配置；DashScope 适配接口已预留，尚未实现。模型运行在云端。

## 目录

| 路径 | 内容 |
| --- | --- |
| `companion/` | macOS arm64 菜单栏程序、设置页、CLI、MCP、Skill、Keychain 助手与打包脚本 |
| `hardware/esp32-bringup/character/` | 25 种眼型、21 种情绪映射、动画与抗锯齿绘制 |
| `hardware/esp32-bringup/companion/` | ESP32 配对、TLS/WSS、租约、音频与优先级控制 |
| `hardware/esp32-bringup/preview/` | 使用同一 C++ 模型的本机预览 |
| `hardware/esp32-bringup/patches/` | 小智 v1.9.4 集成补丁与源码校验基线 |
| `docs/` | 协议、设计、实施计划 |

## Mac 开发与安装

需要 Apple Silicon Mac、macOS 14+、Xcode Command Line Tools 和 Node **22.22.3**。当前打包脚本将本机 Node 打入应用，请使用该版本。

```sh
cd companion
npm ci
npm run native
# 安装测试需要先生成应用包；该步骤不会安装到用户 Applications
bash scripts/package-macos.sh
npm test
npm run check
cd ..
bash output/round-eyes-companion/install.sh
open "$HOME/Applications/Round Eyes Companion.app"
```

在设置页输入自己的服务商 API Key，凭据仅存 macOS Keychain。仓库和安装包不包含 API Key、设备令牌、NVS、录音或个人配置。默认测试使用夹具和临时测试凭据，不调用付费模型；`smoke-providers.ts` 是单独的付费接口冒烟脚本。

设置页发起 USB 配对，30 秒内按开发板 BOOT，然后连接并启用 Companion。设备端使用证书固定、独立控制者令牌和单写租约；本机页面仅监听回环地址。CLI/MCP 通过当前用户私有 Unix socket 调用常驻程序。详情见 [Companion 说明](companion/README.md)。

## 硬件与预览

当前板型：ESP32-S3 N16R8 + GC9A01 240×240。麦克风 GPIO 4/5/6，屏幕 GPIO 21/47/40/41/45，预留 MAX98357A GPIO 7/15/16。完整接线见 [硬件说明](hardware/esp32-bringup/README.md)。

```sh
bash hardware/esp32-bringup/scripts/build-eyes-host.sh
bash hardware/esp32-bringup/scripts/build-companion-host.sh
node hardware/esp32-bringup/preview/server.mjs
# 打开 http://127.0.0.1:4382/
```

固件基于 [xiaozhi-esp32 v1.9.4](https://github.com/78/xiaozhi-esp32/tree/v1.9.4) 和 ESP-IDF v5.5；上游源码、SDK 和编译结果不纳入仓库。首次构建按 [固件准备说明](hardware/esp32-bringup/BUILD.md) 操作。刷写前重新读取实际 OTA 槽位，备份设备，并只写确认的应用槽。

## 当前验证范围

2026-10-24 已有证据：49 项主机测试、类型检查、原生助手与 C++ 测试通过；DeepSeek、MiniMax 真实接口冒烟通过；本机包已安装；固件已写入本机开发板，空闲动画约 26 FPS。

已完成物理 BOOT 配对，独立探测已通过证书固定和控制者令牌鉴权；用户手动重开并允许本地网络后，常驻程序连接成功；文字语义→板端表情确认→回复已通过实测。已通过一轮真实麦克风→本机自动断句→MiniMax ASR→DeepSeek语义/板端表情→MiniMax TTS→Mac播放，用户确认眼神和声音均正常。句尾由随包的离线Silero VAD处理，ESP32保留30秒录音上限；静音不调用云端模型。板端原AFE判句在本机环境不稳定，历史失败记录仍保留。

尚待完成：10轮/10分钟语音测试及板端喇叭声学验收。Mac本地网络授权后自动发现已恢复。DashScope适配、其他机器验收、公众签名公证和公网中继未完成。详见 [验收记录](companion/verification.json)。这些记录是本次开发设备的证据，不代表新克隆环境已通过实机验收。

打包默认使用 ad-hoc 签名，可设置 `ROUND_EYES_SIGN_IDENTITY` 使用 Apple 签发的代码签名身份；当前本机安装版使用 Apple Development 签名，未公证。本仓库目前提交源码，不发布二进制包。

## 来源

眼型为原创参数动画，参考 [grok-icon-study](https://github.com/blessonism/grok-icon-study) 的表达方式，未复制其提取的轮廓资产。上游固件代码及基线的版权与许可证见 [第三方说明](third_party/README.md)。
