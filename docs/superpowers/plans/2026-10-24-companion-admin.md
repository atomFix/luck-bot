# Companion Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a local SQLite-backed management console with complete per-turn text/results, per-attempt usage/cost/timing and explicit credential reveal.
**Architecture:** A worker owns SQLite behind an asynchronous repository. TurnJournal propagates per-turn context through AsyncLocalStorage to provider adapters, recording attempts before requests and preserving unknown usage after cancellation. Authenticated local UI reads management APIs; device CLI/MCP retain their existing access.
**Tech Stack:** Node22.22.3, TypeScript, node:sqlite worker, native HTML/CSS/JS, existing Swift packaging and Keychain.
**Spec:** docs/superpowers/specs/2026-10-24-companion-admin-design.md

## Global Constraints

- No raw audio, API keys, voiceprint vectors, request headers or complete provider payloads in SQLite/logs/Git.
- Actual supplier cost, estimate, unknown and not-applicable remain distinct; currencies never merged; absent usage is NULL.
- Each actual HTTP retry and TTS task gets its own attempt UUID; before-call persistence failure prevents request.
- Worker queues bounded; database failure visibly suspends new cloud work. Existing pairing and credential-helper bytes preserved.
- UTC wall times for dates; monotonic elapsed times; no inferred historical transcripts.
- Existing wake/voice behavior remains until the separate approved speaker project is implemented.

## Review Focus

1. A cancelled or disconnected turn keeps its partial response and unknown billed attempts (Tasks2/3).
2. Repeated token/cost events and retry attempts cannot duplicate usage or silently lose charges (Tasks1/2).
3. Explicit secret reveal must not leak via ordinary state, database, diagnostics, CLI/MCP or hostile origins (Task4).
4. Database failure before network send blocks billing; worker exits and stale running records recover visibly (Tasks1/3).
5. Pagination/filter/aggregate semantics, unknown costs and decimal mixed currencies stay correct with real persisted rows (Tasks1/5).

## Files and boundaries

- `src/ledger/{types.ts,repository.ts,sqlite-worker.mjs,money.mjs}`: typed async API, worker-only SQL/migrations and decimal amounts.
- `src/ledger/journal.ts`: turn lifecycle, async context and request metering.
- `src/providers/{http,deepseek,minimax-asr,minimax-tts}.ts`: per-attempt telemetry, usage parsing.
- `src/{app,main}.ts`: capture/turn lifecycle, repository lifetime, local-only admin actions.
- `src/local/server.ts`: UI-only management and credential reveal routes.
- `ui/{index.html,app.js,admin.js,style.css}`: sidebar, overview, paged turns/details, billing, configuration.
- `test/{ledger,metering,admin-api,admin-ui}.test.ts`: real SQLite, provider fixtures and authenticated browser API.

### Task 1: Durable repository and decimal accounting

**Interfaces:** `Ledger.open(path):Promise<Ledger>`; `call(op,input):Promise<any>` with operations beginTurn, patchTurn, span, beginAttempt, finishAttempt, list, detail, summary, prices, savePrice, privacy, clear, audit. Worker serializes transactions and returns typed errors; close drains pending writes.
- [ ] RED: real temp database test writes a turn, reopens, asserts text/terminal status; startup converts abandoned running to interrupted. Second test asserts NULL usage, per-currency known totals, pagination/filter and exact decimal estimate.
```ts
const db=await Ledger.open(path);await db.call('beginTurn',{id:'t',mode:'text',started_at:1,user_text:'你好'});await db.close();const reopened=await Ledger.open(path);assert.equal((await reopened.call('detail',{id:'t'})).turn.status,'interrupted');
```
- [ ] Run `cd companion && npx tsx --test test/ledger.test.ts`; Expected missing implementation failure.
- [ ] GREEN: implement worker migrations, 0600 files, version rejection, bounded request queue, validated filters/operations, async calls and exact fixed-point cost helpers; create all schema tables from spec.
- [ ] Run same test and `npm test`; Expected all green; commit `feat: persist admin ledger in SQLite worker`.

### Task 2: Per-request metering and turn context

**Interfaces:** `TurnJournal.run(meta,fn)`, `create(meta)` for capture, `runExisting(id,fn)`; `beginAttempt(kind,provider,model)` returns finish/usage methods, no-op outside a journal. Repository errors propagate before requests.
- [ ] RED: fixture HTTP returns503 then200; assert two attempts, captured usage only on final attempt and no secret; cancelled streaming usage stays unknown, partial reply saved.
```ts
await journal.run({mode:'text'},async()=>{await request(fakeFetch,url,init,signal)});assert.equal((await ledger.call('detail',{id})).attempts.length,2);
```
- [ ] Run `npx tsx --test test/metering.test.ts`; Expected missing journal.
- [ ] GREEN: propagate AsyncLocalStorage; add request attempt hooks and explicit provider response consumption completion; request stream usage where supported, parse usage-only chunks; MiniMax measured audio/characters distinct from reported usage.
- [ ] Verify fixtures for retry/unknown/cache/TTS tasks with test suite; commit `feat: meter provider attempts and usage per conversation`.

### Task 3: Capture and app lifecycle integration

**Interfaces:** Companion receives optional TurnJournal; capture start reserves journal turn before ASR, VAD events/spans attach; text action uses journal; interrupt/disconnect terminates current records. `main.ts` owns Ledger startup/close, app exposes only safe recording-health metadata in state.
- [ ] RED: fake Wire capture no_speech and text/partial cancel produce persisted failed/cancelled turns; storage failure prevents fakeFetch call.
```ts
assert.equal(networkRequests,0);assert.equal((await ledger.call('detail',{id})).turn.status,'failed');
```
- [ ] Run app/ledger tests; Expected current app lacks journal records.
- [ ] GREEN: integrate captures/context, stage spans/results, transcript privacy setting, partial response updates and orderly shutdown; startup interrupted recovery and bounded history.
- [ ] Run full suite + tsc; commit `feat: record voice and text turn lifecycle`.

### Task 4: UI-only admin and secret reveal APIs

**Interfaces:** startLocalServer optional `admin(name,input)`; POST `/api/admin` has existing session/CSRF checks; POST `/api/credentials/reveal` validates provider and audits metadata without value. Main supplies admin handler; daemon actions cannot invoke it.
- [ ] RED: sentinel stored key returned only by explicit reveal; missing Origin/CSRF forbidden, state/database omit sentinel; authenticated list/detail and prices round-trip.
```ts
assert.equal((await reveal({provider:'deepseek'})).value,'sentinel');assert(!JSON.stringify(await state()).includes('sentinel'));
```
- [ ] Run admin/local API tests; Expected reveal/admin paths unsupported.
- [ ] GREEN: bind allowlisted admin operations, validate body and ids, query pagination limits, scope deletion count/confirmation, configuration audit, no-store.
- [ ] Full suite; commit `feat: expose authenticated admin records and credential reveal`.

### Task 5: Management console

**Interfaces:** `window.roundEyesApi` shares existing local session; `admin.js` renders text with DOM textContent; existing control ids retained in configuration view. Sidebar overview, conversations, usage/prices, speaker capability and settings.
- [ ] RED: UI/API fixture test asserts nav targets, detail states and safe text rendering contract; browser integration checks pagination and sentinel reveal/hide without exposing real keys.
```ts
assert(html.includes('data-page="conversations"'));assert(html.includes('id="turn-detail"'));
```
- [ ] Run UI test; Expected old one-page UI missing management navigation.
- [ ] GREEN: add CSS/layout, filters/table/detail/timeline, prices/unknown/currency summaries, recording privacy and cleanup UI; eye toggle clears on timeout/blur/page switch; missing speaker functionality remains honestly unavailable.
- [ ] Test full suite, browser desktop/mobile page, no raw transcript console logging; commit `feat: build local management console`.

### Task 6: Package, review and install

**Interfaces:** bundled worker `.mjs` copied by TypeScript allowJs build; signed app uses unchanged credential helper and SQLite DB under app data. Verification separates tests, browser, local package and real voice/provider data.
- [ ] RED: packaged runtime test checks sqlite worker can create/reopen a private temp DB; package missing worker fails.
- [ ] GREEN: package worker/schema resources, run full tests/tsc/native suites/signature/manifest and private staged secret scan.
- [ ] One fresh whole-branch reviewer, fix Important/Critical with RED→GREEN once; ledger minors and rulings.
- [ ] Preserve previous installation/DB snapshot, install signed package, verify app connects and management persists a bounded authorized live/test turn; no unnecessary paid calls to fill dashboards.
- [ ] Update verification/docs, commit/push user-authorized related work; do not publish binary/notarize/open Internet ports. Speaker implementation follows separate plan, not claimed done here.

## Self-review and execution ruling

Spec coverage mapped: persistence/migration/privacy→1/3; prices/accounting/usage→1/2; cancel/recovery→2/3; credential reveal/API→4; pages/cleanup→5; install/rollback→6. Five Review Focus conditions have owning tests. User explicitly said “开始执行” after written design approval; proceed inline in current chat without another permission loop. Work on clean feature branch in existing checkout, preserve installed daemon until verified upgrade, and do not create an unrequested worktree.
