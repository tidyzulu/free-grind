#!/bin/sh
# Unsigned arm64-v8a APK. Runs inside the `android` image of
# ci/build/Dockerfile; start it with `FG_CHANNEL=... sh ci/build/run.sh android`.
#
# The APK is built without the release keystore (build.gradle.kts signs only
# when it exists). CI signs it after two builders produced the same bytes;
# REPRODUCIBILITY.md shows how to check a published APK against this output.
. ci/build/common.sh

android=/work/src-tauri/gen/android
# Gradle outputs from a host build (signed, other SDKs) must not leak in either.
rm -rf "$out/android" "$android/app/build"
mkdir -p "$out/android"

if [ -e "/work/src-tauri/certs/$FG_APP_SLUG-dev.jks" ] || [ -n "${FG_KEYSTORE_PATH:-}" ]; then
	echo "src-tauri/certs/$FG_APP_SLUG-dev.jks exists or FG_KEYSTORE_PATH is set; this build must stay unsigned" >&2
	exit 1
fi

# Release builds allow cleartext and user-installed CAs; the committed file is
# the development one. Swap it in for the build and put it back afterwards.
nsc=src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml
nsc_backup="$(mktemp)"
cp "$nsc" "$nsc_backup"
restore_nsc() { cp "$nsc_backup" "$nsc"; }
cleanup_hook=restore_nsc
cp ci/build/android/network_security_config.xml "$nsc"

# A fresh Gradle home per build, so nothing cached from another project leaks in.
export GRADLE_USER_HOME=/root/.gradle

# App identity patch (scripts/tauri-config.mjs).
TAURI_CONFIG="$(bun --no-env-file scripts/tauri-config.mjs android)"
export TAURI_CONFIG

bunx tauri android init --ci --skip-targets-install
# The init drops Tauri's placeholder launcher icons into the main res folder;
# the real ones come from manifest/android/res (build.gradle.kts), and Gradle
# refuses the same resource twice in one source set.
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
	rm -f "$android/app/src/main/res/mipmap-$density/ic_launcher.png" \
		"$android/app/src/main/res/mipmap-$density/ic_launcher_round.png" \
		"$android/app/src/main/res/mipmap-$density/ic_launcher_foreground.png"
done
# arm64-v8a only: GeckoView (Google sign-in) adds ~85 MB per ABI.
bunx tauri android build --apk --split-per-abi --target aarch64

set -- "$android"/app/build/outputs/apk/arm64/release/*-unsigned.apk
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo "expected one unsigned APK, found $#" >&2; exit 1; }
cp "$1" "$out/android/$FG_APP_SLUG-v$version-android-arm64-unsigned.apk"

echo
(cd "$out/android" && sha256sum -- *)
