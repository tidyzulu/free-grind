// Prints the TAURI_CONFIG merge patch for one build:
//
//   bun scripts/tauri-config.mjs [linux|windows|macos|android|ios]
//
// The target platform defaults to the host OS. It matters because the patch
// replaces app.windows as a whole (JSON merge patch replaces arrays), so it
// starts from the window list Tauri would use for that platform
// (tauri.<platform>.conf.json if it has one, else tauri.conf.json).
//
// App identity from the app manifest (manifest/app.json, see
// scripts/manifest.mjs): product name, identifier, window title, user agent,
// OTA endpoint and key, WiX upgrade code, binary name.
import { existsSync, readFileSync } from "node:fs";
import { loadManifest } from "./manifest.mjs";

const PLATFORMS = ["linux", "windows", "macos", "android", "ios"];
const HOST = { linux: "linux", win32: "windows", darwin: "macos" }[process.platform];

const platform = process.argv[2] || HOST;
if (!PLATFORMS.includes(platform)) {
	throw new Error(`tauri-config: unknown target platform "${platform}" (expected ${PLATFORMS.join(", ")})`);
}

const tauriDir = new URL("../src-tauri/", import.meta.url);
const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const conf = readJson(new URL("tauri.conf.json", tauriDir));
const platformConfUrl = new URL(`tauri.${platform}.conf.json`, tauriDir);
const platformConf = existsSync(platformConfUrl) ? readJson(platformConfUrl) : {};
const manifest = loadManifest();

// 1. Identity
const windows = platformConf.app?.windows ?? conf.app.windows;
const patch = {
	productName: manifest.appName,
	// Android: the identifier is the Kotlin package Tauri generates code into
	// (src-tauri/gen/android). The app's ID there is the Gradle applicationId,
	// set from the manifest's android.applicationId by build.gradle.kts.
	...(platform === "android" ? {} : { identifier: manifest.identifier }),
	app: {
		windows: windows.map((w) => ({ ...w, title: manifest.appName, userAgent: manifest.userAgent })),
	},
	plugins: {
		hotswap: { endpoint: manifest.ota.endpoint, pubkey: manifest.ota.pubkey },
	},
};
if (manifest.windows?.wixUpgradeCode) {
	patch.bundle = { windows: { wix: { upgradeCode: manifest.windows.wixUpgradeCode } } };
}

// The release feed when it isn't the repository's (already allowed): the update check fetches it.
const feedOrigin = manifest.updates?.feedUrl ? new URL(manifest.updates.feedUrl).origin : null;
if (feedOrigin) {
	const csp = conf.app.security.csp;
	const connect = [...new Set([...csp["connect-src"].split(" "), feedOrigin])].join(" ");
	patch.app.security = { csp: { ...csp, "connect-src": connect } };
}

// Binary name (Linux packages put it in /usr/bin). Unset: Tauri's default,
// the Cargo package name.
if (manifest.mainBinaryName) patch.mainBinaryName = manifest.mainBinaryName;

process.stdout.write(JSON.stringify(patch));
