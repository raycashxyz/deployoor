#!/usr/bin/env bash
# Docs deploy via GitHub Actions only — see .github/workflows/docs-deploy.yml
set -euo pipefail

echo "Local Vercel deploys are disabled."
echo "Push to main (apps/docs changes) and GitHub Actions will deploy to raycash/deployoor-docs."
echo "Workflow: .github/workflows/docs-deploy.yml"
exit 1
