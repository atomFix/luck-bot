# SDD ledger — plan: docs/superpowers/plans/2026-10-24-companion-admin.md
2026-10-24: User approved written admin design and explicitly requested execution. Inline implementation in existing clean checkout on feat/companion-admin. No unrequested worktree or repeated approval. Existing installed app and device remain unchanged until package verified.
Ruling: Execute the user-authorized work inline after writing the concrete plan, without asking again for permission already supplied by “开始执行”; cost is user reviews implementation through tests/diff instead of another pre-code plan roundtrip.
Pre-flight 1→2→3→4→5: Async Ledger call contract shared; attempts distinct from turns; UI-only admin scope separate from daemon control.
Pre-flight 2→3: AsyncLocalStorage owns per-turn records; capture failures before pipeline also require a turn UUID.
Pre-flight 1→6: SQLite worker .mjs needs build copying; bundled Node22.22.3 live probe opened SQLite3.51.3 successfully, experimental warning expected.
Task 1: SQLite repository/money/worker tests RED missing implementation → GREEN after correcting fixture price effective date (historical request timestamps must use historical price). Persistence/reopen/interrupted recovery, private mode, exact decimal costs, idempotent terminal attempt, filters and privacy/clear confirmation covered. Full suite result recorded with commit below.
Task 1 verification: full54/54 tests + tsc passed before commit b6a2246.
Task 2: request retry and usage-only stream tests RED→GREEN; before-request DB failure prevents network. Added cancelled partial-response/unknown-usage coverage; provider adapters never store headers or key. Final suite result follows next commit.
Task 2 verification: full57/57 tests + tsc passed before bf40976.
Task 3: real fake-Wire no_speech capture test RED0 records→GREEN1 failed/no cloud attempt, app text/capture contexts and provider partial response attached. Full58/58 + tsc passed. Installed app not changed.
