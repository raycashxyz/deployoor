#!/usr/bin/env bash
# Production deploy for deployoor docs on Vercel (raycash team).
# Uses prebuilt output so the monorepo install runs locally (CLI uploads only apps/docs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DOCS="$ROOT/apps/docs"

# raycash/deployoor-docs — override via env for CI (GitHub Actions secrets).
VERCEL_SCOPE="${VERCEL_SCOPE:-raycash}"
VERCEL_PROJECT_NAME="${VERCEL_PROJECT_NAME:-deployoor-docs}"
VERCEL_ORG_ID="${VERCEL_ORG_ID:-team_DHmgXndhGMn6I3jq2kpBQr4W}"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_HaqseyJIYjK2FReuqwMOTIn2aWc2}"

cd "$DOCS"

if ! vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: vercel login"
  exit 1
fi

echo "Linking ${VERCEL_SCOPE}/${VERCEL_PROJECT_NAME}…"
vercel link --yes --scope "$VERCEL_SCOPE" --project "$VERCEL_PROJECT_NAME"

export VERCEL_ORG_ID VERCEL_PROJECT_ID

echo "Building for Vercel (local)…"
vercel build --prod --yes --scope "$VERCEL_SCOPE"

echo "Deploying to production…"
vercel deploy --prebuilt --prod --yes --scope "$VERCEL_SCOPE"

echo ""
echo "Live: https://deployoor-docs.vercel.app"
echo "Dashboard: https://vercel.com/${VERCEL_SCOPE}/${VERCEL_PROJECT_NAME}"
