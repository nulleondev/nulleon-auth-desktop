#!/usr/bin/env bash
# Real QR decoding/capture. Never capture the user's desktop.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"
mkdir -p .cache/security-retest
cargo test --manifest-path apps/nulleon-authenticator/src-tauri/Cargo.toml --lib -- --test-threads=1
NULLEON_QA_QR_IMAGE="$project_dir/.cache/security-retest/qr.png" cargo test --manifest-path apps/nulleon-authenticator/src-tauri/Cargo.toml qr::tests::write_screen_fixture -- --ignored --exact --test-threads=1
xvfb-run -a -s '-screen 0 1280x1000x24' env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 bash scripts/qa-qr-x11.sh "$project_dir"
