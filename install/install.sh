#!/usr/bin/env sh
set -eu

fail() {
  printf 'jb-odd-models installer: %s\n' "$*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is required (Pi itself requires Node.js)."
NODE_VERSION=$(node -p "process.versions.node" 2>/dev/null || node --version 2>/dev/null || printf '0.0.0')
NODE_VERSION=${NODE_VERSION#v}
NODE_MAJOR=${NODE_VERSION%%.*}
NODE_REST=${NODE_VERSION#*.}
NODE_MINOR=${NODE_REST%%.*}
case "$NODE_MAJOR:$NODE_MINOR" in
  ''|*[!0-9:]* ) fail "Could not determine Node.js version. Node.js 22.19.0 or newer is required for --experimental-strip-types." ;;
esac
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  fail "Node.js 22.19.0 or newer is required to run the TypeScript installer with --experimental-strip-types (found v$NODE_VERSION)."
fi

if [ -z "${PI_HOME:-}" ] && [ -z "${HOME:-}" ]; then
  fail "Neither HOME nor PI_HOME is set. Set one before installing."
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
[ -f "$SCRIPT_DIR/model-profiles-install.ts" ] || fail "Package asset is missing: install/model-profiles-install.ts"

# An explicit home is an isolation boundary (also used by setup-odd-lanes.sh).
if [ -n "${PI_HOME:-}" ]; then
  [ -d "$PI_HOME/agent" ] || fail "Pi agent directory not found at $PI_HOME/agent. Install Gentle Pi first, or set PI_HOME to its Pi home."
  PACKAGE_ROOT=$PACKAGE_ROOT PI_HOME=$PI_HOME exec node --experimental-strip-types "$SCRIPT_DIR/model-profiles-install.ts"
fi

# Refresh installed homes only. Launching or saving a profile never fans out.
installed=0
for name in .pi .pi-gpt .pi-grok .pi-opus; do
  target="$HOME/$name"
  if [ ! -d "$target/agent" ]; then
    printf 'Skipped %s: agent directory not found.\n' "$target"
    continue
  fi
  PACKAGE_ROOT=$PACKAGE_ROOT PI_HOME=$target node --experimental-strip-types "$SCRIPT_DIR/model-profiles-install.ts"
  installed=$((installed + 1))
done
[ "$installed" -gt 0 ] || fail "No existing Pi homes found. Install Gentle Pi first, or set PI_HOME to its Pi home."
