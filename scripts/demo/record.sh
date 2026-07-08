#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
HARDHAT="$ROOT/examples/hardhat"
ANVIL_PID=""

cleanup() {
  if [[ -n "$ANVIL_PID" ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! command -v vhs >/dev/null 2>&1; then
  echo "VHS is required. Install: brew install vhs"
  exit 1
fi

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil is required (Foundry). Install: https://book.getfoundry.sh/getting-started/installation"
  exit 1
fi

mkdir -p assets/brand/dist

# Build deployoor + warm Hardhat deps.
pnpm --filter deployoor build >/dev/null
pnpm --filter @example/hardhat exec hardhat compile >/dev/null 2>&1 || true

# Clean generated folders so the tape shows artifacts → deployers → deployments.
rm -rf "$HARDHAT/deployers" "$HARDHAT/deployments"

# Local chain for scripts/deploy.ts (anvil account #0).
anvil --port 8545 --silent &
ANVIL_PID=$!
sleep 1

export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

vhs scripts/demo/demo.tape

if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -i assets/brand/dist/demo.gif \
    -filter_complex "[0:v]fps=12,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" \
    assets/brand/dist/demo-sm.gif 2>/dev/null || true
  if [[ -s assets/brand/dist/demo-sm.gif ]]; then
    echo "Also wrote assets/brand/dist/demo-sm.gif (smaller, for README)"
  fi
fi

echo "Done: assets/brand/dist/demo.gif"
