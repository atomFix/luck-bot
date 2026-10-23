#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
import difflib,json,hashlib
root=Path('.');baseline=root/'patches/companion-baseline';source=root/'vendor/xiaozhi-esp32-1.9.4';chunks=[];records={}
for old in sorted(baseline.rglob('*')):
 if not old.is_file():continue
 relative=old.relative_to(baseline).as_posix();new=source/relative
 chunks.extend(difflib.unified_diff(old.read_text().splitlines(True),new.read_text().splitlines(True),fromfile='a/'+relative,tofile='b/'+relative))
 records[relative]={'baseline':hashlib.sha256(old.read_bytes()).hexdigest(),'current':hashlib.sha256(new.read_bytes()).hexdigest()}
(root/'patches/companion-v1.9.4.patch').write_text(''.join(chunks));(root/'patches/companion-source-state.json').write_text(json.dumps(records,indent=2)+'\n')
print('Companion patch and exact source states recorded')
PY
