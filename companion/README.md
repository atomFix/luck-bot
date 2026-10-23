# Round Eyes Companion

macOS arm64 本机程序，配合 ESP32-S3 N16R8 + GC9A01 圆眼固件。板端维持已验证的25眼型；电脑使用 DeepSeek 理解句子并先发送眼神，再生成回答。MiniMax ASR/TTS 已做真实接口冒烟；DashScope ASR/TTS 可独立配置，适配器入口保留，实际部署能力尚未接入验证。

## 安装与启动

本地安装包位于工作区 `output/round-eyes-companion/`，包含 `Round Eyes Companion.app` 和 zip。当前包为本机 ad-hoc 签名，未做 Developer ID 公证。支持当前arm64 Mac；未进行其他机器或旧macOS真机验收。

在解压目录执行 `bash install.sh` 安装到 `~/Applications/Round Eyes Companion.app`，然后打开应用。菜单栏 **◉** 可再次打开设置或退出。运行时随包提供，无需另装Node/Python/Rust。程序只监听127.0.0.1；CLI/MCP走当前用户0600权限Unix socket，不开放局域网管理页面。

1. USB连接开发板，设置页点“USB配对”，看到确认提示后按一下BOOT。
2. 选择已配对设备，“连接并启用Companion”。mDNS可自动发现，USB响应也会带回设备IP。
3. 配置Keychain凭据；已保存的Key不回显。输入新Key点保存，删除使用明确的删除按钮。
4. 识别/合成可分别选择供应商、模型、地址与音色。DashScope显示“接口预留”，不能把未实现的适配器当作已可调用服务。
5. 先输入文字验证眼神，功放未安装时明确选择Mac扬声器再试语音。按BOOT或使用唤醒词开始一轮；一句话结束后才做语义反应。

原始录音、完整历史默认只在内存；关闭进程即清空。诊断不保存文本、音频或Key。模型处理在所选服务商云端运行，不是ESP32本地大模型。一次语音轮次最多两个DeepSeek逻辑请求，各自最多一次瞬时失败重试；余额/鉴权失败不重试。

## CLI、MCP与Skill

CLI位于应用 `Contents/MacOS/round-eyes`，可自行加入PATH。`devices/discover/pair/connect/status/react/say/interrupt/release/mode/revoke-controller` 在`--help`输出示例。设备控制由常驻程序统一持有一个租约。

MCP配置见随包 `Contents/Resources/config/mcp.example.json`，将两个安装路径替换为本机绝对路径。服务为stdio，只有list_devices、get_status、set_reaction、semantic_input；没有任意shell、配对、读取Key或刷写工具。Skill见 `Contents/Resources/skill/round-eyes/SKILL.md`，安装本身不授予设备权限。已决定表情的Agent直接调用set_reaction，不需要再请求DeepSeek分类。

## 开发与验证

在源码 `companion/` 执行 `npm ci`、`npm run native`、`npm test`、`npm run check`；`npm start`启动开发服务。`bash scripts/package-macos.sh`生成本机包。Keychain helper只通过长度前缀stdin/stdout传值，API Key不进入命令参数或环境变量。

Provider真实冒烟脚本为`scripts/smoke-providers.ts`，每次运行会产生有界付费调用，不作为普通测试运行。已有结果见provider-verification.json。协议见工作区docs/round-eyes-protocol-v1.md；当前验收状态见verification.json。真实API、设备显示、麦克风、板端喇叭和安装验收分开记录，pending不等于通过。

## 更新、回滚与卸载

退出菜单栏程序后再更新；安装器保留同目录`.previous`副本。已有previous时先将其移走归档再升级，避免覆盖唯一回滚副本。设置与Keychain不在应用包内，升级保留配对。回滚退出当前程序后将previous移回原位置。

退出程序后运行 `bash uninstall.sh [应用绝对路径]`，默认保留设置、Keychain和previous。`--delete-credentials`明确删除本程序已知Keychain条目；`--delete-data`明确删除本程序数据目录。卸载前可在设置页撤销当前Mac的板端授权；仅删除本地Key不会撤销设备上的控制者。卸载默认不清板端NVS或其他程序凭据。

固件稳定回滚镜像是 `hardware/esp32-bringup/firmware/xiaozhi-1.9.4-s3-round-eyes.bin`，SHA256 `a3f06cd723d384316bda9e55f46df0113434a417ecb07dc0fa356ef73e467ba2`。当前预检OTA记录为sequence2/ota_1/0x700000，但后续刷写前必须重新读取实时OTA选择，不能永久假定此地址。只写确认的应用槽；禁止整片擦除、重写NVS/分区/模型。完整应用槽备份在不对外提供的backups目录。

首版不包含公网中继、Windows版和公众签名公证发布。串口配对具有30秒物理确认窗；超时后从设置重新发起，不能用网络请求绕过BOOT确认。
