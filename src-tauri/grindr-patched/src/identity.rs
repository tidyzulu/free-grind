//! Who the client says it is: the official Android app, with its version
//! ([`crate::APP_VERSION`]), a real Android device profile and okhttp's
//! fingerprint.

/// The official app's product token in the `User-Agent`.
pub(crate) const OFFICIAL_PRODUCT: &str = "grindr3";

/// Product token, version and build number for the `User-Agent`.
pub(crate) fn client_identity() -> (&'static str, &'static str, &'static str) {
	(OFFICIAL_PRODUCT, crate::headers::APP_VERSION, crate::headers::BUILD_NUMBER)
}
