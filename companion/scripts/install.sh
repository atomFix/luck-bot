#!/bin/bash
set -euo pipefail
source_app="${1:-$(dirname "$0")/Round Eyes Companion.app}"
destination="${2:-$HOME/Applications/Round Eyes Companion.app}"
if [[ "$destination" != */Round\ Eyes\ Companion.app || ! -f "$source_app/Contents/Info.plist" ]]; then echo 'Expected Round Eyes Companion.app source and destination' >&2; exit 1; fi
"$source_app/Contents/Resources/node" "$source_app/Contents/Resources/verify-bundle.mjs" "$source_app"
codesign --verify --deep --strict "$source_app"
mkdir -p "$(dirname "$destination")"
staging="$destination.installing"
if [[ -e "$staging" || -L "$destination" ]]; then echo 'Installation path is occupied' >&2; exit 1; fi
ditto "$source_app" "$staging"
"$staging/Contents/Resources/node" "$staging/Contents/Resources/verify-bundle.mjs" "$staging"
if [[ -e "$destination" ]]; then
 if [[ -e "$destination.previous" ]]; then echo 'Previous rollback copy exists; archive it before upgrading' >&2; rm -rf "$staging"; exit 1; fi
 existing_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$destination/Contents/Info.plist")
 if [[ "$existing_id" != com.roundeyes.companion ]]; then echo 'Destination bundle identity mismatch' >&2; rm -rf "$staging"; exit 1; fi
 mv "$destination" "$destination.previous"
fi
mv "$staging" "$destination"
echo 'Installed. Pairing and Keychain data preserved.'
