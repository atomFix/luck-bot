#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
base="$PWD"
"$base/scripts/apply-eyes-patch.sh"
set +u
source "${IDF_PATH:-$base/vendor/esp-idf}/export.sh" >/dev/null
set -u
cd "$base/vendor/xiaozhi-esp32-1.9.4"
idf.py -DIDF_TARGET=esp32s3 '-DSDKCONFIG_DEFAULTS=sdkconfig.defaults;../../sdkconfig.gc9a01.defaults' "$@" build
