# Whole-change review package

Plan: docs/superpowers/plans/2026-10-23-round-eyes-companion.md
Spec: docs/superpowers/specs/2026-10-23-round-eyes-companion-design.md
Ledger: companion/companion-progress.md (read all Ruling lines).

No root Git repository. New host source is companion/src, companion/native, companion/scripts, companion/ui, companion/test. Firmware module hardware/esp32-bringup/companion; exact vendor delta hardware/esp32-bringup/patches/companion-v1.9.4.patch, preserved baseline in patches/companion-baseline, source state hashes in patches/companion-source-state.json. Review source, not node_modules/build/vendor dependencies.

Delivery: local Mac installable program (bundled Node/Swift helpers), pinned TLS/WSS after USB+physical BOOT pairing, lease/turn/cancel/arbitration and PCM, DeepSeek reaction-ack-before-reply, MiniMax ASR/TTS, independent registry/profile for DashScope (adapter is explicitly not implemented), local authenticated UI, stdio MCP/CLI, Skill, packaging and rollback. No public relay/notarization/Windows.

Review Focus verbatim:
1. 设备重启但IP不变：旧boot/session消息必须拒绝，证书匹配后重新握手（任务2、4、5）。
2. USB配对确认恰逢断网：不得触发原BOOT清除Wi-Fi分支，不得把凭据打印到串口（任务3）。
3. 用户打断时上一轮TTS仍返回数据：不得闪回旧表情或播放旧音频（任务7、8、9）。
4. 恶意网页访问本机管理服务：Host/Origin/CSRF校验失败，不能写配置、配对或读取密钥（任务10）。
5. 控制与音频同时承压：保持取消和关键系统提示可达，溢出明确取消，不能拼接错误录音（任务4、8、12）。

Current evidence: native Keychain tests, host tests, original eyes host suite, firmware build, first app-slot flash+backup verification, mDNS discovery, first build idle26FPS, real DeepSeek6/MiniMaxTTS1/syntheticASR1 succeeded. New playback/startup fixes build but not reflashed yet; physical BOOT pairing, actual microphone10-turn+10min soak and speaker acceptance remain pending. Current source package needs final rebuild/install.

Safety for reviewer: do not read or print any actual Keychain provider/device values, private backup/NVS files, or runtime launch authentication URL. Do not call real providers, devices, install/uninstall on user paths, or flash. You may run typecheck/host tests; npm test includes real temporary test-only Keychain entries and temp package install workflows. Do not edit files; report actionable Critical/Important with precise paths/lines, Minor separately, and explicitly list declined-to-judge items. Evaluate user-visible behavior and scope rather than stylistic churn. Watch async lifecycle, released-session ack, backend modes, audio-generation cancellation, secrets, packaged native helper paths and packaging verification.
