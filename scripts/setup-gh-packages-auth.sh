#!/usr/bin/env bash
# scripts/setup-gh-packages-auth.sh
# One-time machine setup so pnpm publish/install can talk to GitHub Packages
# without you ever managing a PAT. Idempotent - safe to re-run.

set -euo pipefail
echo
echo "=== GitHub Packages auth setup ==="

if ! command -v gh &>/dev/null; then
  echo "Install GitHub CLI first: https://cli.github.com/" >&2
  echo "  macOS:  brew install gh" >&2
  echo "  Debian: sudo apt install gh    (or see GitHub docs)" >&2
  exit 1
fi
echo "[1/4] gh CLI found."

if ! gh auth status -h github.com &>/dev/null; then
  echo "[2/4] gh not logged in. Launching browser login with write:packages scope..."
  gh auth login -h github.com -s write:packages -w
else
  echo "[2/4] gh logged in to github.com."
fi

if ! gh auth status -h github.com 2>&1 | grep -q "write:packages"; then
  echo "[3/4] Adding write:packages scope..."
  gh auth refresh -h github.com -s write:packages
else
  echo "[3/4] write:packages scope already granted."
fi

if [[ -n "${ZSH_VERSION:-}" ]] || [[ "${SHELL:-}" == */zsh ]]; then
  PROFILE="$HOME/.zshrc"
else
  PROFILE="$HOME/.bashrc"
fi

MARKER='# >>> GITHUB_PACKAGES_TOKEN from gh CLI (for @skavan/* publish + install) <<<'

if grep -qF "$MARKER" "$PROFILE" 2>/dev/null; then
  echo "[4/4] Profile already configured: $PROFILE"
else
  cat >> "$PROFILE" <<'EOF'

# >>> GITHUB_PACKAGES_TOKEN from gh CLI (for @skavan/* publish + install) <<<
# Re-run scripts/setup-gh-packages-auth.sh to update.
if command -v gh &>/dev/null; then
  export GITHUB_PACKAGES_TOKEN="$(gh auth token 2>/dev/null)"
fi
EOF
  echo "[4/4] Appended auto-token block to $PROFILE"
fi

export GITHUB_PACKAGES_TOKEN="$(gh auth token 2>/dev/null)"
LEN=${#GITHUB_PACKAGES_TOKEN}
echo
echo "Done. Token in this session: $LEN chars. Open a fresh shell to pick up the profile."
