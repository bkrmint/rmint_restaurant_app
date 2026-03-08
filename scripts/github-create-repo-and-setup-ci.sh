#!/usr/bin/env bash
# 1. Ensure you're logged in:  gh auth login   (complete in browser if prompted)
# 2. Run:  ./scripts/github-create-repo-and-setup-ci.sh
#
# This script:
#   - Creates GitHub repo bkrmint/rmint_restaurant_app (if it doesn't exist)
#   - Adds origin and pushes (if not already pushed)
#   - Sets Actions variable NEXT_PUBLIC_CONVEX_URL and prompts for CONVEX_DEPLOY_KEY

set -e
REPO="${GITHUB_REPO:-bkrmint/rmint_restaurant_app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Checking GitHub auth ==="
if ! gh auth status -h github.com &>/dev/null; then
  echo "Not logged in. Run:  gh auth login -h github.com -p https -w"
  exit 1
fi
echo "OK"

echo ""
echo "=== Creating repo $REPO if needed ==="
if gh repo view "$REPO" &>/dev/null; then
  echo "Repo already exists."
else
  gh repo create "$REPO" --public --description "RMint restaurant app (Next.js + Convex + Neon)" --source=. --remote=origin
  echo "Created and set origin."
fi

# If origin exists but points elsewhere, ensure it's our repo
if git remote get-url origin &>/dev/null; then
  CURRENT=$(git remote get-url origin)
  if [[ ! "$CURRENT" =~ github\.com[:/]${REPO}(\.git)?$ ]]; then
    echo "Remote origin exists but is not $REPO. Setting origin to $REPO."
    git remote set-url origin "https://github.com/${REPO}.git"
  fi
else
  git remote add origin "https://github.com/${REPO}.git"
fi

echo ""
echo "=== Pushing to origin ==="
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH" 2>/dev/null || { echo "Push failed (e.g. no commits or already pushed). Continue to set secrets anyway."; }

echo ""
echo "=== Setting GitHub Actions variable and secret ==="
export GITHUB_REPO="$REPO"
"$ROOT/scripts/github-actions-setup.sh"
