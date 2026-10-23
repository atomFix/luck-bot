#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/native
swiftc -target arm64-apple-macos14.0 -parse-as-library -O native/CredentialStore.swift native/CredentialHelper.swift -o build/native/credentials
swiftc -target arm64-apple-macos14.0 -parse-as-library native/CredentialStore.swift native/CredentialHelperTests.swift -o build/native/credential-tests
swiftc -target arm64-apple-macos14.0 -parse-as-library -O native/AudioOutput.swift -o build/native/audio-output
swiftc -target arm64-apple-macos14.0 -parse-as-library -O native/SerialPair.swift -o build/native/serial-pair
