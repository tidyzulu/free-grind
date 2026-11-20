// Loads the app manifest (manifest/app.json): the single source of the app's
// identity: name, IDs, update endpoints and links. scripts/tauri-config.mjs
// turns it into the Tauri config patch, vite.config.mjs into build-time
// constants (__APP_NAME__ …), src-tauri/build.rs and build.gradle.kts read it
// directly.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MANIFEST_DIR = new URL("../manifest/", import.meta.url);

const REQUIRED = ["appName", "appSlug", "folderName", "identifier", "userAgent", "repository", "websiteUrl", "ota.endpoint", "ota.pubkey", "android.applicationId", "ios.bundleId"];

/**
 * The source repository's web URL (GitLab, also self-hosted, or GitHub): its
 * forge, path and API base, for the app's links, release lookups and commit
 * comparisons.
 */
function repository(url, file) {
	const m = /^https:\/\/([^/]+)\/([\w.-]+(?:\/[\w.-]+)+)\/?$/.exec(url);
	if (!m) throw new Error(`${file}: repository must be the repository's https URL, e.g. https://gitlab.com/group/project`);
	const [, host, path] = m;
	const forge = host === "github.com" ? "github" : "gitlab";
	return {
		repoUrl: `https://${host}/${path}`,
		repoForge: forge,
		repoPath: path,
		repoApiUrl:
			forge === "github" ? `https://api.github.com/repos/${path}` : `https://${host}/api/v4/projects/${encodeURIComponent(path)}`,
	};
}

function get(obj, path) {
	return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

/** Absolute path of the manifest directory (with trailing slash). */
export function manifestDir() {
	return fileURLToPath(MANIFEST_DIR);
}

export function loadManifest() {
	const file = new URL("app.json", MANIFEST_DIR);
	if (!existsSync(file)) throw new Error(`${fileURLToPath(file)} not found`);
	const manifest = JSON.parse(readFileSync(file, "utf8"));
	const missing = REQUIRED.filter((key) => {
		const value = get(manifest, key);
		return typeof value !== "string" || !value.trim();
	});
	if (missing.length) throw new Error(`${fileURLToPath(file)}: missing ${missing.join(", ")}`);
	if (!/^[a-z0-9-]+$/.test(manifest.appSlug)) throw new Error(`${fileURLToPath(file)}: appSlug must be lowercase letters, digits and dashes`);
	return { ...manifest, ...repository(manifest.repository, fileURLToPath(file)) };
}
