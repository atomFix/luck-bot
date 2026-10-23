#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
base="$PWD"
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
cp -R dist/src "$app/Contents/Resources/app/dist/"
cp -R build/native/credentials build/native/audio-output build/native/serial-pair "$app/Contents/Resources/app/dist/build/native/"
cp -R ui/. "$app/Contents/Resources/app/dist/ui/"
cp package.json package-lock.json "$app/Contents/Resources/app/"
cp scripts/delete-credentials.mjs "$app/Contents/Resources/"
cp scripts/verify-bundle.mjs "$app/Contents/Resources/"
cp -R skill config "$app/Contents/Resources/"
(cd "$app/Contents/Resources/app" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.roundeyes.companion</string><key>CFBundleName</key><string>Round Eyes Companion</string><key>CFBundleExecutable</key><string>RoundEyesCompanion</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/></dict></plist>
PLIST
clang -target arm64-apple-macos14.0 -Os native/CLILauncher.c -o "$app/Contents/MacOS/round-eyes"
codesign --force --sign - "$app/Contents/MacOS/round-eyes"
codesign --force --sign - "$app/Contents/Resources/node"
for file in credentials audio-output serial-pair; do codesign --force --sign - "$app/Contents/Resources/app/dist/build/native/$file"; done
# Sign before hashing; manifest excludes itself and the outer bundle signature.
APP_BUNDLE_PATH="$app" node --input-type=module <<'JS'
import {readdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';import {join,relative} from 'node:path';import {createHash} from 'node:crypto';
const root=process.env.APP_BUNDLE_PATH,manifest={};
function walk(dir){for(const name of readdirSync(dir)){const file=join(dir,name),stat=lstatSync(file);if(stat.isDirectory())walk(file);else if(stat.isFile()&&relative(root,file)!=='Contents/MacOS/RoundEyesCompanion')manifest[relative(root,file)]=createHash('sha256').update(readFileSync(file)).digest('hex');}}
walk(root);writeFileSync(join(root,'Contents/Resources/manifest.json'),JSON.stringify(manifest,null,2));
JS
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"
"$app/Contents/Resources/node" scripts/verify-bundle.mjs "$app"
cp scripts/install.sh scripts/uninstall.sh "$out/"
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/RoundEyesCompanion-macos-arm64.zip"
shasum -a 256 "$out/RoundEyesCompanion-macos-arm64.zip" > "$out/SHA256SUMS"
echo 'Local arm64 package built; ad-hoc signed, not notarized.'
