import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * "Add account" on the sign-in/up screens (`?mode=add-profile`), opened from
 * Settings while another account is signed in.
 */
export function useAddProfileMode() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const addProfileMode = searchParams.get("mode") === "add-profile";

	// Keeps the add-account mode across the auth pages.
	const query = addProfileMode ? "?mode=add-profile" : "";

	const cancel = async () => {
		navigate(-1);
	};

	/**
	 * Goes to another auth page in the same mode. While adding, it replaces
	 * the entry, so cancelling still leads back to where the add started.
	 */
	const goTo = (path: string) => navigate(`${path}${query}`, { replace: addProfileMode });

	return { addProfileMode, cancel, goTo };
}
