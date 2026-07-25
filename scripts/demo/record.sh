#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
HARDHAT="$ROOT/examples/hardhat"
ANVIL_PID=""
# Set once we are about to clobber deployments/, so cleanup only reverts what we touched.
DEPLOYMENTS_DIRTY=""
IN_GIT_REPO=""
# Where an existing examples/hardhat/.env was parked, and whether this run authored one.
ENV_BACKUP=""
ENV_WRITTEN=""
TMP_GIF="$ROOT/assets/brand/dist/demo-sm.gif.tmp"

cleanup() {
  if [[ -n "$ANVIL_PID" ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
  rm -f "$TMP_GIF"
  # Put the developer's own .env back, or remove only a file this run created. Never blanket-delete
  # it: the example's README tells you to `cp .env.example .env`, so it routinely holds a real
  # RPC URL and private key.
  if [[ -n "$ENV_BACKUP" && -f "$ENV_BACKUP" ]]; then
    mv -f "$ENV_BACKUP" "$HARDHAT/.env"
  elif [[ -n "$ENV_WRITTEN" ]]; then
    rm -f "$HARDHAT/.env"
  fi
  # Recording wipes deployments/ and the taped deploy rewrites the committed record with a fresh
  # tx hash. Restore from the trap so *any* exit path — including an early failure — leaves the
  # folder as it was. `clean` first (the deploy creates untracked chain folders that `checkout`
  # cannot remove), then `checkout` to bring tracked records back. Safe because we refuse to
  # start unless the folder is pristine, so there is no user work here to destroy.
  if [[ -n "$DEPLOYMENTS_DIRTY" && -n "$IN_GIT_REPO" ]]; then
    git -C "$ROOT" clean -qfd -- examples/hardhat/deployments 2>/dev/null || true
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

# Recording wipes deployments/ and restores it from git, which would silently discard uncommitted
# work there. Refuse to start rather than eat someone's changes — checked before the build, so it
# costs a second rather than a full rebuild.
#
# `git status --porcelain -uall` rather than `git diff`: diff is blind to untracked files, so an
# unpushed record from a real deploy (say deployments/84532-base-sepolia/Vault.json) read as clean,
# then `rm -rf` destroyed it and `checkout` could not bring it back. For a tool whose whole premise
# is that the record is the source of truth, that is the worst thing this script could do.
if [[ -n "$IN_GIT_REPO" ]] &&
  [[ -n "$(git -C "$ROOT" status --porcelain -uall -- examples/hardhat/deployments)" ]]; then
  echo "examples/hardhat/deployments is not clean:" >&2
  git -C "$ROOT" status --short -uall -- examples/hardhat/deployments >&2
  echo "Recording rewrites that folder and restores it from git on exit, so commit or stash first." >&2
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
# ".env not found. Continuing without it." on every run — four lines of noise in the recording.
# Write one with the anvil values above (gitignored; the trap removes it).
#
# Park an existing .env first instead of overwriting it. Two reasons: it is the developer's file
# and routinely holds a real private key, and letting it participate in the recording risks the
# taped deploy broadcasting against whatever RPC and key it names rather than local anvil.
if [[ -f "$HARDHAT/.env" ]]; then
  ENV_BACKUP="$(mktemp "${TMPDIR:-/tmp}/deployoor-demo-env.XXXXXX")"
  cp "$HARDHAT/.env" "$ENV_BACKUP"
  echo "Parked your examples/hardhat/.env for the recording; it is restored on exit."
fi
printf 'RPC_URL=%s\nPRIVATE_KEY=%s\n' "$RPC_URL" "$PRIVATE_KEY" >"$HARDHAT/.env"
ENV_WRITTEN=1

vhs scripts/demo/demo.tape

# The tape's payoff is the record appearing on disk. If it didn't, the GIF shows a
# failed deploy — catch that here rather than shipping it to the README.
if ! compgen -G "$HARDHAT/deployments/*/Counter.json" >/dev/null; then
  echo "Recording finished but no deployments/*/Counter.json exists — the taped deploy failed." >&2
  echo "Inspect the GIF before using it; the demo's key beat is missing." >&2
  exit 1
fi

if command -v ffmpeg >/dev/null 2>&1; then
  # Encode to a temp file and move it into place only once it is known good. demo-sm.gif is the
  # committed README asset, so neither deleting it up front (a failed encode would leave the README
  # pointing at nothing) nor writing over it in place (a partial file would still pass a size check
  # and be reported as fresh) is acceptable.
  #
  # 64-color palette + Bayer dithering: the text is flat-colored, so this cuts the file size
  # several-fold with no visible loss. README GIFs need to load on mobile.
  # No `|| true` — ffmpeg is installed, so a failure here is real and should stop the run.
  # `-f gif` is required: the temp path ends in .tmp, so ffmpeg cannot infer the muxer from it.
  ffmpeg -y -loglevel error -i assets/brand/dist/demo.gif \
    -filter_complex "[0:v]fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 -f gif "$TMP_GIF"
  if [[ ! -s "$TMP_GIF" ]]; then
    echo "ffmpeg exited 0 but produced no optimized GIF; leaving the committed demo-sm.gif alone." >&2
    exit 1
  fi
  mv -f "$TMP_GIF" assets/brand/dist/demo-sm.gif
  echo "Also wrote assets/brand/dist/demo-sm.gif ($(du -h assets/brand/dist/demo-sm.gif | cut -f1), for README)"
fi

echo "Done: assets/brand/dist/demo.gif"
