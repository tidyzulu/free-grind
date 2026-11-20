//! The app's identity, from its manifest (manifest/app.json), compiled in by
//! build.rs.

/// User-visible app name, e.g. "Free Grind".
pub const APP_NAME: &str = env!("FG_APP_NAME");

/// Lowercase slug for the app's own folders and the keyring service, e.g.
/// "free-grind".
pub const APP_SLUG: &str = env!("FG_APP_SLUG");
