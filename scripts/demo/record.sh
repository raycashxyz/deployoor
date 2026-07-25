#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
HARDHAT="$ROOT/examples/hardhat"
ANVIL_PID=""
# Set once we are about to clobber deployments/, so cleanup only reverts what we touched.
DEPLOYMENTS_DIRTY=""
IN_GIT_REPO=""

cleanup() {
  if [[ -n "$ANVIL_PID" ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
  rm -f "$HARDHAT/.env"
  # Recording wipes deployments/ and the taped deploy rewrites the committed record with a fresh
  # tx hash. Restore it from the trap so *any* exit path — including an early failure — leaves
  # tracked files as they were, instead of stranding a deleted record in the working tree.
  if [[ -n "$DEPLOYMENTS_DIRTY" && -n "$IN_GIT_REPO" ]]; then
    git -C "$ROOT" checkout -- examples/hardhat/deployments 2>/dev/null || true
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

# Catch tape syntax errors now, not after a full build + anvil boot.
vhs validate scripts/demo/demo.tape

# The wipe/restore dance below is git-based, so skip it entirely outside a work tree (e.g. a
# source tarball) rather than failing on a `git` that has nothing to talk to.
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  IN_GIT_REPO=1
fi

# Recording restores deployments/ wholesale via `git checkout`, which would silently discard
# uncommitted work there. Refuse to start rather than eat someone's changes — and check before
# the build, so this costs a second rather than a full rebuild.
if [[ -n "$IN_GIT_REPO" ]] &&
  { ! git -C "$ROOT" diff --quiet -- examples/hardhat/deployments ||
    ! git -C "$ROOT" diff --cached --quiet -- examples/hardhat/deployments; }; then
  echo "examples/hardhat/deployments has uncommitted changes; commit or stash them first." >&2
  echo "Recording rewrites that folder and restores it from git on exit." >&2
  exit 1
fi

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
# deployments/ holds a committed record; the EXIT trap puts it back.
DEPLOYMENTS_DIRTY=1
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

if command -v ffmpeg >/dev/null 2>&1; then
  # Drop any previous optimized asset first: on a failed encode a leftover file would still pass
  # the size check below and get reported as freshly written.
  rm -f assets/brand/dist/demo-sm.gif
  # 64-color palette + Bayer dithering: the text is flat-colored, so this cuts the file
  # size several-fold with no visible loss. README GIFs need to load on mobile.
  # No `|| true` — ffmpeg is installed, so a failure here means the README asset is missing.
  ffmpeg -y -loglevel error -i assets/brand/dist/demo.gif \
    -filter_complex "[0:v]fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 assets/brand/dist/demo-sm.gif
  if [[ ! -s assets/brand/dist/demo-sm.gif ]]; then
    echo "ffmpeg exited 0 but wrote no demo-sm.gif — the README asset is missing." >&2
    exit 1
  fi
  echo "Also wrote assets/brand/dist/demo-sm.gif ($(du -h assets/brand/dist/demo-sm.gif | cut -f1), for README)"
fi

echo "Done: assets/brand/dist/demo.gif"
