# Round Eyes LAN Protocol v1

实现：`companion/src/protocol/`、`hardware/esp32-bringup/companion/`。240×240画面仍由本地25眼型渲染；网络不传动画帧。

## 首次信任与会话

设备发布 `_roundeyes._tcp`，HTTPS端口8443。`GET /v1/info`为公开最小身份，不能控制设备。USB管理帧使用一行 `REYE/1 {"op":"pair"}`；主机先发送LF以清理残余输入。只有启动完成、空闲且Wi-Fi已连接时开放30秒确认窗，按一次BOOT确认，不长按。串口响应 `pairing.pending`，确认后 `pairing.complete` 包含公开证书/指纹/设备IP和只返回该次USB的独立控制者凭据。普通日志不得保存这条响应。

电脑保存公开证书和SHA256指纹，凭据只进Keychain。WSS `/v1/session` 使用配对证书为trust anchor，校验设备CN与指纹。首条消息在3秒内发送 `{type:"auth",controller_id,token}`，token不放URL；成功返回带 `boot_id,session_id,uptime_ms,turn_seq` 的status。每次启动重新生成boot_id，每次鉴权生成会话ID。首次确认的电脑拥有status/reaction/voice/owner scope；MCP入口仅暴露status/reaction相关工具。

## 控制封套

```json
{"v":1,"type":"reaction","device_id":"roundeyes-2884855ca144","boot_id":"boot-1","session_id":"session-1","seq":1,"turn_seq":1,"command_id":"command-1","deadline_ms":2000,"payload":{"emotion":"happy","hold_ms":1600,"source":"voice"}}
```

控制JSON最多2048字节。ID长度1–64；seq与turn_seq为uint32，单会话严格递增seq、turn不回退。deadline使用设备uptime域，窗口最大15秒，回绕采用有符号差值判断。Mac握手用往返耗时估算偏差，不使用双方墙上时钟。32条command_id确认缓存，重复指令只回原确认；旧boot、session、turn、seq或过期命令拒绝。

类型：`status,heartbeat,reaction,cancel,release,mode,revoke`。`status/heartbeat/cancel/release`为空payload；mode payload为`{mode:"companion"|"xiaozhi"}`；revoke payload为`{controller_id}`，仅owner。reaction只接收21个已有emotion键、300–3000毫秒hold及`voice/manual/agent` source。显示顺序：系统关键提示、manual、voice、agent、idle；更高层生效时低层请求返回busy。新轮次清理旧轮次层。

ack为 `{type:"ack",command_id,applied_uptime_ms}`。ack由应用/UI边界在应用目标后返回，主机收到ack才生成回复。release/revoke当前会话先发送最终确认，再释放控制权。错误为 `{type:"error",command_id,code}`，常见code：unauthorized、forbidden、busy、expired、stale、format、unsupported、rate、overflow。错误码不会包含凭据或供应商原始响应。

一个活动写会话；心跳5秒、失联15秒释放。设备文本限流与音频分开；文本每秒最多40条突发，音频每秒最多60帧。待发音频最多10项，控制保留额外队列空间；无法保持连续音频则取消本轮。

## 音频

二进制头24字节，小端：magic4=`REYE`，version u8=1，flags u8(bit0=end)，header_len u16=24，stream_id u32，frame_seq u32，turn_seq u32，payload_len u16，sample_rate_khz u8，channels u8=1。payload为PCM16LE偶数字节，最大960字节。上行16kHz，20ms帧640字节；下行24kHz，通常20ms帧960字节。下行序号从0开始，严格有序，断帧/重复/串轮会被拒绝。

设备先发送 `utterance.start`、音频帧（最后一帧end），再发送 `utterance.end`，均携带turn_seq。主机每句最多960000字节/30秒；设备不持整句。开发版句末检测为平均绝对幅度阈值600、已听到声音后连续600ms静音、无声最长10秒；这是待实物调参的能量检测，不宣称具备回声消除或专业VAD效果。

下行由同一stream/turn的PCM与end标记结束；实际codec消费PCM时才发送 `playback.started` 和说话能量。新输入中断时清队列并拒绝旧turn，不把模型输出字数当作说话能量。开发板功放未装时，可在设置中明确选Mac扬声器。

## 模式和范围

新安装默认Companion，断网或TLS失败保留此模式，不自动把录音交给小智云。兼容小智模式显式切换并保留原绑定。Companion启动不依赖小智云版本检查；云端版本提示不会自动覆盖定制应用。更新使用已核验应用槽的固件流程。

局域网之外没有公网入口；未来中继替换传输适配器，仍需同样身份、权限、过期与控制权语义。


## 2026-10-24: host utterance endpoint

Companion capture runs until the host decides that speech has ended (or the existing30-second device safety cap). The Mac evaluates contiguous16kHz PCM with bundled offline Silero VAD, requires sustained speech followed by about768ms silence, and cancels10-second captures with no detected speech without ASR billing. After a local endpoint, the host closes its validated contiguous buffer, sends authenticated `cancel` for that turn and waits for the acknowledgement before ASR. This is an explicit local end operation; transport gaps, stale turns and overflow still reject the utterance. Legacy device end markers remain supported. Audio content and transcripts are not diagnostic fields. No new unauthenticated control command or port was added.
