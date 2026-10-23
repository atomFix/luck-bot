#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build-host/companion
for name in protocol pairing session audio layers; do
 if [[ -f "tests/companion/${name}_test.cc" ]]; then
   sources=("companion/protocol.cc")
   [[ "$name" == protocol || "$name" == layers ]] || sources+=("companion/$name.cc")
   c++ -std=c++17 -Wall -Wextra -Werror -Icompanion "tests/companion/${name}_test.cc" "${sources[@]}" -o "build-host/companion/$name"
   if [[ "$name" == protocol ]]; then "build-host/companion/$name" ../../companion/test/fixtures/protocol-audio.hex; else "build-host/companion/$name"; fi
   echo "$name: passed"
 fi
done
