#!/usr/bin/env bash
# Publish both repos to GitHub. Run AFTER `gh auth login`.
set -e

DOWNLOADS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }
USER=$(gh api user --jq .login)
echo "Publishing as $USER"

# 1 — the design system you paste into Peel for the live demo
cd "$DOWNLOADS/aurora-ui"
gh repo create aurora-ui --public --source=. --remote=origin --push \
  --description "Aurora UI — React component library. Deliberately not agent-ready: scores 12/100 on Peel."
echo "  design system -> https://github.com/$USER/aurora-ui"

# 2 — Peel itself
cd "$DOWNLOADS/peel final"
gh repo create peel --public --source=. --remote=origin --push \
  --description "Score a design system for agent readiness, convert it to a three-layer contract, and prove it with a before/after visual book."
echo "  app           -> https://github.com/$USER/peel"

echo
echo "Paste this into Peel to see the live conversion:"
echo "  https://github.com/$USER/aurora-ui"
