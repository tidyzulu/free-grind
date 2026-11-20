// Repository, website and release links of the app
// (manifest/app.json). The repository is on GitHub or GitLab (also
// self-hosted); everything that builds a link or calls its API goes
// through here, so nothing else needs to know which.

export const REPO_URL = __REPO_URL__;
export const WEBSITE_URL = __WEBSITE_URL__;
export const DISCORD_URL = "https://discord.gg/cJqTaWPMFF";
export const TELEGRAM_URL = "https://t.me/freegrind";

const GITLAB = __REPO_FORGE__ === "gitlab";

/** "GitLab" or "GitHub", for texts ({{forge}}). */
export const FORGE_NAME = GITLAB ? "GitLab" : "GitHub";
/** The forge's CI, which builds the OTA updates, for texts ({{ci}}). */
export const CI_NAME = GITLAB ? "GitLab CI" : "GitHub Actions";

/** GitLab puts project pages under /-/. */
const pages = GITLAB ? `${REPO_URL}/-` : REPO_URL;

/** A file in the repository at `ref`, e.g. repoFileUrl("LICENSE"). */
export function repoFileUrl(path: string, ref = "main"): string {
	return `${pages}/blob/${ref}/${path}`;
}

export const ISSUES_URL = `${pages}/issues`;
export const NEW_ISSUE_URL = `${pages}/issues/new`;
/** How OTA updates are signed and checked. */
export const OTA_SIGNING_URL = `${repoFileUrl("KEYS.md", "development")}#checking-an-ota-update`;

export function commitUrl(sha: string): string {
	return `${pages}/commit/${sha}`;
}

/** Diff between two commits (short or full SHAs, or branch names); null when either is unknown or both are the same. */
export function compareUrl(from: string | null | undefined, to: string | null | undefined): string | null {
	if (!from || !to || from.startsWith(to) || to.startsWith(from)) return null;
	return `${pages}/compare/${from}...${to}`;
}

/** Where people download releases: the app's own page, or the repository's releases. */
export const RELEASES_URL = __RELEASES_PAGE_URL__ || `${pages}/releases`;

/** A published release, the same whichever feed it came from. */
export type Release = {
	name: string;
	url: string | null;
	draft: boolean;
	prerelease: boolean;
	publishedAt: string | null;
	assets: { name: string; url: string }[];
};

type GitHubRelease = {
	name?: string;
	html_url?: string;
	draft?: boolean;
	prerelease?: boolean;
	published_at?: string | null;
	assets?: { name?: string; browser_download_url?: string }[];
};

type GitLabRelease = {
	name?: string;
	tag_name?: string;
	released_at?: string | null;
	upcoming_release?: boolean;
	_links?: { self?: string };
	assets?: { links?: { name?: string; url?: string; direct_asset_url?: string }[] };
};

function fromGitHub(release: GitHubRelease): Release {
	return {
		name: release.name ?? "",
		url: release.html_url || null,
		draft: release.draft === true,
		prerelease: release.prerelease === true,
		publishedAt: release.published_at ?? null,
		assets: (release.assets ?? []).flatMap((a) => (a.name && a.browser_download_url ? [{ name: a.name, url: a.browser_download_url }] : [])),
	};
}

function fromGitLab(release: GitLabRelease): Release {
	const name = release.name || release.tag_name || "";
	return {
		name,
		url: release._links?.self || null,
		draft: release.upcoming_release === true,
		// GitLab has no pre-release flag: like the release CI, a version with a
		// pre-release part (1.0.0-beta.3) is one.
		prerelease: /(?:^|\s)v?\d+\.\d+\.\d+-/.test(name),
		publishedAt: release.released_at ?? null,
		assets: (release.assets?.links ?? []).flatMap((a) => {
			const url = a.url || a.direct_asset_url;
			return a.name && url ? [{ name: a.name, url }] : [];
		}),
	};
}

/**
 * The newest releases, newest first: the app's own feed (manifest
 * updates.feedUrl, in the GitHub releases format), or the repository's.
 */
export async function fetchReleases(signal?: AbortSignal): Promise<Release[]> {
	const ownFeed = __RELEASES_FEED_URL__;
	const url = ownFeed || `${__REPO_API_URL__}/releases?per_page=30`;
	const response = await fetch(url, {
		headers: GITLAB && !ownFeed ? { Accept: "application/json" } : { Accept: "application/vnd.github+json" },
		signal,
	});
	if (!response.ok) throw new Error(`Release lookup failed (${response.status})`);
	const data = (await response.json()) as unknown;
	if (!Array.isArray(data)) throw new Error("Release lookup: unexpected response");
	return GITLAB && !ownFeed ? (data as GitLabRelease[]).map(fromGitLab) : (data as GitHubRelease[]).map(fromGitHub);
}

/** A commit between two versions, for the "what changed" list. */
export type ChangeCommit = { sha: string; title: string; author: string | null; date: number | null; merge: boolean };

/** Commits from `from` to `to`, oldest first. */
export async function fetchCompare(from: string, to: string): Promise<{ commits: ChangeCommit[]; total: number }> {
	if (GITLAB) {
		const response = await fetch(
			`${__REPO_API_URL__}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
		);
		if (!response.ok) throw new Error(`Compare failed (${response.status})`);
		const data = (await response.json()) as {
			commits?: { id: string; title?: string; message?: string; author_name?: string; created_at?: string; parent_ids?: string[] }[];
		};
		const commits = (data.commits ?? []).map((c) => ({
			sha: c.id,
			title: (c.title ?? c.message ?? "").split("\n")[0].trim(),
			author: c.author_name ?? null,
			date: c.created_at ? Date.parse(c.created_at) || null : null,
			merge: (c.parent_ids?.length ?? 0) > 1,
		}));
		return { commits, total: commits.length };
	}
	const response = await fetch(`${__REPO_API_URL__}/compare/${from}...${to}?per_page=250`, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!response.ok) throw new Error(`Compare failed (${response.status})`);
	const data = (await response.json()) as {
		total_commits: number;
		commits: {
			sha: string;
			parents: unknown[];
			author: { login: string } | null;
			commit: { message: string; author: { name: string; date: string } | null };
		}[];
	};
	const commits = data.commits.map((c) => ({
		sha: c.sha,
		title: c.commit.message.split("\n")[0].trim(),
		author: c.author?.login ?? c.commit.author?.name ?? null,
		date: c.commit.author ? Date.parse(c.commit.author.date) || null : null,
		merge: c.parents.length > 1,
	}));
	return { commits, total: data.total_commits };
}
