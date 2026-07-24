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
  rm -f "$HARDHAT/.env"
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

# Catch tape syntax errors now, not after a full build + anvil boot.
vhs validate scripts/demo/demo.tape

mkdir -p assets/brand/dist

# Build deployoor *and* @deployoor/hardhat (plus their deps): the example's
# hardhat.config.js requires the plugin, which resolves to its dist/. Building only
# `deployoor` leaves the plugin unbuilt and every taped command dies with
# MODULE_NOT_FOUND — a silently broken recording.
pnpm build --filter="@deployoor/hardhat..." >/dev/null

# Warm the artifacts the tape's first scene lists. Never silence this: a failed
# pre-warm is exactly what produces a GIF full of red errors.
pnpm --filter @example/hardhat exec hardhat compile

if [[ ! -d "$HARDHAT/artifacts/contracts/Counter.sol" ]]; then
  echo "Pre-warm compile produced no artifacts/ — aborting before recording a broken GIF." >&2
  exit 1
fi

# Clean generated folders so the tape shows artifacts → deployers → deployments.
# deployments/ holds a committed record, restored after recording (see below).
rm -rf "$HARDHAT/deployers" "$HARDHAT/deployments"

# Local chain for scripts/deploy.ts (anvil account #0).
anvil --port 8545 --silent &
ANVIL_PID=$!
for _ in $(seq 1 20); do
  if curl -s -o /dev/null -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    http://127.0.0.1:8545; then
    break
  fi
  sleep 0.5
done

export RPC_URL=http://127.0.0.1:8545
# Well-known Anvil default test account #0 private key (dev-only, not a secret).
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# The deploy script runs under `tsx --env-file-if-exists=.env`, which prints
# ".env not found. Continuing without it." on every run — four lines of noise in the
# recording. Same values as the exports above; gitignored, and removed on exit.
printf 'RPC_URL=%s\nPRIVATE_KEY=%s\n' "$RPC_URL" "$PRIVATE_KEY" >"$HARDHAT/.env"

vhs scripts/demo/demo.tape

# The tape's payoff is the record appearing on disk. If it didn't, the GIF shows a
# failed deploy — catch that here rather than shipping it to the README.
if ! compgen -G "$HARDHAT/deployments/*/Counter.json" >/dev/null; then
  echo "Recording finished but no deployments/*/Counter.json exists — the taped deploy failed." >&2
  echo "Inspect the GIF before using it; the demo's key beat is missing." >&2
  exit 1
fi

# Recording rewrites the committed record with a fresh tx hash / block. Restore it so
# a recording leaves no diff on tracked files.
git -C "$ROOT" checkout -- examples/hardhat/deployments 2>/dev/null || true

if command -v ffmpeg >/dev/null 2>&1; then
  # 64-color palette + Bayer dithering: the text is flat-colored, so this cuts the file
  # size several-fold with no visible loss. README GIFs need to load on mobile.
  ffmpeg -y -i assets/brand/dist/demo.gif \
    -filter_complex "[0:v]fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 assets/brand/dist/demo-sm.gif 2>/dev/null || true
  if [[ -s assets/brand/dist/demo-sm.gif ]]; then
    echo "Also wrote assets/brand/dist/demo-sm.gif ($(du -h assets/brand/dist/demo-sm.gif | cut -f1), for README)"
  fi
fi

echo "Done: assets/brand/dist/demo.gif"
