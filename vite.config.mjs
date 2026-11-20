import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./scripts/manifest.mjs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const packageJsonPath = fileURLToPath(new URL("./package.json", import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const appVersion = packageJson.version ?? "0.0.0";

// Short commit the frontend was built from, shown next to the version in
// Settings. Always read from git (not CI env), so a rebuild of the same commit
// bakes in the same string and stays reproducible. Empty outside a checkout.
function shortCommitHash() {
	try {
		return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
	} catch {
		return "";
	}
}
const commitHash = shortCommitHash();

// App identity (manifest/app.json).
const manifest = loadManifest();

/** `%APP_NAME%` in index.html: the app name. */
function appNameInHtml() {
	const escaped = manifest.appName.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
	return {
		name: "app-name-in-html",
		transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", escaped),
	};
}

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [react(), tailwindcss(), appNameInHtml()],
	// Release builds (ci/build) must not pick up local .env files.
	// @ts-expect-error process is a nodejs global
	envDir: process.env.FG_REPRODUCIBLE_BUILD ? false : undefined,
	define: {
		"import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
		"import.meta.env.VITE_COMMIT_HASH": JSON.stringify(commitHash),
		__APP_NAME__: JSON.stringify(manifest.appName),
		__APP_SLUG__: JSON.stringify(manifest.appSlug),
		__APP_FOLDER__: JSON.stringify(manifest.folderName),
		// Main binary name (Tauri default: the Cargo package name).
		__APP_BINARY__: JSON.stringify(manifest.mainBinaryName ?? "free-grind"),
		__REPO_FORGE__: JSON.stringify(manifest.repoForge),
		__REPO_API_URL__: JSON.stringify(manifest.repoApiUrl),
		__REPO_URL__: JSON.stringify(manifest.repoUrl),
		__WEBSITE_URL__: JSON.stringify(manifest.websiteUrl),
		// Release feed and page (manifest updates).
		__RELEASES_FEED_URL__: JSON.stringify(manifest.updates?.feedUrl ?? ""),
		__RELEASES_PAGE_URL__: JSON.stringify(manifest.updates?.pageUrl ?? ""),
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "chrome69",
		cssTarget: "chrome69",
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (
						id.includes("/node_modules/react/") ||
						id.includes("/node_modules/react-dom/") ||
						id.includes("/node_modules/scheduler/")
					) {
						return "vendor-react";
					}
					if (
						id.includes("/node_modules/react-router") ||
						id.includes("/node_modules/@remix-run/")
					) {
						return "vendor-router";
					}
					if (
						id.includes("/node_modules/leaflet/") ||
						id.includes("/node_modules/react-leaflet/")
					) {
						return "vendor-map";
					}
					if (id.includes("/node_modules/@tauri-apps/")) {
						return "vendor-tauri";
					}
					if (
						id.includes("/node_modules/zod/") ||
						id.includes("/node_modules/@msgpack/")
					) {
						return "vendor-data";
					}
				},
			},
		},
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1420,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
}));
