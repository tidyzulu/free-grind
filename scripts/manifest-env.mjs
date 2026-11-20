// Prints the app manifest (scripts/manifest.mjs) as shell assignments for the
// build scripts:
//
//   eval "$(bun scripts/manifest-env.mjs)"
//
// Always: FG_APP_NAME, FG_APP_SLUG, FG_APP_BINARY (main binary name),
// FG_APP_REPO_URL.
//
// Plus the build variables in the manifest's optional "env" object
// (none for now). A variable that's already set in the
// environment wins, so a local build can point at a dev server. Only FG_*
// names are accepted.
import { loadManifest } from "./manifest.mjs";

const quote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;
const manifest = loadManifest();
const lines = [];
const assign = (name, value) => lines.push(`${name}=${quote(value)}; export ${name}`);

assign("FG_APP_NAME", manifest.appName);
assign("FG_APP_SLUG", manifest.appSlug);
// Tauri's default binary name is the Cargo package name.
assign("FG_APP_BINARY", manifest.mainBinaryName ?? "free-grind");
assign("FG_APP_REPO_URL", manifest.repoUrl);

for (const [name, value] of Object.entries(manifest.env ?? {})) {
	if (!/^FG_[A-Z0-9_]+$/.test(name)) throw new Error(`app.json env: ${name} is not an FG_* variable`);
	if (typeof value !== "string") throw new Error(`app.json env: ${name} must be a string`);
	if ((process.env[name] ?? "").trim()) continue;
	assign(name, value);
}

process.stdout.write(`${lines.join("\n")}\n`);
