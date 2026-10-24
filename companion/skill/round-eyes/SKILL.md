---
name: round-eyes
description: Control an authorized ESP32 round-eye companion through the round-eyes MCP tools, including expression feedback for agent task progress. Use when the user asks for the physical eyes to react or follow a task.
---

# Round Eyes

The Mac companion must be running and the owner must have paired the device over USB. Installing this skill grants no device permissions. Use the installed `round-eyes` MCP server; keys and device tokens stay in the companion's Keychain.

Call `list_devices` to find authorized devices. Use the user's chosen device; if only one is connected, use it. With several connected devices and no preference, ask which one. An offline device does not receive queued reactions.

If you already know the desired expression, call `set_reaction` directly. Do not call `semantic_input` to reclassify your own expression. Use `semantic_input` when the user wants a supplied sentence understood; it can return reply text but does not grant microphone access or play audio.

Continuous nod/head shake requires firmware capability `gesture_v1`; report an upgrade requirement if unavailable. For an explicitly requested nod or head shake, use `semantic_input` with `点点头` or `摇摇头`. These are complete motion timelines, not `set_reaction` emotion keys. For a question asking whether a statement is correct, supply the complete statement and question so the companion can judge agreement; do not send a bare question with no referent or assume agreement yourself.

`set_reaction` accepts only these emotion keys:
`neutral happy laughing funny sad angry crying loving embarrassed surprised shocked thinking winking cool relaxed delicious kissy confident sleepy silly confused wide_eyes mega_eyes giant_left giant_right`.

`hold_ms` is an integer from **300 to 3000**, even for a task that lasts minutes. Use 1600–3000 at meaningful milestones; the eyes return to idle after the hold. Do not request 60000 or refresh continuously just to occupy the device. Useful examples: analysis → `thinking`; unclear choice → `confused`; completed work → `happy`; waiting comfortably → `relaxed`. A user's distress usually calls for care, not an angry mirror.

When a tool returns `busy`, `forbidden`, `expired`, or offline, do not force takeover, pair automatically, switch tools to bypass it, or queue a stale expression. Continue the user's actual task and check availability at the next meaningful milestone. A call that fails is not evidence that the screen changed.

The tool interface exposes no arbitrary shell, firmware, Wi-Fi reset, credential retrieval, or ownership administration. Configure those through the owner's companion interface instead. Report physical expression application only after a successful device acknowledgement.
