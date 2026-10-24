#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build-host
sources=(character/eyes_model.cc character/eye_poses.cc)
flags=(-std=c++17 -O2 -Wall -Wextra -Werror -I.)
for test in eyes_model triangulate protocol dirty_region rasterize timeline expression_bounds; do
 extra=(); [[ "$test" != triangulate ]] || extra=(character/triangulate.cc)
 [[ "$test" != rasterize ]] || extra=(character/rasterize.cc)
 c++ "${flags[@]}" "${sources[@]}" ${extra[@]+"${extra[@]}"} "tests/${test}_test.cc" -o "build-host/${test}_test"
 "build-host/${test}_test"
done
c++ "${flags[@]}" character/animation_signals.cc tests/signals_test.cc -o build-host/signals_test
build-host/signals_test
c++ "${flags[@]}" "${sources[@]}" preview/model_host.cc -o build-host/model_host
