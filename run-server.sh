#!/usr/bin/env bash
# Load rustup (Cargo) even if the shell never sourced ~/.zshrc / ~/.cargo/env.
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
else
  export PATH="$HOME/.cargo/bin:$PATH"
fi
exec cargo run --bin server
