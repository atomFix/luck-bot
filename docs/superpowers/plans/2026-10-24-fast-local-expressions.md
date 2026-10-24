# Fast Local Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. Tasks follow RED→GREEN.

**Goal:** Reduce semantic expression delay with local streaming ASR and conservative local reaction.
**Architecture:** Extend current ambient capture to feed a bounded local worker during speech; finalize locally, verify speaker, classify simple complete text locally, fall back to DeepSeek only for complex text. Existing cloud ASR config remains selectable.
**Tech Stack:** Existing TS/Node22.22.3/sherpa2.0.0 CPU1 worker, official Chinese small Zipformer CTC int8.
**Spec:** docs/superpowers/specs/2026-10-24-fast-local-expressions-design.md

## Global Constraints
- No unknown/unverified transcript to cloud or persisted; raw audio bounded memory only. Local partial text does not drive semantic emotion.
- ASR <=2streams, PCM<=960k/stream, bounded messages/timeouts/cancellation. No surprise paid ASR fallback.
- Existing speaker threshold/vault/keys/paired firmware preserved; no board flash.
- Quiet600ms default, existing explicit custom values retained unless user chooses fast preset; voice wait20s unchanged; local reaction2500ms minimum and existing listening priority.
- Installed/runtime/hardware acceptance distinct; <1s is a target not a promise.

## Review Focus
1. Negation/multi-clause/third-person/ASR fragments never confidently misclassified locally.
2. Silence/overlong speech/worker failure/pause do not grow queues, leak raw audio or let stale text revive.
3. Unknown speakers may use local CPU but never cloud or persistent text; retries don't create paid fallback.
4. Model licensing/hash/actual bundled Chinese decode work after signed upgrade, keys/vault/DB unchanged.
5. Next speech during finalization, voice/manual priority and transport gaps cancel/reset correct stream while listening remains animated.

### Task1: Conservative local reaction and latency settings
**Files:** voice/fast-reaction.ts,pipeline.ts,local/settings.ts,test/fast-reaction.test.ts,pipeline.test.ts,settings.test.ts.
**Interfaces:** localReaction(text):Reaction|null; pipeline expression accepts final local transcript and local_reactions flag, records local route spans; settings.performance local_asr/fast_reactions defaults false for compatibility.
- [ ] RED clear first-person phrases match; negation/irony/questions/mixed/third-person/quotes defer; prior history remains available to cloud fallback. Pipeline no brain/ASR on local transcript+fast path, complex text still brain, ambient no reply/TTS.
- [ ] Implement+run targeted tests and full suite/tsc, commit.

### Task2: Bounded local streaming ASR runtime
**Files:** voice/local-asr.ts,local-asr-worker.mjs,config/asr-model.json,scripts/fetch-asr-model.mjs,test/local-asr.test.ts,third_party.
**Interfaces:** LocalAsr.ready/start/push/finish/cancel/close/status, result text/model/cpu_ms/finalize_ms; Asr whole-wav adapter for chat. Worker streams<=2, frame byte cap, timeouts, model hashes. Official WAV chunk test recognizes expected Chinese and measures tail latency; cancellation/gap/queue worker failure tests.
- [ ] RED fake worker cap/cancel/stale result/model failure tests, fetch and hash official model/license, implement native online CPU worker and actual known Chinese waveform probe. Run suite+tsc, commit.

### Task3: Ambient integration and management UI
**Files:** speaker/segmenter.ts,controller.ts,app.ts,main.ts,ui/admin.js/index.html,controller/app tests.
**Interfaces:** start event includes pre-roll, frame callback feeds local ASR before final gate; Candidate holds ASR handle/result, profile match gates consumption. pause/gap/ignored/queue supersession cancels corresponding handle. Local status in safe app.state, UI performance settings in authenticated local routes, never expose transcript via MCP/status.
- [ ] RED unknown=>zero cloud/no text; matched uses final local result; cancel/next speech/enrollment/manual cleans correct streams. Update configuration UI with local/cloud selection and600ms preset. Run whole suite+native unchanged smoke, commit.

### Task4: Signed package, review, install and physical latency acceptance
**Files:** packaging/model probes,fast-expression-verification.json,README/progress.
- [ ] Model files+licenses included in dist/config/models; bundled recognizer actual Chinese chunk probe and SQLite reopen pass. Run full suite and fresh whole-branch reviewer once; fix Important/Critical with RED→GREEN.
- [ ] Snapshot settings/vault/SQLite privately, preserve stable credential helper hash, signed host-only install. Explicitly enable approved local fast mode with600ms pause; no new voice enrollment.
- [ ] Ask user one normal simple phrase, confirm local ASR/reaction spans/no provider attempts, physical eye response and measured end-to-visible latency; complex sentence routes DeepSeek; don't claim mixed-speaker/long soak passed.
- [ ] Exact-value5secret source/bundle scan, commit/push existing authorized master. Summarize real evidence and limits.
