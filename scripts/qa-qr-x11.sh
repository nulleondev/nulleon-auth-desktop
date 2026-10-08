#!/usr/bin/env bash
set -euo pipefail
project_dir="$1"
cd "$project_dir"
python3 scripts/qa-qr-window.py "$project_dir/.cache/security-retest/qr.png" > .cache/security-retest/qr-window.log 2>&1 &
qr_window_pid=$!
trap 'kill "$qr_window_pid" 2>/dev/null || true' EXIT
timeout 15 xdotool search --sync --onlyvisible --name 'Nulleon Synthetic QR QA' >/dev/null
cargo test --manifest-path apps/nulleon-authenticator/src-tauri/Cargo.toml qr::tests::capture_real_x11_screen -- --ignored --exact --test-threads=1
kill "$qr_window_pid"
wait "$qr_window_pid" 2>/dev/null || true
cargo test --manifest-path apps/nulleon-authenticator/src-tauri/Cargo.toml qr::tests::capture_blank_x11_screen -- --ignored --exact --test-threads=1
