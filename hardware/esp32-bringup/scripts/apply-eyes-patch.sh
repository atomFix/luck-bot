#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
base="$PWD"
source_dir="$base/vendor/xiaozhi-esp32-1.9.4"
patch_file="$base/patches/round-eyes-v1.9.4.patch"
if ! rg -q 'set\(PROJECT_VER "1.9.4"\)' "$source_dir/CMakeLists.txt"; then
 echo 'Expected Xiaozhi v1.9.4 source' >&2;exit 1
fi
cd "$source_dir"
if patch --dry-run -f -F0 -R -p1 < "$patch_file" >/dev/null 2>&1; then
 echo 'Round eyes patch already applied';exit 0
fi
patch --dry-run -f -F0 -p1 < "$patch_file" >/dev/null
patch -f -F0 -p1 < "$patch_file"
