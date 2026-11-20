#!/usr/bin/env sh
set -eu

if [ -d "$HOME/.cargo/bin" ]; then
  PATH="$HOME/.cargo/bin:$PATH"
fi

if [ -d "/opt/homebrew/bin" ]; then
  PATH="/opt/homebrew/bin:$PATH"
fi

if [ -d "/usr/local/bin" ]; then
  PATH="/usr/local/bin:$PATH"
fi

export PATH

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: cargo not found in PATH. Install Rust from https://rustup.rs and reopen your shell."
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun not found in PATH. Install Bun from https://bun.sh and reopen your shell."
  exit 1
fi

# The app manifest (manifest/app.json) sets the app identity (name, IDs, OTA),
# see scripts/manifest-env.mjs and scripts/tauri-config.mjs.
eval "$(bun --no-env-file scripts/manifest-env.mjs)"
case "${1:-}" in
  android|ios) target="$1" ;;
  *) target="" ;; # desktop: the host OS
esac
TAURI_CONFIG="$(bun --no-env-file scripts/tauri-config.mjs $target)"
export TAURI_CONFIG

exec bunx tauri "$@"
