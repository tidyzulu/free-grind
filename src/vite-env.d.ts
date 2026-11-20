/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_APP_VERSION: string;
	readonly VITE_I18N_BASE_URL?: string;
}

// App constants, set by vite.config.mjs from the app manifest
// (manifest/app.json, scripts/manifest.mjs).
/** User-visible app name, e.g. "Free Grind". */
declare const __APP_NAME__: string;
/** Lowercase app slug, prefix of release asset names (`<slug>-v<version>.apk`). */
declare const __APP_SLUG__: string;
/** Folder name for user-visible exports (Downloads/<folder>, Documents/<folder>). */
declare const __APP_FOLDER__: string;
/** Name of the app binary, also its desktop icon name on Linux. */
declare const __APP_BINARY__: string;
/** Where the source lives: "gitlab" (also self-hosted) or "github". */
declare const __REPO_FORGE__: "gitlab" | "github";
/** REST API base of the repository (GitLab: /api/v4/projects/<id>, GitHub: /repos/<owner>/<repo>). */
declare const __REPO_API_URL__: string;
declare const __REPO_URL__: string;
declare const __WEBSITE_URL__: string;
/** Release feed (GitHub releases API format) when releases aren't on GitHub; "" otherwise. */
declare const __RELEASES_FEED_URL__: string;
/** Page listing the releases when they aren't on GitHub; "" otherwise. */
declare const __RELEASES_PAGE_URL__: string;

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
