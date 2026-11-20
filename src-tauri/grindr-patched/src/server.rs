//! The official servers the client talks to.
// Tests use the local test server instead.
#![cfg_attr(test, allow(dead_code))]

/// REST origin.
pub(crate) const OFFICIAL_API_BASE: &str = "https://grindr.mobi";

/// WebSocket endpoint.
pub(crate) const OFFICIAL_WS_URL: &str = "wss://grindr.mobi/v1/ws";
