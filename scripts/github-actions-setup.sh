#!/usr/bin/env bash
# Set GitHub Actions variable and secret for CI (Convex + Next.js).
#
# 1. Re-auth if needed:  gh auth login
# 2. Create the repo on GitHub if needed (e.g. bkrmint/rmint_restaurant_app).
# 3. Run:  GITHUB_REPO=bkrmint/rmint_restaurant_app ./scripts/github-actions-setup.sh
#    Or from repo root with origin set:  ./scripts/github-actions-setup.sh

set -e
REPO="${GITHUB_REPO:-}"
if [ -z "$REPO" ]; then
  ORIGIN=$(git remote get-url origin 2>/dev/null || true)
  if [[ "$ORIGIN" =~ github\.com[:/]([^/]+/[^/]+?)(\.git)?$ ]]; then
    REPO="${BASH_REMATCH[1]}"
  else
    echo "Set GITHUB_REPO (e.g. bkrmint/rmint_restaurant_app) or add a GitHub remote."
    exit 1
  fi
fi

echo "Using repo: $REPO"

# Variable (non-sensitive)
gh variable set NEXT_PUBLIC_CONVEX_URL --body "https://calm-chickadee-544.convex.cloud" --repo "$REPO"
echo "Set variable NEXT_PUBLIC_CONVEX_URL."

# Secret (you will be prompted to paste the Convex deploy key)
echo "Paste your Convex deploy key (Dashboard → Settings → Deploy Key) when prompted:"
gh secret set CONVEX_DEPLOY_KEY --repo "$REPO"
echo "Done."
