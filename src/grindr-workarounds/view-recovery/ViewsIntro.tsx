import { useCallback, useEffect, useState } from "react";
import { History, Eye, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FullscreenPrompt, fullscreenPrimaryButtonClass, fullscreenCardClass } from "../../components/FullscreenPrompt";

const SEEN_KEY = "fg-interest-onboarding-seen";

function hasSeen(): boolean {
	try {
		return window.localStorage.getItem(SEEN_KEY) !== null;
	} catch {
		return true;
	}
}

/** One-time intro on the Views tab: Grindr's visitor paywall and how Free Grind recovers locked previews. */
export function ViewsIntro({ visible }: { visible: boolean }) {
	const [show, setShow] = useState(() => !hasSeen());

	// Shown again when coming back to the Views tab without having acknowledged it.
	useEffect(() => {
		if (visible && !hasSeen()) setShow(true);
	}, [visible]);

	const acknowledge = useCallback(() => {
		setShow(false);
		try {
			window.localStorage.setItem(SEEN_KEY, "true");
		} catch {
			// ignore storage errors
		}
	}, []);

	return show && visible ? <ViewsIntroPrompt onConfirm={acknowledge} /> : null;
}

function ViewsIntroPrompt({ onConfirm }: { onConfirm: () => void }) {
	const { t } = useTranslation();

	return (
		<FullscreenPrompt
			overlay
			icon={Eye}
			title={t("grindr:interest_page.onboarding.title", "Profile Visitors")}
			description={t(
				"grindr:interest_page.onboarding.limitation_desc",
				"Grindr normally only shows the very last visitor in full. Others are typically hidden behind a paywall or shown as anonymous previews.",
			)}
			footer={
				<button type="button" onClick={onConfirm} className={fullscreenPrimaryButtonClass}>
					{t("grindr:interest_page.onboarding.button", "Got it!")}
				</button>
			}
		>
			<div className={`${fullscreenCardClass} overflow-hidden text-start`}>
				<div className="flex items-start gap-3 px-4 py-3.5">
					<div className="shrink-0 rounded-2xl ink-tint-8 p-2.5 text-[var(--accent)]">
						<Sparkles className="h-5 w-5" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold leading-snug text-[var(--text)]">
							{t("grindr:interest_page.onboarding.recovery_title", "Smart Recovery")}
						</p>
						<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
							{t(
								"grindr:interest_page.onboarding.recovery_desc",
								"{{appName}} automatically matches anonymous previews with your local history. If we find a match, we reveal the profile for you.",
							)}
						</p>
						<span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]">
							<History className="h-3.5 w-3.5" />
							{t("interest_page.recovered_tooltip", "Identified from local history")}
						</span>
					</div>
				</div>
			</div>
		</FullscreenPrompt>
	);
}
