#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
base="$PWD"
identity="${ROUND_EYES_SIGN_IDENTITY:--}"
out="$base/../output/round-eyes-companion"
app="$out/Round Eyes Companion.app"
npm run check
npm run build
bash scripts/build-native.sh
mkdir -p "$out"
# Remove only this task's generated staging bundle, never installed user data.
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/app/dist/build/native" "$app/Contents/Resources/app/dist/ui"
swiftc -target arm64-apple-macos14.0 -parse-as-library -O native/Launcher.swift -o "$app/Contents/MacOS/RoundEyesCompanion"
cp -L "$(command -v node)" "$app/Contents/Resources/node"
node scripts/fetch-speaker-model.mjs
node scripts/fetch-asr-model.mjs
mkdir -p "$app/Contents/Resources/app/dist/config" "$app/Contents/Resources/app/dist/models"
cp config/asr-model.json "$app/Contents/Resources/app/dist/config/"
for file in asr-zipformer-zh.int8.onnx asr-zipformer-zh.tokens.txt asr-zipformer-zh.bbpe.model asr-probe.wav; do cp "models/$file" "$app/Contents/Resources/app/dist/models/"; done
cp config/speaker-model.json "$app/Contents/Resources/app/dist/config/"
cp models/campplus-zh.onnx "$app/Contents/Resources/app/dist/models/"
cp -R dist/src "$app/Contents/Resources/app/dist/"
cp -R build/native/credentials build/native/audio-output build/native/serial-pair "$app/Contents/Resources/app/dist/build/native/"
cp -R ui/. "$app/Contents/Resources/app/dist/ui/"
cp package.json package-lock.json "$app/Contents/Resources/app/"
cp scripts/delete-credentials.mjs "$app/Contents/Resources/"
cp scripts/verify-bundle.mjs "$app/Contents/Resources/"
cp -R skill config "$app/Contents/Resources/"
mkdir -p "$app/Contents/Resources/ThirdParty-Licenses"
cp "$base/../third_party/zipformer-asr-NOTICE.txt" "$app/Contents/Resources/ThirdParty-Licenses/"
cp "$base/../third_party/3d-speaker-LICENSE" "$app/Contents/Resources/ThirdParty-Licenses/"
cp "$base/../third_party/silero-vad-LICENSE" "$app/Contents/Resources/ThirdParty-Licenses/"
(cd "$app/Contents/Resources/app" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
# The app targets this Mac's arm64 platform; retain only its ONNX native runtime.
ort_bins="$app/Contents/Resources/app/node_modules/onnxruntime-node/bin/napi-v6"
rm -rf "$ort_bins/linux" "$ort_bins/win32" "$ort_bins/darwin/x64"
for file in "$ort_bins/darwin/arm64/"*.node "$ort_bins/darwin/arm64/"*.dylib; do
 [[ ! -f "$file" ]] || codesign --force --sign "$identity" "$file"
done
sherpa_bins="$app/Contents/Resources/app/node_modules/sherpa-onnx-darwin-arm64"
for file in "$sherpa_bins/"*.node "$sherpa_bins/"*.dylib; do
 [[ ! -f "$file" ]] || codesign --force --sign "$identity" "$file"
done
cp "$base/../third_party/sherpa-onnx-LICENSE" "$app/Contents/Resources/ThirdParty-Licenses/sherpa-onnx-LICENSE"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.roundeyes.companion</string><key>CFBundleName</key><string>Round Eyes Companion</string><key>CFBundleExecutable</key><string>RoundEyesCompanion</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/><key>NSLocalNetworkUsageDescription</key><string>连接同一局域网中的 ESP32 圆眼设备，用于表情控制与语音交互。</string><key>NSBonjourServices</key><array><string>_roundeyes._tcp</string></array></dict></plist>
PLIST
clang -target arm64-apple-macos14.0 -Os native/CLILauncher.c -o "$app/Contents/MacOS/round-eyes"
codesign --force --sign "$identity" "$app/Contents/MacOS/round-eyes"
codesign --force --sign "$identity" "$app/Contents/Resources/node"
for file in credentials audio-output serial-pair; do codesign --force --sign - "$app/Contents/Resources/app/dist/build/native/$file"; done
# Sign before hashing; manifest excludes itself and the outer bundle signature.
APP_BUNDLE_PATH="$app" node --input-type=module <<'JS'
import {readdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';import {join,relative} from 'node:path';import {createHash} from 'node:crypto';
const root=process.env.APP_BUNDLE_PATH,manifest={};
function walk(dir){for(const name of readdirSync(dir)){const file=join(dir,name),stat=lstatSync(file);if(stat.isDirectory())walk(file);else if(stat.isFile()&&relative(root,file)!=='Contents/MacOS/RoundEyesCompanion')manifest[relative(root,file)]=createHash('sha256').update(readFileSync(file)).digest('hex');}}
walk(root);writeFileSync(join(root,'Contents/Resources/manifest.json'),JSON.stringify(manifest,null,2));
JS
codesign --force --sign "$identity" "$app"
codesign --verify --deep --strict "$app"
"$app/Contents/Resources/node" scripts/verify-bundle.mjs "$app"
node scripts/verify-sqlite-runtime.mjs "$app"
node scripts/verify-speaker-runtime.mjs "$app"
node scripts/verify-local-asr-runtime.mjs "$app"
cp scripts/install.sh scripts/uninstall.sh "$out/"
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/RoundEyesCompanion-macos-arm64.zip"
shasum -a 256 "$out/RoundEyesCompanion-macos-arm64.zip" > "$out/SHA256SUMS"
echo 'Local arm64 package built; configured code signature verified, not notarized.'
