import { UsersThree } from "@phosphor-icons/react";
import { cn } from "../../../../utils/cn";

/**
 * A group's avatar: always the group glyph, never members' photos (a group
 * isn't any one of them). Fills its parent box, which sets size and shape.
 */
export function GroupAvatar({ alt, className }: { alt: string; className?: string }) {
	return (
		<div
			role="img"
			aria-label={alt}
			className={cn(
				"flex h-full w-full items-center justify-center bg-[color-mix(in_srgb,var(--surface-2)_80%,var(--accent))] text-[var(--accent-readable)]",
				className,
			)}
		>
			<UsersThree weight="fill" className="h-1/2 w-1/2" />
		</div>
	);
}
