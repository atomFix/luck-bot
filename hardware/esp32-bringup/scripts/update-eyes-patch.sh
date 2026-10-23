#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
# Local maintenance only: baseline files were preserved before any integration edit.
files=(CMakeLists.txt main/application.cc main/audio/audio_service.cc main/display/lcd_display.h main/display/lcd_display.cc main/display/display.cc)
baselines=(root-CMakeLists.txt application.cc audio_service.cc lcd_display.h lcd_display.cc display.cc)
: > patches/round-eyes-v1.9.4.patch
for i in "${!files[@]}"; do
 diff -u --label "a/${files[i]}" --label "b/${files[i]}" "patches/baseline/${baselines[i]}" "vendor/xiaozhi-esp32-1.9.4/${files[i]}" >> patches/round-eyes-v1.9.4.patch || [[ $? == 1 ]]
done
