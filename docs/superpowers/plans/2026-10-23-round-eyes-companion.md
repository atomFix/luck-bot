# Round Eyes Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 已选择当前会话原生执行；不重新询问执行方式。

**Goal:** 交付可在当前 Mac 安装的常驻程序，让 ESP32 麦克风输入经 MiniMax ASR、DeepSeek 语义理解后先改变圆眼，再生成回答并经 MiniMax TTS 播放，同时提供已授权的 CLI/MCP 控制。

**Architecture:** Mac 运行常驻 TypeScript 核心，薄 Swift 启动器及凭据 helper 使用系统 Keychain。ESP32 提供经 USB 首次信任引导、固定证书身份的 HTTPS/WSS 服务；协议、音频和动画各自隔离。先交付可测的文字控制子系统，再接完整语音，最后安装与实机回归；这三个里程碑都属于首版交付。

**Tech Stack:** Node 22.22.3 arm64（随包携带）、TypeScript 5.9.3、ws 8.18.3、bonjour-service 1.3.0、@modelcontextprotocol/sdk 1.20.2、zod 3.25.76、tsx 4.20.6；Swift 6.4/Security/AVFoundation；ESP-IDF 5.5、现有小智 v1.9.4 C++/LVGL。首次安装前核对包版本可用性并生成精确 package-lock.json；若版本不可获得，记录原因和替代精确版本，不静默使用浮动版本。

**Spec:** [已确认设计](../specs/2026-10-23-round-eyes-companion-design.md)

## Global Constraints

- 首版按完整句子反馈，不要求尚未说完就理解并改变表情。
- 当前固定黑圆脸、白眼、25 眼型、21 情绪与连续动画保留，网络只发送目标和事件，不传动画每一帧。
- 上行默认PCM16LE/16kHz/单声道，20ms一帧约640字节。下行PCM16LE/24kHz/单声道。
- 电脑持有本轮最多30秒PCM，约960KB，封装WAV上传ASR。
- 控制者租约：心跳5秒、失联15秒释放；同一设备同一时刻只有一个写控制者。
- 显示优先级：系统关键提示 > 主人显式临时手动控制 > 当前语音轮次的语义反应 > 外部Agent任务状态 > 待机。
- API Key保存在macOS Keychain；通过原生Security接口/安全IPC访问，不把秘密放入进程命令行、日志或前端持久化存储。
- 默认不持久化原始录音和完整对话。
- 现有稳定应用 SHA256 为 a3f06cd723d384316bda9e55f46df0113434a417ecb07dc0fa356ef73e467ba2；只刷实时确认的应用槽，保留NVS、OTA、模型及引导分区。
- 无 Git 根仓库，不初始化仓库或伪造提交。每任务保存 scoped 文件清单、校验结果和 SHA256 到 companion-progress.md；固件修改由独立 companion 补丁记录，保留原 round-eyes 补丁。
- 不开放公网端口；公网中继、Windows、公开签名公证发布属于后续范围。板端喇叭验收独立于 Mac 播放。

## Review Focus

1. 设备重启但IP不变：旧boot/session消息必须拒绝，证书匹配后重新握手（任务2、4、5）。
2. USB配对确认恰逢断网：不得触发原BOOT清除Wi-Fi分支，不得把凭据打印到串口（任务3）。
3. 用户打断时上一轮TTS仍返回数据：不得闪回旧表情或播放旧音频（任务7、8、9）。
4. 恶意网页访问本机管理服务：Host/Origin/CSRF校验失败，不能写配置、配对或读取密钥（任务10）。
5. 控制与音频同时承压：保持取消和关键系统提示可达，溢出明确取消，不能拼接错误录音（任务4、8、12）。

---

## 文件与模块边界

所有新电脑代码置于 `companion/`。下列文件表为任务的精确所有权，测试同名 `.test.ts` 放在 `companion/test/`；固件纯逻辑测试放在 `hardware/esp32-bringup/tests/companion/`。

| 任务 | 创建或修改的文件（相对于工作区） | 职责 |
| --- | --- | --- |
| 1 | companion/{package.json,package-lock.json,tsconfig.json}; companion/src/{contracts.ts,diagnostics.ts}; companion/test/{contracts,diagnostics}.test.ts; companion/native/{CredentialHelper.swift,CredentialHelperTests.swift}; companion/scripts/build-native.sh | 数据合同、脱敏诊断、Keychain |
| 2 | companion/src/protocol/{schema.ts,clock.ts,audio-frame.ts}; companion/test/{protocol,clock,audio-frame}.test.ts; companion/test/fixtures/protocol.json; hardware/esp32-bringup/companion/{protocol.h,protocol.cc}; hardware/esp32-bringup/tests/companion/protocol_test.cc; docs/round-eyes-protocol-v1.md | 跨端协议与黄金fixture |
| 3 | hardware/esp32-bringup/companion/{identity.h,identity.cc,pairing.h,pairing.cc}; hardware/esp32-bringup/tests/companion/pairing_test.cc; companion/src/device/usb-pair.ts; companion/test/usb-pair.test.ts | NVS身份、可信USB、按键确认 |
| 4 | hardware/esp32-bringup/companion/{session.h,session.cc,server.h,server.cc}; hardware/esp32-bringup/tests/companion/session_test.cc; hardware/esp32-bringup/scripts/build-companion-host.sh | TLS/WSS、授权、租约 |
| 5 | companion/src/device/{discovery.ts,pinned-transport.ts,client.ts}; companion/test/{discovery,device-client}.test.ts | Mac设备发现与连接 |
| 6 | companion/src/providers/{deepseek.ts,prompts.ts}; companion/test/deepseek.test.ts; companion/test/fixtures/deepseek.json | 结构化语义与回复 |
| 7 | companion/src/voice/{turn.ts,pipeline.ts,history.ts}; companion/test/{pipeline,history}.test.ts | 先表情后回答、取消、上下文 |
| 8 | hardware/esp32-bringup/companion/{audio_bridge.h,audio_bridge.cc,mode.h,mode.cc}; hardware/esp32-bringup/tests/companion/audio_test.cc; companion/src/voice/{pcm.ts,utterance.ts}; companion/test/utterance.test.ts | 音频桥、VAD、模式仲裁 |
| 9 | companion/src/providers/{minimax-asr.ts,minimax-tts.ts,registry.ts,config.ts}; companion/src/voice/{output.ts,mac-output.ts}; companion/native/AudioOutput.swift; companion/test/{minimax,output,provider-registry}.test.ts; companion/test/fixtures/{minimax-asr.json,minimax-tts.json} | ASR/TTS、播放 |
| 10 | companion/src/local/{server.ts,auth.ts,routes.ts,settings.ts}; companion/src/main.ts; companion/ui/{index.html,app.js,style.css}; companion/test/{local-api,settings}.test.ts | 常驻程序、本机界面 |
| 11 | companion/src/integrations/{cli.ts,mcp.ts,daemon-client.ts}; companion/test/integrations.test.ts; companion/skill/round-eyes/SKILL.md; companion/config/mcp.example.json | CLI/MCP/Skill |
| 12 | hardware/esp32-bringup/scripts/{apply-companion-patch.sh,update-companion-patch.sh,build-companion-firmware.sh,verify-companion.py}; hardware/esp32-bringup/patches/companion-v1.9.4.patch; companion/scripts/{smoke-providers.ts,smoke-device.ts}; companion/verification.json | 构建、受限真实调用、刷写与压力验证 |
| 13 | companion/native/Launcher.swift; companion/scripts/{package-macos.sh,install.sh,uninstall.sh}; companion/{README.md,companion-progress.md}; output/round-eyes-companion/ | 安装包、启动项、回滚和验收 |

固件集成需修改以下既有文件，仅在对应任务范围内：`hardware/esp32-bringup/vendor/xiaozhi-esp32-1.9.4/main/{CMakeLists.txt,application.h,application.cc,audio/audio_service.h,audio/audio_service.cc,boards/bread-compact-wifi/compact_wifi_board.cc}` 与 `hardware/esp32-bringup/sdkconfig.gc9a01.defaults`。执行前确认实际类签名；新增服务对象从独立 `companion/` 编译，不把实现堆入 application.cc。角色与字幕开关沿用现有 Kconfig。

## 共享接口（任务间合同）

```ts
type Reaction = { emotion: Emotion; hold_ms: number };
type Turn = { id: number; signal: AbortSignal };
type EventMeta = { event: string; turn?: number; duration_ms?: number;
  bytes?: number; code?: string; model?: string };
interface Secrets {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}
interface DeviceClient {
  status(signal: AbortSignal): Promise<DeviceStatus>;
  react(value: Reaction, turn: Turn, source: 'voice'|'manual'|'agent'): Promise<Applied>;
  play(frame: AudioFrame, turn: Turn): Promise<void>;
  cancel(turn: number): Promise<void>;
  release(): Promise<void>;
}
interface Brain {
  reaction(text: string, history: Message[], signal: AbortSignal): Promise<Reaction>;
  reply(text: string, history: Message[], signal: AbortSignal): AsyncIterable<string>;
}
interface Asr { transcribe(wav: Uint8Array, signal: AbortSignal): Promise<string> }
interface Tts { synthesize(text: string, signal: AbortSignal): AsyncIterable<Uint8Array> }
type SpeechProvider = 'minimax' | 'dashscope';
type SpeechProfile = { provider: SpeechProvider; endpoint: string; model: string;
  voice_id?: string; region?: string; credential_ref: string };
type SpeechConfig = { asr: SpeechProfile; tts: SpeechProfile };
type SpeechCapability = { asr: boolean; tts: boolean;
  state: 'unverified'|'available'|'unsupported'|'not-implemented' };
interface SpeechAdapter {
  capabilities(profile: SpeechProfile, signal: AbortSignal): Promise<SpeechCapability>;
  createAsr(profile: SpeechProfile, secrets: Secrets): Asr;
  createTts(profile: SpeechProfile, secrets: Secrets): Tts;
}
interface AudioOutput {
  play(pcm: Uint8Array, turn: Turn): Promise<void>;
  cancel(turn: number): Promise<void>;
}
type Message = { role: 'user'|'assistant'; content: string };
type Applied = { command_id: string; applied_uptime_ms: number };
type DeviceStatus = { device_id: string; boot_id: string; mode: 'companion'|'xiaozhi';
  lease: 'free'|'ours'|'busy'; uptime_ms: number };
type AudioFrame = { stream_id: number; frame_seq: number; turn_seq: number;
  end: boolean; pcm: Uint8Array };
```

`Emotion`从现有 `character/eye_poses.cc` 提取精确21键为常量并用fixture核对，不重新命名。JSON控制封套为 `{v:1,type,device_id,boot_id,session_id,seq,turn_seq,command_id,deadline_ms,payload}`；`deadline_ms`为设备uptime域，uint32回绕以有符号差值比较（有效窗口≤15秒）。控制文本≤2048字节，单音频payload≤960字节，设备单连接。WSS首条鉴权在3秒内完成，凭据不进URL，比较使用恒定时间函数。

二进制音频头24字节、小端：magic `REYE`4字节；version u8=1；flags u8（bit0=end）；header_len u16=24；stream_id u32；frame_seq u32；turn_seq u32；payload_len u16；sample_rate_khz u8（16或24）；channels u8=1。PCM payload长度须为偶数，与方向协商格式一致；轮次必须属于当前已认证会话。设备队列上行10帧、下行20帧，超限取消；host持句上限960000字节。

## 里程碑A：可信连接和文字语义控制

### Task 1: 凭据、项目基础和不含内容的诊断

**Interfaces:** 产生上方`Secrets`、`EventMeta`和数据合同；helper只收stdin长度前缀JSON、stdout返回结果，stderr不含输入。Keychain service固定`com.roundeyes.companion`，account为`provider/minimax`、`provider/dashscope`、`provider/deepseek`或`device/<id>/<controller>`。

- [ ] 阅读TDD的 `writing-good-tests.md`；创建上述项目配置，`npm test`固定为`tsx --test test/*.test.ts`，`npm run check`固定为`tsc --noEmit`。
- [ ] 编写会失败的脱敏/凭据测试，先跑`cd companion && npm test -- --test-name-pattern=credential`并确认失败来自缺少实现，不是坏命令；若runner不透传过滤，直接`npx tsx --test test/diagnostics.test.ts`。

```ts
test('credential fields and utterance content never reach diagnostics', () => {
  const lines: string[] = [];
  logEvent(lines.push.bind(lines), {event:'asr.done', bytes:640,
    api_key:'sentinel-secret', transcript:'private words'} as EventMeta);
  assert.deepEqual(JSON.parse(lines[0]), {event:'asr.done', bytes:640});
});
```

- [ ] 实现`logEvent(write, meta)`只拷贝EventMeta白名单；Swift通过`SecItemAdd/Update/CopyMatching/Delete`，禁止`security ... -w <secret>`命令行方案。用专用测试account执行set/get/delete，包含错误输入和超大消息拒绝，运行`swiftc`及原生测试观察通过。
- [ ] 在凭据实现验证后，用临时进程内存/stdin安全IPC导入已提供凭据；若上下文无法安全取得，提供本机密码输入框由用户填入，不要求再次发聊天。只报告“已保存/未配置”，不回显，不写测试fixture。
- [ ] 跑`npm test && npm run check`，在ledger记文件清单、测试结果，确认源文件/构建输出没有sentinel以外真实凭据。

### Task 2: 双端协议与黄金样本

**Interfaces:** TS导出`parseControl(input: unknown): Control`、`encodeAudio(frame: AudioFrame): Uint8Array`、`decodeAudio(bytes: Uint8Array): AudioFrame`、`isExpired(now: number, deadline: number): boolean`、`toDeviceDeadline(hostNow: number, sample: {host_ms:number,device_ms:number,rtt_ms:number}, ttl: number): number`；`Control`即共享接口节的JSON封套，payload按type判别。C++提供`ValidateEnvelope`与`DecodeAudio`同义结果。

- [ ] 将有效JSON、24字节音频头、截止时间回绕样本写入`companion/test/fixtures/protocol.json`；TS和C++读取同一黄金样本。测试体必须包含：

```ts
const malformed = new Uint8Array(24 + 961);
malformed.set([82,69,89,69,1,0,24,0]);
new DataView(malformed.buffer).setUint16(20, 961, true);
assert.throws(() => decodeAudio(malformed));
assert.equal(isExpired(0xfffffff0, 0x00000010), false);
assert.throws(() => parseControl({v:2}));
```

- [ ] 运行`npx tsx --test test/protocol.test.ts test/clock.test.ts test/audio-frame.test.ts`及新建`build-companion-host.sh`，观察缺少协议实现的RED。
- [ ] 实现Schema、头解析和uint32差值判断；以源码实际21键完成Emotion schema，所有未知字段/类型给明确错误码，不把未知emotion直接喂给UI。
- [ ] 重跑两端测试到GREEN；写`docs/round-eyes-protocol-v1.md`，固定错误码`unauthorized/forbidden/busy/expired/stale/overflow/format/unsupported`和鉴权、撤销、租约消息；记录ledger。

### Task 3: 板端身份与USB配对

**Interfaces:** C++ `Pairing::Begin(request, now)`、`ConfirmBootClick(now)`、`Expire(now)`；`IdentityStore`存设备证书/私钥和最多4控制者记录。TS `pairUsb(path, signal): Promise<{device_id:string, fingerprint:string, controller_id:string}>`，秘密直接写Secrets，不返回UI。

- [ ] 写纯逻辑测试：未进入配对窗口的BOOT按原行为；已就绪空闲+USB请求进入30秒窗；窗口内确认配对；超时/启动中/断网拒绝；确认只消费此按键，Wi-Fi重置调用计数保持0。运行host脚本观察RED。
- [ ] 实现独立NVS命名空间`re_companion`，先测容量；生成P-256自签名证书，持久保存，不在每次启动重建。USB前缀`REYE/1 `、长度≤2048、禁回显；4槽满时明确拒绝，撤销后可新增。
- [ ] USB明确输出公开身份；确认后仅通过USB返回新建32字节随机controller token。首次配对给予owner权限，后续新增须USB物理确认或已有owner管理；不允许模型提权。
- [ ] 测试伪串口逐字节/混入日志/超长帧/取消；使用系统串口helper配置raw模式及DTR/RTS保持，避免依赖未验证的Node原生扩展。扩展`CredentialHelper.swift`的串口子命令，不让秘密进入日志。
- [ ] host测试通过，保存补丁基线和ledger；本任务不刷板，实物确认并入任务12。

### Task 4: 固件加密会话、租约和显示仲裁

**Interfaces:** `Session::Authenticate/Accept/Heartbeat/Release/Revoke`全部由注入单调时钟驱动；输出窄`Action`对象，在`Application::Schedule`执行。`server`使用IDF `esp_https_server` WebSocket，mDNS `_roundeyes._tcp`。

- [ ] 写session测试矩阵并运行RED：旧boot_id、旧session、旧turn、重复command_id（仅回原ack）、deadline、缺scope、错误token、两控制者busy、15秒过期、撤销立即断开；重启更换boot_id后旧包不能生效。
- [ ] 实现固定容量：一活动连接、32条command幂等缓存、控制20条/秒（burst40）、音频60帧/秒、握手3秒、未认证只允许auth/close；拒绝额外连接而非额外TLS观察者。
- [ ] 在session之外实现显示优先级与各层到期清理；测试系统关键提示覆盖所有层，manual到期恢复当前voice，旧voice不得复活；网络任务只排Action，不持LVGL锁等待。
- [ ] 增加上行/下行队列压力测试：控制取消不排在音频大块后，overflow释放当前轮流；跑host测试GREEN。TLS初始化失败明确保留原兼容模式，不能回退到无鉴权HTTP。
- [ ] 在构建默认中启用HTTPS/WSS与mDNS所需配置，读取实际证书/连接堆预算，记录ledger。设备实现具备状态/reaction/voice/owner-admin四种scope。

### Task 5: Mac发现、证书固定与DeviceClient

**Interfaces:** `discover(signal: AbortSignal): AsyncIterable<DeviceAdvertisement>`，`DeviceAdvertisement={device_id:string,host:string,port:number,protocol:1}`；`connect(pairing: {device_id:string,host:string,port:number,fingerprint:string,controller_id:string}, signal: AbortSignal): Promise<DeviceClient>`；凭据从Secrets读取。全部客户端操作经同一个常驻连接/租约，CLI不另开写租约。

- [ ] 写本机TLS测试服务器；观察证书A成功、同IP证书B拒绝、正确证书旧boot重连重新握手、错误凭据拒绝、lease busy均失败到预期状态；测试先RED。
- [ ] 实现按USB提供的证书SHA256验证的专用TLS transport：使用对应证书作为trust anchor、校验设备身份，禁止全局`NODE_TLS_REJECT_UNAUTHORIZED=0`。mDNS地址只作候选，USB身份才是授权依据；支持手动LAN地址。
- [ ] 实现5秒心跳、15秒租约期限和设备uptime映射，重连指数退避上限10秒；未ack不得报告Applied；disconnect取消本地所有pending命令。
- [ ] 跑device-client/discovery测试GREEN，包含IPv4变化、IPv6地址格式、发现重复项、取消发现及超时；记录ledger。

### Task 6: DeepSeek语义及对话provider

**Interfaces:** `DeepSeekBrain implements Brain`，使用`deepseek-flash`和`thinking:{type:'disabled'}`；`reaction`只接受Schema有效Reaction，`reply`返回流式文字。

- [ ] 写fixture fetch/SSE测试并跑RED：分片UTF-8、JSON损坏、未知emotion、越界hold、空响应、401/402不重试、429/5xx最多一次且服从总预算、signal取消关闭流。

```ts
test('untrusted model output cannot choose device or execute tools', async () => {
  const brain = new DeepSeekBrain({key:'fixture-only', fetch: async () =>
    Response.json({choices:[{message:{content:
      '{"emotion":"shell","hold_ms":999999,"url":"bad"}'}}]})});
  const signal = new AbortController().signal;
  assert.deepEqual(await brain.reaction('你好', [], signal),
    {emotion:'neutral', hold_ms:1200});
});
```

- [ ] 实现短语义JSON请求（≤128输出token、8秒总预算）与回复流（≤512输出token、20秒预算）。每轮最多两次逻辑请求；每次最多一次瞬时失败重试，即最多4次HTTP尝试，重试仍计入预算和费用诊断。已输出回复片段后不重试，防止重复播报。
- [ ] prompts约束关心式反应、否定/反讽/上下文指代；将模型结果当不可信数据；回复没有执行工具能力。通过fixture测试与typecheck，真实语义质量在任务12记录，不把fixture冒充模型理解测试。
- [ ] 诊断仅记模型名、请求数/usage/耗时和错误码，日志不含文本/Authorization；记录ledger。

### Task 7: 轮次、先眼神后回答与上下文

**Interfaces:** `VoicePipeline.text(text): Promise<void>`、`VoicePipeline.audio(pcm): Promise<void>`、`interrupt(): Promise<void>`；`TurnManager.start(): Turn`立即abort前轮，`isCurrent(id)`在每个await后和流回调检查。

- [ ] 用可控Promise写真实时序测试，观察RED：`reaction -> device.react -> ack -> reply -> tts -> play`；缺ack时reply不得启动；新输入到达后上一轮迟到reaction/TTS不得生效。

```ts
await pipeline.text('今天我很难过');
assert.deepEqual(trace.slice(0,4), ['brain.reaction','device.react','device.ack','brain.reply']);
assert.equal(trace.includes('old-turn-play'), false);
```

- [ ] 实现注入Brain/Device/Asr/Tts/Output的pipeline，不创建每轮CLI进程。历史仅内存保存最近8轮且≤12000字符，删除最早完整轮；空ASR不发模型，失败不写半轮history。
- [ ] 表情ack最多2秒；超时以设备问题结束该轮，不虚报显示；请求错误、interrupt、lease失效均清待播音频/表情持有，保留可恢复状态。
- [ ] 跑pipeline/history测试GREEN；覆盖清空历史、超长文字≤4000字符、上下文不混设备及新轮取消时双请求总数受限；记录ledger。

## 里程碑B：开发板麦克风到语义和语音的完整链路

### Task 8: 音频桥与显式模式切换

**Interfaces:** `UtteranceBuffer.push(AudioFrame)`、`finish(): Uint8Array`、`cancel()`；C++ AudioBridge在现有音频任务边界收PCM和VAD事件，网络只搬固定帧。mode切换先停止旧后端、清队列，再启用新后端。

- [ ] 写host音频测试RED：断帧/重复/格式不符/30秒超限/队列满都取消；同一轮640字节帧按序形成完整PCM；旧turn下行帧立即拒绝。
- [ ] 在实际PCM边界增添Companion tap，不把Opus误当PCM；复用现有VAD/唤醒事件，记录句末检测参数，最长30秒触发明确超限状态。无网络时停止上传，禁止自动转送小智。
- [ ] 实现下行PCM经当前codec/音频任务播放，实际消费PCM才驱动现有`animation_signals`包络；interrupt清除ring与codec待播，停止信号立即生效。
- [ ] 写模式测试：Companion下原小智STT/LLM不得改表情或上传；显式切回xiaozhi才恢复；切换保留旧Wi-Fi/绑定配置。运行host tests及现有`build-eyes-host.sh`至GREEN。
- [ ] 设备队列与内存限额固定并记录；确认canvas仍61440字节、无渲染算法/引脚变化，保存ledger。

### Task 9: 可替换语音接口、MiniMax适配及两种播放位置

**Interfaces:** `MiniMaxAsr implements Asr`、`MiniMaxTts implements Tts`；`wav16k(pcm): Uint8Array`；`DeviceOutput`及`MacOutput implements AudioOutput`，播放位置必须设置显式选择。

- [ ] 写provider fixture测试RED：WAV头sampleRate16000/mono/16bit、multipart模型`asr-1.0`；TTS未task_started不得发送正文；hex音频分块正确解码为偶数字节PCM；task_failed/断流/鉴权失败结束本轮，迟到旧turn不播放。
- [ ] 实现`POST /v1/speech_to_text` WAV文件上传；识别预算15秒，认证/余额失败不重试；空文本返回空。遵循实际官方响应字段fixture，不猜测替代字段。
- [ ] 先写registry测试并观察RED：ASR/TTS能独立选profile；未注册适配器返回`not-implemented`；未验证endpoint不能标available；切换时abort旧轮，迟到PCM被丢弃；Keychain引用与provider不一致拒绝；跨域重定向拒绝，Authorization不会泄漏给另一个endpoint。实现`registerSpeechAdapter(name: SpeechProvider, adapter: SpeechAdapter): void`与`resolveSpeech(config: SpeechConfig, secrets: Secrets): {asr: Asr, tts: Tts}`，语音pipeline只使用Asr/Tts，不导入MiniMax类。
- [ ] 将用户给出的阿里base URL写入非秘密DashScope profile。保留模型、音色、区域、独立ASR/TTS endpoint设置；未取得实际部署支持的模型与协议前不编造默认模型/请求路径。此次先交付可替换接口与配置；DashScope适配器及真实联调以能力核验为前提，verification中单列pending，不能声称已支持真实调用。
- [ ] 实现MiniMax WebSocket task_start/task_started/task_continue/task_finish状态机，默认`speech-2.8-turbo`、24kHz mono PCM、系统voice_id可配；无权限则报告具体模型/权限问题，不自动换收费模型。
- [ ] 实现按句切分回复（句末标点或120字符），TTS串行、待合成句≤4，输出背压，超限取消。Mac原生helper用AVAudioEngine播放PCM，通过IPC返回实际开始与结束；设备以消费PCM事件返回playback.started。
- [ ] 运行`npx tsx --test test/minimax.test.ts test/output.test.ts test/utterance.test.ts`、native播放fixture验收与typecheck；真实API仅在任务12有界调用，记录ledger。

## 里程碑C：本机产品入口、安装和硬件验收

### Task 10: 常驻服务和本机管理页面

**Interfaces:** `startLocalServer({secrets,pipeline,devices}): Promise<{url,close}>`；绑定127.0.0.1随机空闲端口。Unix socket `~/Library/Application Support/Round Eyes Companion/control.sock`权限0600供CLI；非秘密设置JSON0600，仅含设备公开身份、模型/音色、模式及播放位置。

- [ ] 写local-api测试RED：外部Host、恶意Origin、缺CSRF的POST全403；GET不能改变状态；秘密set后GET仅返回configured布尔值；无效配置不覆盖有效配置；请求体≤8192。
- [ ] 实现启动随机session和CSRF、HttpOnly/SameSite=Strict Cookie；原生启动器用一次性bootstrap片段打开页面，前端兑换后清URL，token不用localStorage。所有变更检查session/Host/Origin/CSRF；CORS默认关闭。
- [ ] 实现设备发现/USB配对/物理确认引导、连接状态、provider密码输入、ASR/TTS独立服务商与endpoint/模型/音色设置、DashScope能力状态、xiaozhi/companion模式、播放位置选择、文字语义测试、诊断耗时及usage；不显示不存在的公网开关。
- [ ] 使用简单原生HTML/CSS/JS，界面中文，后台实际状态驱动；页面刷新不会启动第二租约。测试恶意网页及CLI socket权限，跑local-api/settings tests与typecheck到GREEN。
- [ ] 在本机浏览器实测设置持久化、清空Keychain凭据、离线/余额错误、语义文字→真实设备；保存脱敏界面截图和ledger。

### Task 11: CLI、stdio MCP和可安装Skill

**Interfaces:** CLI子命令`discover/pair/status/react/say/release`通过daemon-client访问同一服务；MCP工具`list_devices/get_status/set_reaction/semantic_input`只暴露已授权设备。`pair`仅CLI/本机主人界面，MCP无配对/管理/读取凭据工具。

- [ ] 写integration测试RED：未知设备拒绝、直接reaction不额外调用DeepSeek、MCP输入越权/超长/未知emotion拒绝、进程stdout只有MCP消息，diagnostics在stderr仍脱敏。
- [ ] 使用固定SDK实现stdio工具Schema，scope仅status/reaction；`semantic_input`默认只产生语义眼神，不开启voice scope或读取麦克风，明确参数可请求回答文本但不能隐式播放。释放只释放调用者的临时manual/agent层，不能撤销主人权限。
- [ ] Skill写明何时选已授权设备、状态/思考/完成的映射、离线处理、不读取凭据；提供绝对安装路径变量的mcp.example.json及CLI help。按skill-creator/writing-skills规则读技能后创建，不额外发布或安装给第三方。
- [ ] 运行integration tests到GREEN，实际stdio客户端调用list/status/react，确认控制者只有daemon一个；记录ledger。

### Task 12: 固件构建、受限真实调用和实机验证

**Interfaces:** `verification.json`每项含`status:passed|failed|pending`、命令/时间、artifact、实测数据；未完成板端声学或公众发布必须pending，不写整体全通过。

- [ ] 扩展固件构建脚本使用独立build-companion目录；补丁从既有圆眼状态增量生成，可重复apply检查。先跑所有host tests及现有眼型像素/625transition测试，再构建角色on、角色off、字幕on组合。
- [ ] 检查稳定镜像hash和私有备份存在，重新识别串口；停止串口monitor，读取实际OTA选择和分区，确认目标应用槽容量。新固件输出为`firmware/xiaozhi-1.9.4-s3-companion.{bin,elf,sdkconfig}`，不覆盖稳定圆眼镜像。
- [ ] 只写确认的应用槽，禁止erase_flash或重写分区/NVS/model；启动失败用已确认稳定镜像回写同槽，恢复当前OTA语义，留boot日志。监控不切DTR/RTS，不把配对USB输出记入日志。
- [ ] 实机USB配对、证书pin、错误token、撤销、二控制者busy、15秒失联释放、断网按键不清Wi-Fi、重启旧boot拒绝，逐项验收。
- [ ] 真实provider冒烟明确限额：DeepSeek最多12次请求（6条语义/上下文用例），ASR最多2段≤5秒人工输入，TTS最多2句≤40字；账户无权限立即标failed并停止该provider调用，不循环重试。语义覆盖“我没有不开心”、玩笑、前文指代、难过求安慰、含糊、普通问候；记录实际结果而非预定表情断言。
- [ ] 在语音基本通过后做10轮≤10秒语音、10分钟运行：单独记录VAD结束/ASR/语义/设备ack/首token/TTS首音频/实际播放时间，计算p50/p95；记录FPS、最长更新、堆低水位、重启/看门狗。目标保持现有25–27FPS区间；低于24FPS或音频不连续则调度/队列排查后重验。
- [ ] 中途打断LLM/TTS、拔网线/断Wi-Fi、音频溢出、关键提示覆盖、模式切回小智；确认旧内容不复活。按供应商结果如实记录延迟与费用，不宣称零延迟。
- [ ] 若功放未安装，用户显式选择Mac播放，板端喇叭继续pending；不阻塞其余可验证交付。完整回滚步骤与构建hash写入verification和ledger。

### Task 13: Mac本机安装、卸载与整体验收

**Interfaces:** `Round Eyes Companion.app`包含固定Node运行时、编译JS、Swift launcher/helper/UI；`round-eyes` CLI wrapper共用安装实例。安装位置`~/Applications`，数据在`~/Library/Application Support/Round Eyes Companion`，LaunchAgent只在用户启用登录启动时创建。

- [ ] 写包清单检查先RED：应用缺运行时/权限错误/残留真实secret/路径硬编码工作区均失败；安装脚本先验证manifest/hash，再原子替换，保留上一版可回滚。
- [ ] `package-macos.sh`构建Swift、tsc产物、仅生产依赖与Node二进制，生成manifest及SHA256；本机ad-hoc签名明确标记，不能声称Developer ID签名/公证。输出`output/round-eyes-companion/RoundEyesCompanion-macos-arm64.zip`及源码/协议/固件索引。
- [ ] 实际从安装目录启动，测试首次配置、登录启动开关、退出重启不重复后台进程、升级保留配对、CLI/MCP可用。卸载默认保留Keychain，提供明确`--delete-data`和独立凭据删除选项；不修改其他应用凭据或固件。
- [ ] 调用verification-before-completion与requesting-code-review技能，进行一次fresh全量review（技能要求时允许review子agent）；修复发现后只重跑受影响检查及必要回归，保存验证证据。
- [ ] README写安装/配置、模型云端边界、MCP/Skill、USB配对、模式切换、诊断、凭据删除、固件及应用回滚；交付报告逐项区分passed/failed/pending和Mac播放/板端播放，不自动push、公开发布或部署中继。

## 自检与执行顺序

- 设计1–4/10：任务1、5、7、10、11、13；设计5–6：任务6、7、9、12；设计7–8：任务2–5；设计9：任务8–9；设计11：只保留传输合同，不实现公网；设计12–13：任务12–13及明确pending项。
- 五个Review Focus均已落实到对应任务失败用例；共享接口集中定义，后续任务不得自行另造凭据、租约或情绪协议。
- 依赖顺序：1→2→3→4→5→6→7→8→9→10→11→12→13。执行中先RED再最小实现再GREEN，任务ledger记录不冒充Git提交。
- 计划评审通过后在当前会话执行，不再次询问执行方式；实际账户权限、TLS资源和扬声器状态以现场证据为准。

## 2026-10-23 追加范围确认

用户要求为 MiniMax 的 ASR/TTS 保留 DashScope 切换接口，已纳入任务1、9、10和共享合同。当前只更新设计及计划，尚未创建程序适配器、保存阿里凭据或调用该地址。DashScope接口预留与实际可用验收分别记录；ASR/TTS供应商切换不影响板端PCM协议及DeepSeek语义链路。
