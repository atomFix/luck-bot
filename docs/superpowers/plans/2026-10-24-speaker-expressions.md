# Speaker-aware Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. Checkboxes track verified tasks.

**Goal:** Recognize enrolled speakers locally and react to ordinary speech without BOOT/wake, while explicit wake remains the only voiced-chat entry.
**Architecture:** Authenticated background PCM stream is independent of conversation turns. Mac VAD segments speech, a native CPU speaker extractor gates cloud ASR/reaction, and per-speaker bounded histories remain separate from chat. All detected utterance outcomes enter the installed SQLite ledger.
**Tech Stack:** Current TypeScript/Swift/ESP-IDF, CPU sherpa-onnx2.0.0 macOS arm64 binding in an isolated inference worker, pinned Chinese CAMPPlus ONNX, existing Silero.
**Spec:** docs/superpowers/specs/2026-10-24-speaker-aware-expressions-design.md

## Global constraints

- Preserve paired identity, NVS/models/partitions and stable round-eye rollback; inspect OTA afresh before app-slot-only flash.
- Unknown/uncertain speaker: no ASR, reaction, reply or TTS calls; matched ambient speech: ASR+reaction only, no reply/TTS.
- Raw audio only in bounded memory; profiles encrypted using Keychain-held key, never in ledger. User must actively enroll3 samples; never enroll automatic TTS as the user.
- Background enabled only explicitly with profiles; default disabled. Wake chat retains current behavior with no profiles, applies matching when profiles exist.
- Host no-speech wait default20s (5–60), endpoint silence default1s (0.6–2), maximum utterance30s; background silence unlimited.
- At most1 active semantic turn+1 pending candidate, max10 ambient cloud turns/minute, minimum3s apart. Wake/manual/critical take priority; cancel/reconnect clears old generations.
- Keep ~25–27FPS, investigate <24; report real physical versus fixture acceptance separately. Never claim current intermittent no_speech/tts_overflow fixed without evidence.

## Review Focus

1. Quiet room for >30s stays bounded and emits no cloud requests; transport gap/lease expiry stops background (Tasks2/3).
2. Voice reply playback cannot enroll itself, trigger background reactions or revive a cancelled turn (Tasks3/4).
3. Wake detector and processed PCM share the same microphone without starving either stream; UI idle must not stop background audio (Task3).
4. Unknown/short/mixed/disabled/deleted profiles cannot leak audio to provider; inference fail closes gate (Tasks1/4).
5. App/package/fresh install include exact model/native licenses and hashes; upgrade preserves keys/pairing/records (Tasks1/5).

### Task 1: Local embeddings and encrypted multi-profile store

**Files:** src/speaker/{extractor.ts,embedding-worker.mjs,profiles.ts}, test/speaker.test.ts, package.json/lock, third_party manifest/licenses, scripts fetch/verify models.
**Interfaces:** `SpeakerExtractor.embed(pcm,signal):Promise<number[]>`, `ready()/close()`; `SpeakerProfiles.list/add/remove/setEnabled/match`, list excludes vectors; store owns10-profile bound, 3-sample consistency/quality, model ID, threshold+runner-up margin.
- [ ] RED: fake embeddings prove multi-person/unknown/margin/deletion and encrypted roundtrip with sentinel Secrets; malformed/mismatched model rejected.
```ts
assert.equal(await profiles.match([0,1]),null);assert(!(await readFile(file,'utf8')).includes('embedding'));
```
- [ ] Run `npx tsx --test test/speaker.test.ts`; expect missing module, then implement minimal store/worker and pass.
- [ ] Official pinned native package/model probe: Chinese CAMPPlus artifact exact hash/license, actual waveform→finite vector, inference CPU latency measured. No real user samples until enrollment UI ready; synthetic/silence is not identity acceptance.
- [ ] Full suite+tsc; commit local inference/profile unit.

### Task 2: VAD segmentation and semantic-only pipeline

**Files:** src/voice/endpoint.ts, src/speaker/segmenter.ts, src/voice/pipeline.ts, corresponding endpoint/pipeline/ambient tests.
**Interfaces:** endpoint takes timeout/silence options and reports sustained onset; `AmbientSegmenter.start(stream)/push(frame)/reset` yields bounded PCM after silence. `VoicePipeline.expression(pcm,turn,speakerId)` invokes ASR/reaction/ACK only and per-speaker bounded history.
- [ ] RED: >60s fake quiet, 500ms pre-roll, speech end,30s cap, gaps and context separation; assert brain.reply/TTS never called.
```ts
assert.deepEqual(calls,['asr','reaction','ack']);assert.equal(cloudCallsForUnknown,0);
```
- [ ] Implement, run endpoint/pipeline tests and full suite; commit.

### Task 3: Board background stream and listening/focus visuals

**Files:** companion/audio.{h,cc}, server.{h,cc}, animation_signals.{h,cc}, eyes_model.cc, vendor audio_service.{h,cc}/application.cc patches, device/client.ts, native/TS tests.
**Interfaces:** owner-scoped `listen {enabled,purpose}` capability ambient_v1, `ambient.start {stream_id}`, binary PCM stream_id independent/turn0; `listen_pose {listening}` changes eyes without stopping capture. Concurrent AFE wake and processing share equal-size feeds (fail closed if incompatible). Stop on session/mode/critical/overflow; voice capture20s wait permits60s opening wait,30s actual speech host cap.
- [ ] RED: native background Capture Feed >60s without terminal flag, IDs/seq; host rejects stale/gapped stream; all emotion→fixed pose10 listening, focus neutral no playlist wandering, manual/critical override.
```cpp
assert(background.Feed(pcm,320,frame,false));assert(frame.data[5]==0);
```
- [ ] Implement stream separate from voice, no silent chat turn increments; audio idle paths preserve active background, wake paths interrupt it; freeze patches/hashes.
- [ ] Run host native suites/TS checks then build firmware; no flash yet. Commit.

### Task 4: App enrollment/background lifecycle and management UI

**Files:** src/speaker/controller.ts, app.ts, main.ts, local/server.ts, settings.ts, ui/admin.js/index.html, tests for authenticated enrollment and controller.
**Interfaces:** UI-only speaker operations list/startCapture/cancel/remove/enable/settings; 3×6s explicit capture through board, model/quality results shown; `speaker-status` safe metadata. Background controller owns generations, queues and rate gate; logs ignored/failed/completed utterances to TurnJournal, speaker_id patch, never persists PCM/vectors.
- [ ] RED: unknown→ignored0calls, matched→expression, wake/manual cancel pending inference, disabling stops board, enroll cancel drops samples; no profiles cannot enable background.
- [ ] Implement actual enrollment UI (no placeholder button), enable/settings and safe audit; no key/vector access through MCP/CLI. Backend setting migration defaults preserve existing pairing/output.
- [ ] Full suite/browser fixture acceptance; commit.

### Task 5: Signed install, limited flash, user enrollment and physical acceptance

**Files:** package scripts/model manifest, verification and handoff/ledger.
- [ ] Package probe includes native extractor worker/model, libraries signed with stable credential helper hash. Unit/native/full tests and one fresh final whole-branch review; Important/Critical fixes single RED→GREEN pass.
- [ ] Inspect actual OTA and capacity, stop monitors/daemon, snapshot current slot privately; flash only confirmed application slot. Preserve known rollback and all NVS.
- [ ] Install signed app preserving DB/Keychain; verify active authenticated stream while silent has no paid calls and FPS≥24. Then ask user to actively enroll three samples through ready UI.
- [ ] After real enrollment, bounded unknown/matched/no-wake/wake tests; record actual ignored/semantic/voice paths and no-reply/TTS for ambient. Hardware acceptance requiring user samples remains pending until supplied, never bypass gate to fake success.
- [ ] Commit/push authorized related source, hashes and numeric verification; leave app usable and background enabled only by user. No public network service.

## Pre-flight/self-review

1→4: profiles model/version and nullable match gates cloud; no raw samples in admin.2→3→4: background stream IDs are not device voice turns.3→4: application state Idle cannot disable processing while background is active.4→5: enrollment requires actual user input, public/synthetic samples only prove model loading and cannot enroll expected person. This is existing approved scope and user explicitly requested finishing it; proceed inline without repeating design permission.
