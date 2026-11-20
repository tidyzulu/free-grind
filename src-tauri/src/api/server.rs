//! The app talks only to the official Grindr servers.
//!
//! Older builds could also talk to a Free Grind server and remembered the
//! backend per saved account (`{"kind":"official"}`, `{"kind":"freeGrind"}`
//! or `{"kind":"custom",…}`). Those records are still read: an account, or a
//! stored active session, of another backend is not this app's, stays hidden
//! and is never sent to Grindr.

use super::auth::{clear_slot, get_slot_bytes, AuthStorage, DeviceStorage};

const ACTIVE_SERVER_SLOT: &str = "server-config";

fn account_server_slot(profile_id: &str) -> String {
    format!("server-{profile_id}")
}

/// Whether a stored backend record names the official servers. A missing or
/// unreadable record counts as official (accounts saved before server
/// selection existed).
fn is_official(bytes: Option<Vec<u8>>) -> bool {
    let Some(bytes) = bytes else { return true };
    match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(value) => value.get("kind").and_then(|k| k.as_str()).is_none_or(|kind| kind == "official"),
        Err(_) => true,
    }
}

pub struct ServerStorage;

impl ServerStorage {
    /// Whether a saved account lives on the official servers.
    pub fn belongs_here(profile_id: &str) -> bool {
        is_official(get_slot_bytes(&account_server_slot(profile_id)).ok().flatten())
    }

    pub fn forget_account(profile_id: &str) {
        let _ = clear_slot(&account_server_slot(profile_id));
    }
}

/// Startup, before the first client is built: a build that could talk to
/// another backend may have left that backend active, with its session. That
/// session is dropped together with the device identity, so neither reaches
/// Grindr (the two servers must not be able to correlate the device). The
/// account itself stays saved, just hidden from the switcher.
pub fn drop_other_backend_session() {
    if is_official(get_slot_bytes(ACTIVE_SERVER_SLOT).ok().flatten()) {
        return;
    }
    if AuthStorage::get_session().ok().flatten().is_some() {
        eprintln!("[server] dropping the stored session of another backend");
        let _ = AuthStorage::clear_session();
    }
    let _ = DeviceStorage::save(&grindr::DeviceInfo::generate());
    let _ = clear_slot(ACTIVE_SERVER_SLOT);
}

#[cfg(test)]
mod tests {
    use super::is_official;

    #[test]
    fn only_official_records_belong_here() {
        assert!(is_official(None));
        assert!(is_official(Some(br#"{"kind":"official"}"#.to_vec())));
        assert!(!is_official(Some(br#"{"kind":"freeGrind"}"#.to_vec())));
        assert!(!is_official(Some(br#"{"kind":"custom","apiBase":"https://api.example.org"}"#.to_vec())));
    }
}
