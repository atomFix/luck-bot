#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
base="$PWD"
set +u
source "${IDF_PATH:-$base/vendor/esp-idf}/export.sh" >/dev/null
set -u
cd "$base/vendor/xiaozhi-esp32-1.9.4"
if [[ ! -e sdkconfig.companion ]]; then cp "$base/patches/baseline/sdkconfig.eyes-on" sdkconfig.companion; fi
# Existing config values take precedence over defaults; explicitly select required features.
python - <<'PY'
from pathlib import Path
p=Path('sdkconfig.companion');s=p.read_text()
for k in ['CONFIG_ESP_HTTPS_SERVER_ENABLE','CONFIG_HTTPD_WS_SUPPORT']:
 s=s.replace('# '+k+' is not set', k+'=y')
p.write_text(s)
PY
idf.py -B build-companion -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.companion '-DSDKCONFIG_DEFAULTS=sdkconfig.defaults;../../sdkconfig.gc9a01.defaults;../../sdkconfig.companion.defaults' "$@" build
