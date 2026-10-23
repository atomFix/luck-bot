# SDD ledger — plan: docs/superpowers/plans/2026-10-23-xiaozhi-round-eyes.md

Execution: native, approved by user 2026-10-23.
Spec: docs/superpowers/specs/2026-10-23-xiaozhi-blob-character-design.md

Ruling: Workspace has no Git repository; implement in the authorized character directory, retain this ledger and deliver source/patches instead of creating a worktree or commits — required by the approved plan — cost if wrong: isolation must be recreated from the preserved firmware/source baseline.
Pre-flight: Task 1 Frame/48-point contours feed both Task 2 Canvas and Task 3 LVGL; one shared C++ model, no duplicate browser animator.
Pre-flight: Task 3 signals consume firmware DeviceState; use a platform-neutral enum adapter so Task 1/host tests do not include ESP-IDF headers.
Pre-flight: preserve baseline GC9A01 binary, Wi-Fi NVS and OTA selection; inspect current slot before writing an application.

Task 1: in progress — model/geometry tests first.
Task 2: pending.
Task 3: pending.
Task 4: pending.

Task 1: complete — model stub RED (zero area); 625 transitions GREEN; triangulation RED (count 0) then GREEN (46 triangles, area conservation and no self-crossing). Blink closure regression RED (spring prevented closure) then GREEN (direct timed lid factor).
Task 2: implementation complete — shared C++ model host, whitelist protocol tests passed, HTTP invalid pose=400, backup route=404; browser checked natural/smile at240px; screenshot and shared-model 14s video in output/xiaozhi-character-design. Remaining visual checks tracked separately.
Task 3: in progress — signals RED then GREEN for waiting/PCM/interrupt/expiry; feature-on firmware compiled. Integration uses no event-manager callbacks; one UI-owned LVGL timer. Audio publish only lock-free 32-bit atomic scalars.
Ruling: RoundEyesUi owns the40ms timer and drives EyesView — one lifetime owner avoids duplicated timers; same update cadence and LVGL task boundary.
Ruling: critical messages use separate centered174px-wide labels fed from existing labels; hide the original parent but preserve label pointers and callback safety. Font/theme for eyes stays black/white. Low battery popup is above overlay.
Ruling: known upstream destructor deletes parent hierarchy before base label cleanup — character-enabled path stops notification timer and clears freed label pointers to prevent base double-delete.

Whole-change review: fresh reviewer eyes_final_review reported4 Important findings. All fixed in one pass:
- emotion layering RED listening-angry pose !=7, GREEN with emotion-preserving behavior gaze; helper poses only for neutral.
- AudioTesting critical RED then GREEN.
- wake and reconnect reachability RED then GREEN; wake300ms from Idle, connection text first1500ms, then searching eyes.
- notification lifecycle: character config no longer creates the base ESP notification timer; notifications use the UI-owned LVGL timer. Added minimal display.cc constructor guard to the patch. Removes deferred timer callback race entirely in enabled mode. Feature-off unchanged.
Minor ruling: packet RMS feeds the model's critically damped height parameters; a separate asymmetric attack/release filter is deferred (low modulation amplitude12% and160ms expiry bound visual impact). No claim of an asymmetric envelope filter.
Task 3: implementation complete — full host suite GREEN, normal/on, off and captions compiled; captions shell wrapper had a trailing parse error after successful IDF build because wrapper was edited while running. Current script bash-n passes; rerun captions before final verification record.
Task 4: in progress — OTA copies CRC-validated, sequence2/ota_1/0x700000. Baseline SHA retained; speech-model and partition-table bytes unchanged. Final binary3521984bytes SHA25695f37ef0b55f1145b4d641e3be947a80f18153a122ac9ca016e8a13ab5ffa309. Application-only flash initiated; no NVS/partition/bootloader/OTA/model writes.

Device regression found (first image95f37ef…): first10s diagnostic log crashed repeatedly. Captured LoadProhibited EXCVADDR0x9e5; addr2line traces EyesView::Update→nano-vfprintf_i. CONFIG_NEWLIB_NANO_FORMAT=y, IDF Kconfig explicitly excludes64-bit integer format support; %llu printed literal lu and shifted subsequent varargs into %s. Restored known-good baseline application at0x700000, verified flash hash. Fix uses32-bit unsigned-long formatting for bounded average duration.
Performance evidence before fix: update12.8–12.9FPS, refresh13.9FPS, refresh_max69–71ms. Geometry update max inferred from crashing format is not trusted. Main view invalidated whole240×240 every frame; use padded union of previous/current eye bounds. Dirty-region regression RED with full-screen implementation, GREEN for25 poses proving old/new geometry is cleared and dirty area<half screen. Re-test actual FPS after flashing new image; initial failed run is not a passed soak.

Final device image: SHA256 b497b5f79728eda896039350a547e9ffab3c780e87bec8bc05888a68fdbce015,3522496bytes, ELF SHA d3155caa892932a6a98809c757c6e18d8e4b9e5bfa11503c84f5d28d23eb6716. Saved .elf alongside flashed .bin before subsequent build matrix runs.
Ruling:40ms requested cadence delivered20.7–21FPS after dirty-region fix; use50ms per approved fallback, retest actual (~17FPS with voice). Do not label requested20Hz as measured20FPS. No claim of optical panel frame timing.
Build matrix: latest normal/off/captions builds all completed; config restored to character on/captions off. Full host suite passed with5 executables. Desktop preview restarted against latest shared-model binary. Demo extended to20s to include at least3 interruptions and reconnecting.
Voice: first bounded Mac TTS probe then live microphone/cloud traffic observed;13 completed input→assistant→listening/idle cycles by223s, no panic in final log. No more synthesized audio while operator is interacting.

Operator feedback: physical photo confirms internal diagonal black seams in both white eyes, animation less smooth than desktop. Visual acceptance FAILED for triangle-rendered image. Geometry tests alone cannot detect LVGL's shared-edge antialias cracks.
Ruling: replace per-triangle LVGL draw with one persistent240x240 RGB565 canvas and whole-contour scanline rasterizer. This deviates from planned triangle backend because real pixels show seams and software draw tasks are slow. Cost:115200bytes PSRAM once; no per-frame object/allocation. Preserve shared48-point model, same poses and dirty bounds. Triangulation remains a geometry test/reference only. Add pixel-interior regression test RED then GREEN, including AA edges and clearing old silhouettes. Re-test device cadence at40ms with cheaper one-image draw. Old triangle run cannot substitute for new renderer soak/visual acceptance.
New renderer review: no Important/Critical issue; reviewer independently ran pixel test under ASan/UBSan. Initial115200-byte canvas exceeded64KiB design target; cropped to240x128/y56..183=61440bytes. Reviewer rechecked indexing/dirty-region coordinates and reran sanitizers successfully. Pixel test covers global240x240 region, proving all25 eye silhouettes fit the band.
Native40ms run: no seam-generating triangle draw calls; refresh~20.4–20.6FPS, update~8.1ms, refresh~8ms. Source investigation found esp_lvgl_port task's unconditional vTaskDelay(1), with CONFIG_FREERTOS_HZ=100 (10ms tick), in addition to event/timer wait. Ruling: tune only our UI timer request to30ms, allowing the port's10ms scheduling cost within the25FPS/40ms display budget. Keep global RTOS tick, upstream managed port and audio unchanged; measure actual FPS again. This is calibrated for this specific supported board/build, not a portable timer-rate claim.
Final canvas+cadence firmware SHA256 df7f5703c24df50ee5a9306617de22b3ab080b73dc5932f5709cf3d70e3824a9. Only application slot updated. Native40ms run retained as logs/eyes-raster-40ms-smoke.log; final new cadence run uses fresh logs/eyes-raster-boot-soak.log.
Cadence follow-up:30ms UI timer produces~26 model updates/s but default33ms LVGL refresh coalesces them to~21–23 refreshes/s. Ruling: for this view only, set display refresh deadline10ms (it pauses with no invalid pixels) and restore LV_DEF_REFR_PERIOD on view destruction. This does not request100FPS; source invalidations remain limited by our animation timer. Measure refresh events after final flash; no global RTOS or managed SDK modifications.

Final refresh-deadline image: SHA256 a3f06cd723d384316bda9e55f46df0113434a417ecb07dc0fa356ef73e467ba2; timer30ms/refresh-deadline10ms. Matrix normal/off/captions passed. Native pixel/model/protocol/geometry/dirty/signal host executables all GREEN (6 total). Independent ASan/UBSan raster review GREEN.
Device measurements: idle refresh~27FPS, voice~25–26FPS; source geometry/raster update~8–11ms, normal refresh~7–20ms. Exact statistics retained in JSON.
Voice stress: scripts/voice-smoke-eyes.py completed10/10 condition-driven acoustic rounds via existing Mac output. Final log contains11 complete round trips including wake greeting by265s; no panic. Operator confirmation of new visual still pending; prior triangle-photo defect remains documented, never marked passed by software tests.

Operator acceptance: confirmed black seams disappeared; confirmed eye movement/blinks/transitions now close to desktop preview and normal. Normal-eye visual acceptance PASSED. Physical disconnect/upgrade/long-critical-text checks remain pending separately, not inferred from normal-eye confirmation. Speaker still pending until amplifier installation.

Final verification: logs/eyes-raster-boot-soak.log spans645.3seconds atfinalcheck,63diagnostic samples,11completevoice round trips (10automatedqueries plus wake greeting), no panic/backtrace/watchdog/reboot. Refresh25.0–28.4FPS overall (first interval includescritical startup refresh), recentidle~27FPS, voicedialogue~25–26FPS. Maxrefresh37828us includingfirstfullpaint; maxmodel/rasterupdate26816us; minimumfreeheap7738840bytes; recentsteadyheap alternates~7767148/7767664bytes with no downward trend.
Task 4: build/flash/boot/voice/normal-eye visual/10minute stability acceptance complete. Core requested25-expression feature delivered and operator-confirmed. Outstanding hardware checks explicitly retained: physical critical/disconnect/upgrade/long-text layout and audible speaker after amplifier installation. These are pending, not inferred from compilation or normal display.
Final verification manifest: VERIFICATION-eyes.json. Firmware a3f06cd723d384316bda9e55f46df0113434a417ecb07dc0fa356ef73e467ba2,3523616bytes; archived ELF is the exactflashed image. Source, baselinepatch, reconstructscripts, localpreview,20s modeldemo and nativepixel contact sheet retained. NoGit repository/commit/push/publish was created.
