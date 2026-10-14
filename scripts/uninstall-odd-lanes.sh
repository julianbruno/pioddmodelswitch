#!/usr/bin/env bash
# Preview, archive, or permanently delete isolated ODD lane homes.
# Does not operate on shared Pi installation targets. See ODD_LANES_LIFECYCLE.md.
set -euo pipefail

fail() {
  printf 'uninstall-odd-lanes: %s\n' "$*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is required."
NODE_VERSION=$(node -p 'process.versions.node')
NODE_MAJOR=${NODE_VERSION%%.*}
NODE_REST=${NODE_VERSION#*.}
NODE_MINOR=${NODE_REST%%.*}
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  fail "Node.js 22.19.0 or newer is required (found v$NODE_VERSION)."
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node --experimental-strip-types "$SCRIPT_DIR/uninstall-odd-lanes.ts" "$@"
