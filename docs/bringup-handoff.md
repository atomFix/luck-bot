## 2026-10-24 自动语音验收追加

已安装带完整阶段诊断的新版 Mac 应用，51 项主机测试、两组固件原生测试、签名及包清单检查通过。保留配对、Keychain 与应用回滚副本，未刷写固件。

用户授权 Mac 自动播放测试句。前 2 轮完成真实麦克风→ASR→语义→设备表情确认→Mac 播放；第 3 轮唤醒成功但本机检测报告 `no_speech`，在约 126 秒停止测试，无第 3 次识别或模型调用，剩余 7 轮未尝试。10 轮/10 分钟验收未通过。同句独立本地诊断最高语音概率 0.981、连续 12 帧超过阈值，说明该次诊断能检测，但原间歇失败原因仍不明，不应据此调阈值或声称修复。没有保存录音。

结果见 `companion/acoustic-verification.json`。当前应用已恢复连接、输出为 Mac、采集停止；下次先补充失败轮次的 VAD 分数和时序证据，再进行有界复测。板端喇叭、安全矩阵和登录重启验收仍单独保留未验证项。

# 当前状态 — 2026-10-24 已恢复并通过语音冒烟

用户重新接回USB后已完成一轮真实语音→语义表情→Mac声音，用户明确确认“能听到了，眼神也有反应”。当前程序保持连接，输出=Mac。有效源码在 `/Users/luojuan/project/luck-bot`。

核心修正：Mac使用离线Silero VAD判断句尾，板端保留30秒安全上限；修复Swift音频缓冲Data.startIndex越界崩溃，改为有界8缓冲连续播放。主机49项测试、类型检查、打包签名/manifest、C++测试通过；最终识别1354ms、语义808ms、表情ACK121ms。10轮/10分钟与板端喇叭尚未验收。详见companion/verification.json。

以下是保留的昨晚失败历史，不能当作当前仍失败：

# Overnight checkpoint — 2026-10-24

用户明确要求今晚停止调试，准备拔 USB，早上再接。已调用 interrupt + disconnect；确认 connected=false，已保存设备数1，输出为Mac。不要继续录音、刷写、测试或调用付费模型，等用户回来。

## 已确认

- 活跃源码仓库：`/Users/luojuan/project/luck-bot`。GitHub master 已推首版 f18e25d；本轮修复仍是本地未提交修改，尚未推送，不要误称 GitHub 已包含最新修改。
- 原始工作区 `/Users/luojuan/project/v-hard` 保留，ESP-IDF完整环境/本地固件在那里。最新 Companion 模块和两个 audio_service 文件已同步回该环境构建。不要提交 vendor、backups、固件镜像或密钥。
- 应用位于 `~/Applications/Round Eyes Companion.app`，当前Apple Development本地签名（未公证）。已加入NSLocalNetworkUsageDescription/NSBonjourServices，签名、manifest已验证；原生credentials helper字节保持不变，Keychain访问可用。
- 用户手动重开应用并允许本地网络后连接成功。mDNS发现也恢复。不要重置TCC或绕过局域网权限。
- USB + 物理BOOT已配对，授权存于Keychain/NVS。本机保留1个设备；断电不清除。设备 `roundeyes-2884855ca144`，上次IP192.168.31.225，USB `/dev/cu.usbmodem21201`（重连后重查）。
- 已实测文字→DeepSeek语义→板端表情确认→回复，reaction563ms、应用ACK37ms、完整文字1385ms，ACK早于reply首token。Mac输出已选定，板端喇叭未安装。
- 主机42测试及tsc通过；C++协议/配对/会话/音频/层级测试通过；新DC滤波和外部VAD决策测试RED→GREEN。最新补丁已从精确基线应用并校验哈希。

## 未解决，明早从这里开始

- 真实麦克风句尾检测仍失败：静音时VAD一直为speech，录音最终utterance_too_long；未完成任何真实麦克风→ASR→模型→TTS轮次，不能把眼睛进入聆听当成语义反馈成功。
- 原始采样统计（不保存录音）：静音期间绝对幅值均值最低约1858，高于旧阈值600；整体DC均值约4805，标准差约2475，峰值32767。固定阈值无法结束录音。
- 已尝试AFE处理PCM/VAD、把开启AFE移到主循环聆听状态之后、在AFE前加入13Hz左右直流阻断。DC滤波的纯数据测试通过，但这些调整仍未让实机句尾检测通过；不要声称启动顺序是已证实的唯一根因。
- 新增鉴权status字段capture_active/capture_samples/input_vad。最近尝试：capture_samples61440→141120→220800，input_vad持续true，随后到30s上限。说明音频确实在流动，应继续分析安静PCM交流噪声、削顶、I2S采样格式/增益、AFE VAD配置，先测量再选择修正，避免盲目反复刷写。
- 无音频内容落盘、无真实识别文本落日志。观察统计时不要打印API Key、设备令牌、完整私有settings或launch认证URL。
- 10轮/10分钟语音、重连/重启安全矩阵、板端喇叭声学仍未验收。

## 明早恢复

1. 用户接回原USB口，等待启动，检查串口和IP；打开已安装应用，连接并启用Companion。通常不用重配对。
2. 先确认固件/连接与当前status计数，保留目前失败证据，再定位语音检测；不要上来再付费调用或自动要求反复按BOOT。
3. 修复验收后更新文档、检查敏感数据、提交并推送本轮改动。未完成前明确标为pending/failed。

最新镜像SHA256：2605e7516e3390cc29ffa4ab3ae59ad9f011509feab8002dcce9f6c6cdd99a01。只刷已重新读取确认的应用槽；最后为ota_1/0x700000。原有稳定圆眼固件和私有应用槽备份均保留，本机更新过程中产生的.previous归档未删除。
