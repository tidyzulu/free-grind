// TEMPORARY (repository move): this file, the RepoMovedGate in App.tsx, the
// repo_moved row in SettingsPage.tsx and the settings.repo_moved* translations
// go away together once the old app versions are gone.
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { FullscreenPrompt, fullscreenPrimaryButtonClass, fullscreenSecondaryButtonClass } from "./FullscreenPrompt";
import { isOlderVersion } from "./OutdatedVersionPrompt";
import { RELEASES_URL, REPO_URL, fetchReleases } from "../config/links-config";
import { openExternalUrl } from "../utils/externalUrl";

/**
 * First app release published from the new repository (tidyzulu on GitHub).
 * Installed apps older than this look for updates where the old one was and
 * have to be replaced by hand; the hint reaches them over OTA. Up to beta.53
 * that includes the fdev8975 repository, which no longer exists.
 */
const FIRST_VERSION_FROM_NEW_REPO = "1.0.0";

/** Repository address without the scheme, for display. */
export const REPO_DISPLAY_NAME = REPO_URL.replace(/^https:\/\//, "");

/**
 * Whether the installed app binary predates the repository move. Uses the
 * native version, not the frontend's: an OTA update brings the frontend up to
 * date but leaves the old binary in place.
 */
export function isBeforeRepoMove(nativeVersion: string | null): boolean {
	return nativeVersion !== null && isOlderVersion(nativeVersion, FIRST_VERSION_FROM_NEW_REPO);
}

/**
 * Whether the settings should still mention the move: on the old versions,
 * and on the first release from the new repository too.
 */
export function showRepoMovedInSettings(nativeVersion: string | null): boolean {
	return nativeVersion !== null && !isOlderVersion(FIRST_VERSION_FROM_NEW_REPO, nativeVersion);
}

let releaseLookup: Promise<boolean> | null = null;

/**
 * Whether the new repository has a published release yet. Without one there
 * is nothing to point at, so the hint stays hidden. Looked up once per app
 * start, also with update checks turned off (this hint is temporary); a
 * failed lookup counts as no release.
 */
function hasPublishedRelease(): Promise<boolean> {
	releaseLookup ??= fetchReleases()
		.then((releases) => releases.some((release) => !release.draft))
		.catch(() => false);
	return releaseLookup;
}

/** True once the new repository is known to have a release; false until then. */
export function useNewRepoHasRelease(enabled: boolean): boolean {
	const [hasRelease, setHasRelease] = useState(false);
	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		void hasPublishedRelease().then((value) => {
			if (!cancelled) setHasRelease(value);
		});
		return () => {
			cancelled = true;
		};
	}, [enabled]);
	return enabled && hasRelease;
}

/** Installed app version, or null outside the Tauri app. */
export function useNativeAppVersion(): string | null {
	const [version, setVersion] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		getVersion()
			.then((value) => {
				if (!cancelled) setVersion(value);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);
	return version;
}

// Dismissing hides the prompt until the next app start.
let dismissedThisSession = false;

// Yellow instead of the accent colour: this is a warning screen.
const warningIconTileClass =
	"flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-yellow-300 to-yellow-500 text-yellow-950 shadow-xl shadow-yellow-500/25";
const warningPrimaryButtonClass = fullscreenPrimaryButtonClass.replace(
	"bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-contrast)]",
	"bg-yellow-400 px-5 text-[15px] font-semibold text-yellow-950",
);

export function RepoMovedPromptView({ onDismiss }: { onDismiss: () => void }) {
	const { t } = useTranslation();
	return (
		<FullscreenPrompt
			icon={TriangleAlert}
			iconTileClass={warningIconTileClass}
			title={t("settings.repo_moved", { defaultValue: "{{appName}} Has Moved Again" })}
			description={t("settings.repo_moved_prompt_desc", {
				defaultValue:
					"GitHub doesn't like us, so {{appName}} has moved again and now lives at {{repo}}. Download the latest release from there to keep getting updates.",
				repo: REPO_DISPLAY_NAME,
			})}
			footer={
				<>
					<button type="button" onClick={() => void openExternalUrl(RELEASES_URL)} className={warningPrimaryButtonClass}>
						{t("settings.repo_moved_open", { defaultValue: "Open Releases" })}
						<ExternalLink className="h-4 w-4" />
					</button>
					<button type="button" onClick={onDismiss} className={fullscreenSecondaryButtonClass}>
						{t("ota_prompt.later", { defaultValue: "Later" })}
					</button>
				</>
			}
		/>
	);
}

/** Shows the repository move at app start on app versions before the move. */
export function RepoMovedGate({ children }: { children: ReactNode }) {
	const nativeVersion = useNativeAppVersion();
	const [dismissed, setDismissed] = useState(dismissedThisSession);
	const applies = !dismissed && isBeforeRepoMove(nativeVersion);
	const hasRelease = useNewRepoHasRelease(applies);

	if (!applies || !hasRelease) {
		return <>{children}</>;
	}

	return (
		<div className="app-shell">
			<RepoMovedPromptView
				onDismiss={() => {
					dismissedThisSession = true;
					setDismissed(true);
				}}
			/>
		</div>
	);
}
