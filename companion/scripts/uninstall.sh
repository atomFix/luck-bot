#!/bin/bash
set -euo pipefail
destination="${1:-$HOME/Applications/Round Eyes Companion.app}"
if [[ "$destination" != */Round\ Eyes\ Companion.app || -L "$destination" || ! -f "$destination/Contents/Info.plist" ]]; then echo 'Expected installed Round Eyes Companion.app' >&2; exit 1; fi
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$destination/Contents/Info.plist")
if [[ "$bundle_id" != com.roundeyes.companion ]]; then echo 'Bundle identity mismatch' >&2; exit 1; fi
for option in "${@:2}"; do
 case "$option" in
 --delete-credentials) "$destination/Contents/Resources/node" "$destination/Contents/Resources/delete-credentials.mjs" ;;
 --delete-data) ;;
 *) echo 'Unknown uninstall option' >&2; exit 1 ;;
 esac
done
agent="$HOME/Library/LaunchAgents/com.roundeyes.companion.plist"
if [[ -f "$agent" ]]; then
 agent_app=$(/usr/libexec/PlistBuddy -c 'Print ProgramArguments:0' "$agent")
 if [[ "$agent_app" == "$destination/Contents/MacOS/RoundEyesCompanion" ]]; then rm "$agent"; fi
fi
if [[ " $* " == *" --delete-data "* ]]; then rm -rf "$HOME/Library/Application Support/Round Eyes Companion"; fi
rm -rf "$destination"
echo 'App removed. Settings, Keychain credentials, and previous version retained.'
