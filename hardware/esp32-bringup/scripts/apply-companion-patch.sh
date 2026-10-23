#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
import json,hashlib,subprocess
root=Path.cwd();source=root/'vendor/xiaozhi-esp32-1.9.4';states=json.loads((root/'patches/companion-source-state.json').read_text());digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if all(digest(source/p)==s['current'] for p,s in states.items()):print('Companion patch already applied');raise SystemExit(0)
if not all(digest(source/p)==s['baseline'] for p,s in states.items()):raise SystemExit('Source differs from preserved round-eyes baseline; refusing to overwrite')
# Normalize only files whose original bytes were verified above (LCD board used CRLF).
for p in states:
 file=source/p;file.write_text(file.read_text())
patch=(root/'patches/companion-v1.9.4.patch').read_bytes()
subprocess.run(['patch','--dry-run','-f','-F0','-p1'],cwd=source,input=patch,check=True)
subprocess.run(['patch','-f','-F0','-p1'],cwd=source,input=patch,check=True)
if not all(digest(source/p)==s['current'] for p,s in states.items()):raise SystemExit('Post-apply source hash mismatch')
print('Companion patch applied and source hashes verified')
PY
