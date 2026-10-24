# Round Eyes Companion

macOS arm64 本机程序，配合 ESP32-S3 N16R8 + GC9A01 圆眼固件。板端维持已验证的25眼型；电脑使用 DeepSeek 理解句子并先发送眼神，再生成回答。MiniMax ASR/TTS 已做真实接口冒烟；DashScope ASR/TTS 可独立配置，适配器入口保留，实际部署能力尚未接入验证。

## 安装与启动

本地安装包位于工作区 `output/round-eyes-companion/`，包含 `Round Eyes Companion.app` 和 zip。默认构建使用本机 ad-hoc 签名；可通过 `ROUND_EYES_SIGN_IDENTITY` 指定 Apple 签发的代码签名身份，当前安装版使用 Apple Development 本地签名，未做 Developer ID 公证。支持当前arm64 Mac；未进行其他机器或旧macOS真机验收。

在解压目录执行 `bash install.sh` 安装到 `~/Applications/Round Eyes Companion.app`，然后打开应用。菜单栏 **◉** 可再次打开设置或退出。运行时随包提供，无需另装Node/Python/Rust。程序只监听127.0.0.1；CLI/MCP走当前用户0600权限Unix socket，不开放局域网管理页面。

1. USB连接开发板，设置页点“USB配对”，看到确认提示后按一下BOOT。
2. 选择已配对设备，“连接并启用Companion”。mDNS可自动发现，USB响应也会带回设备IP。
3. 配置Keychain凭据；已保存的Key默认隐藏，可在本机后台点击小眼睛短时查看。输入新Key点保存，删除使用明确的删除按钮。
4. 识别/合成可分别选择供应商、模型、地址与音色。DashScope显示“接口预留”，不能把未实现的适配器当作已可调用服务。
5. 先输入文字验证眼神，功放未安装时明确选择Mac扬声器再试语音。按BOOT或使用唤醒词开始一轮；一句话结束后才做语义反应。断句使用随包的离线 Silero VAD（CPU推理），ESP32负责采集/传输；单句最多30秒，默认1秒持续停顿后提交识别，唤醒后20秒未开口会取消。等待开口可调5–60秒，句尾停顿可调0.6–2秒。无需在首次启动时下载模型。

原始录音只在有界内存中，不落盘；模型上下文关闭后清空。对话正文、用量与耗时默认保存在本机SQLite，可在后台关闭正文保存和清理记录。诊断不保存文本、音频或Key。模型处理在所选服务商云端运行，不是ESP32本地大模型。一次语音轮次最多两个DeepSeek逻辑请求，各自最多一次瞬时失败重试；余额/鉴权失败不重试。

## CLI、MCP与Skill

CLI位于应用 `Contents/MacOS/round-eyes`，可自行加入PATH。`devices/discover/pair/connect/status/react/say/interrupt/release/mode/revoke-controller` 在`--help`输出示例。设备控制由常驻程序统一持有一个租约。

MCP配置见随包 `Contents/Resources/config/mcp.example.json`，将两个安装路径替换为本机绝对路径。服务为stdio，只有list_devices、get_status、set_reaction、semantic_input；没有任意shell、配对、读取Key或刷写工具。Skill见 `Contents/Resources/skill/round-eyes/SKILL.md`，安装本身不授予设备权限。已决定表情的Agent直接调用set_reaction，不需要再请求DeepSeek分类。

## 开发与验证

在源码 `companion/` 执行 `npm ci`、`npm run native`、`npm test`、`npm run check`；`npm start`启动开发服务。`bash scripts/package-macos.sh`生成本机包。若已有 Apple Development 身份，可用 `ROUND_EYES_SIGN_IDENTITY="签名身份名称或证书指纹" bash scripts/package-macos.sh`；不需要导出私钥。原生钥匙串助手保留稳定本机签名，避免无关升级改变现有条目的访问授权。macOS 15+ 需要用户允许本地网络访问；设备授权成功并不等于系统已允许局域网通信。Keychain helper只通过长度前缀stdin/stdout传值，API Key不进入命令参数或环境变量。

Provider真实冒烟脚本为`scripts/smoke-providers.ts`，每次运行会产生有界付费调用，不作为普通测试运行。已有结果见provider-verification.json。协议见工作区docs/round-eyes-protocol-v1.md；当前验收状态见verification.json。当前已通过一轮实机麦克风、眼神与Mac播放；自动实测前2轮完整通过，第3轮出现no_speech并停止，10轮/10分钟尚未通过；板端喇叭仍待验收。真实API、设备显示、麦克风、板端喇叭和安装验收分开记录，pending不等于通过。

## 更新、回滚与卸载

退出菜单栏程序后再更新；安装器保留同目录`.previous`副本。已有previous时先将其移走归档再升级，避免覆盖唯一回滚副本。设置与Keychain不在应用包内，升级保留配对。回滚退出当前程序后将previous移回原位置。

退出程序后运行 `bash uninstall.sh [应用绝对路径]`，默认保留设置、Keychain和previous。`--delete-credentials`明确删除本程序已知Keychain条目；`--delete-data`明确删除本程序数据目录。卸载前可在设置页撤销当前Mac的板端授权；仅删除本地Key不会撤销设备上的控制者。卸载默认不清板端NVS或其他程序凭据。

固件稳定回滚镜像是 `hardware/esp32-bringup/firmware/xiaozhi-1.9.4-s3-round-eyes.bin`，SHA256 `a3f06cd723d384316bda9e55f46df0113434a417ecb07dc0fa356ef73e467ba2`。当前预检OTA记录为sequence2/ota_1/0x700000，但后续刷写前必须重新读取实时OTA选择，不能永久假定此地址。只写确认的应用槽；禁止整片擦除、重写NVS/分区/模型。完整应用槽备份在不对外提供的backups目录。

首版不包含公网中继、Windows版和公众签名公证发布。串口配对具有30秒物理确认窗；超时后从设置重新发起，不能用网络请求绕过BOOT确认。


获得现场播放许可后，可运行 `node companion/scripts/acoustic-soak.mjs --play-test-sentences /tmp/acoustic-soak.json`。需先连接已安装应用并选择 Mac 输出；脚本用系统 Tingting 语音唤醒设备，再播放最多 10 条短句，间隔 57 秒，总计观察 10 分钟。会产生真实 ASR、语义和 TTS 调用；首个错误、断连、重启或超时立即停止，不调整音量或输出路由。报告仅保存轮次、耗时和安全错误码，不保存识别文本或音频。屏幕 FPS/内存需另外使用被动串口监控，不能由该脚本推断。

诊断中 `utterance.ended.duration_ms` 是采集开始到主机结束采集确认的时间（包含说话）；`asr.done`、`reaction.ready`、`reaction.applied` 分别为识别、语义分析和设备确认耗时。`reply.first_token` 从开始请求回复计时；`tts.first_audio` 从首次请求合成到首个 PCM 块计时。Mac `playback.started` 从创建播放器到首个缓冲区的 `dataPlayedBack` 回调计时，是软件播放观察值，未使用外置麦克风测量声学延迟。`reply.completed` 从语义分析开始计时，直到回复和播放排空；它不包含 ASR 时间。

## 本机管理后台与 SQLite

管理后台包含运行概览、对话记录、用量与费用、声纹能力状态及设备配置。SQLite 位于 `~/Library/Application Support/Round Eyes Companion/companion.sqlite3`，仅从本版本启用后记录；旧版本内存中的谈话无法回填。正文默认保存，后台可暂停之后的正文保存、按日期预览清理正文或完整记录；清空模型上下文不会清除此数据库。没有保存原始录音。

每轮详情保留识别文字、完整/部分回答、表情、设备确认、各阶段耗时及每次供应商请求（包含重试和分段 TTS）。流式调用未返回 usage、取消或计量缺失时显示未知，不按文本长度猜 token。ASR 毫秒及 TTS 字符/PCM 是本机测量，不能冒充服务商账单。配置价格后只对之后的请求估算费用；历史请求保留原价格快照，缓存输入不会与总输入重复计费。实际金额、估算和各币种分别展示，未知或部分定价不等于零花费。

API Key 仍在 Keychain：配置页小眼睛可显示已保存值，切页/失焦/30秒后清除明文。普通状态、对话库、CLI/MCP不会返回Key。管理记录也没有默认暴露给CLI/MCP。数据库故障时暂停新的云端工作，并显示记录状态；异常退出遗留轮次在重启后标为中断。

数据库由固定Node22.22.3的SQLite worker持有，打包必须通过 `node companion/scripts/verify-sqlite-runtime.mjs '/path/Round Eyes Companion.app'` 检查。`node:sqlite` 在该运行时仍有 experimental 提示；已用实际 bundled runtime 读写/重开测试，不代表已完成未来运行时迁移。未来云数据库使用独立异步repository实现；本次没有云同步或远程管理服务。多声纹与后台表情需先在“声纹与聆听”中本人录入并明确开启。

## 免唤醒表情与声纹

连接支持 `ambient_v1` 的新固件后，进入“声纹与聆听”，填写称呼，按提示本人录入三段约6秒语音。每段显式点击开始，检查音量、有效语音时长与三段一致性；失败可重试、随时取消。不要说唤醒词，唤醒会取消本次录入。勾选“完成后启用后台表情”才在完成后开启；也可稍后在聆听设置开启。最多10人，可独立停用、删除。

后台将16k PCM传给同局域网的Mac；本地Silero分句与CAMPPlus声纹比对，未知或不确定的声音记为本地忽略，不调用云端。匹配后的句子调用所选ASR和DeepSeek表情分析，不请求回答或TTS；说“你好小智”或短按BOOT才进入语音聊天。已有启用的声纹时，语音聊天也先做本地声纹筛选。说话起始显示竖眼，句尾恢复专注并等待语义表情。Mac程序需保持运行，公共网络远程控制本次未开放。

每个检测到的后台句子记入SQLite：匹配档案、忽略原因、ASR文字（按正文设置）、表情、阶段耗时、请求用量与费用来源。声纹向量以AES256GCM加密存于本机`speaker-vault.json`，独立密钥存Keychain，不进入SQLite、不通过CLI/MCP导出；删除或停用清空该人的表情上下文。声纹是互动筛选，不作为身份安全认证。

源码开发先执行 `node scripts/fetch-speaker-model.mjs`；正式安装包已含经大小/SHA256校验的本地模型。打包会运行实际 bundled runtime 的声纹192维探针及SQLite重开探针。合成音频的加载探针不等于本人声纹准确率验收，真实效果以本人录入和现场测试为准。

## 本地流式识别与快速表情

“声纹与聆听 → 响应加速”可以选择本地流式中文识别和明确简单表达的本地快判。“启用极速预设”同时启用两项，并把句尾停顿设为600毫秒；等待开口仍为20秒。原有云端ASR模型/地址与Keychain凭据保持可选，不会自动删除。取消本地识别勾选可切回已配置的云端ASR。本地识别失败会报错，不自动发起付费云端ASR。

背景音频在本地边说边解码，只有最终句子的声纹匹配通过后，文字才会进入表情流程和SQLite（受正文保存设置控制）。本地快判只接受明确简单表达；否定、反讽、问题、条件句、第三人称故事和复杂语义交给DeepSeek。当前已验证的本地模型只支持中文；姓名、生僻词和夹杂外语的准确率需要现场检查。普通后台表情不请求回复或TTS，唤醒后的聊天仍使用所选TTS。

本地ASR/快判是CPU计算，账本记录 `capture.ended`、`asr.local.done` 和 `reaction.local` 阶段；只有真正调用服务商时才产生provider_attempts，不虚构本地token/付费成本。`reaction.applied`表示板端确认接收，物理显示仍需现场验收。模型、词表、BBPE和公共探针WAV均由固定URL/大小/SHA256校验，源码开发执行 `node scripts/fetch-asr-model.mjs`。打包运行 `verify-local-asr-runtime.mjs` 做实际 bundled runtime 的中文逐帧解码检查。

升级前保留私有设置/声纹/SQLite快照；若回退到尚不识别performance字段的旧应用，需同时恢复对应的settings.json快照。不要把设备密钥、声纹档案、数据库或用户音频提交到仓库。

### 桌面伙伴的回应

Luck 的性格是温暖、好奇、机灵，略带调皮。眼神表达它听完后的回应：替你庆祝、关心疲惫的你、被夸时害羞、被善意调侃时心虚，遇到难题时认真琢磨。普通说话继续只回应眼神，唤醒后才语音聊天。

明确的短句由本地完整句式快判；同一说话人最近两次回应参与变化选择。否定、引用、混合情绪、假设和不确定内容交给模型理解。模型与语音回复共用人格提示词，历史只在当前进程保留，不是长期记忆。

后台表情会组合最多两拍：先有一个短反应，350 毫秒后进入主要眼神，再由固件平滑回到专注。关心直接呈现，不对痛苦先做惊喜表演。每拍复查当前轮次、取消信号和聆听优先级，使用现有鉴权设备协议；`reaction.applied` 与 `reaction.settled` 的 `code` 记录实际眼型。语音聊天直接呈现主要反应，避免过渡等待推迟语音首句。

### 查看大模型收发数据

在“对话记录”点击一条记录的开始时间，展开“大模型收发数据”。每次表情判断、文字回复（包括重试）独立展示请求 JSON 与返回数据，包含实际系统提示词、历史消息、用户消息、模型参数和响应中的用量字段。流式回复额外展示合并正文、按顺序收到的事件及是否完整结束；中断时只显示已收到的部分。

从此版本开始采集，历史记录无法补录。本地快判没有模型请求；语音识别与合成不记录音频请求体。HTTP 鉴权头不落盘，常见密钥字段和密钥字符串会脱敏。单份数据最多保留 32768 个序列化字符，超限明确显示截断。请求失败时保留受限、脱敏后的返回体；应用突然终止时可能只有请求而没有返回。

数据保存在 SQLite v2 的 `model_payloads` 表，与调用记录关联。关闭正文保存也关闭后续模型收发数据保存；“只清理正文”同时清理模型收发数据、保留用量。安装前保留数据库快照；若退回 v1 程序，需同时恢复对应数据库快照。

### 表情名称与眼型预览

当前协议可调用 21 种表情，底层由 25 个基础眼型组成。概览、对话列表、详情和表情选择框显示“英文 · 中文”；列表与详情的名称支持悬停、键盘聚焦或点击预览，Esc 关闭。选择框预览当前选中的表情。预览只在浏览器显示，不发送设备指令。

浮层是黑色圆脸与两只白眼的代表眼型静态图；设备保留平滑过渡、眨眼和眼型编排。轮廓由固件 `EyesModel` 与 `eye_poses.cc` 直接导出，中文名维护在 `config/emotion-labels.json`。修改固件眼型后运行 `node companion/scripts/generate-emotion-previews.mjs`，打包会检查预览与固件是否一致。实际协议及原始模型 JSON 继续使用英文枚举。
