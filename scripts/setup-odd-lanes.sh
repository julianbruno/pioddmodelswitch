#!/usr/bin/env bash
# Prepare three isolated Pi homes (ODD lanes) from an existing Pi home and install
# jb-odd-models into each. Nothing is written into the source home, no profile is
# activated, and Pi is not started. Launch each lane later with scripts/pi-opus.sh,
# scripts/pi-gpt.sh, and scripts/pi-grok.sh, then pick the profile inside that instance.
#
# Environment overrides:
#   PI_LANE_SOURCE     source Pi home (default: $HOME/.pi)
#   PI_LANE_OPUS_HOME  opus lane home (default: $HOME/.pi-opus)
#   PI_LANE_GPT_HOME   gpt lane home  (default: $HOME/.pi-gpt)
#   PI_LANE_GROK_HOME  grok lane home (default: $HOME/.pi-grok)
set -euo pipefail

fail() {
  printf 'setup-odd-lanes: %s\n' "$*" >&2
  exit 1
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALLER="$PACKAGE_ROOT/install/install.sh"

[ -n "${HOME:-}" ] || fail "HOME is not set; set HOME or every PI_LANE_* override."

SOURCE_HOME=${PI_LANE_SOURCE:-"$HOME/.pi"}
OPUS_HOME=${PI_LANE_OPUS_HOME:-"$HOME/.pi-opus"}
GPT_HOME=${PI_LANE_GPT_HOME:-"$HOME/.pi-gpt"}
GROK_HOME=${PI_LANE_GROK_HOME:-"$HOME/.pi-grok"}

[ -d "$SOURCE_HOME/agent" ] || fail "Source Pi home has no agent/ directory at $SOURCE_HOME/agent. Set PI_LANE_SOURCE to an existing Pi home."
[ -x "$INSTALLER" ] || fail "Package installer is missing or not executable: $INSTALLER"

# Resolve a path to its physical form so symlinked homes cannot bypass the source check.
# A missing dest is resolved through its nearest existing parent.
physical_path() {
  local path=$1 rest=""
  while [ ! -d "$path" ]; do
    rest="/$(basename -- "$path")$rest"
    path=$(dirname -- "$path")
  done
  printf '%s%s\n' "$(cd -- "$path" && pwd -P)" "$rest"
}

SOURCE_REAL=$(physical_path "$SOURCE_HOME")
OPUS_REAL=$(physical_path "$OPUS_HOME")
GPT_REAL=$(physical_path "$GPT_HOME")
GROK_REAL=$(physical_path "$GROK_HOME")

[ "$OPUS_REAL" != "$SOURCE_REAL" ] || fail "Opus lane home resolves to the source home ($SOURCE_REAL); choose a different PI_LANE_OPUS_HOME."
[ "$GPT_REAL" != "$SOURCE_REAL" ] || fail "GPT lane home resolves to the source home ($SOURCE_REAL); choose a different PI_LANE_GPT_HOME."
[ "$GROK_REAL" != "$SOURCE_REAL" ] || fail "Grok lane home resolves to the source home ($SOURCE_REAL); choose a different PI_LANE_GROK_HOME."
[ "$OPUS_REAL" != "$GPT_REAL" ] || fail "Opus and GPT lane homes resolve to the same path ($OPUS_REAL); they must be distinct."
[ "$OPUS_REAL" != "$GROK_REAL" ] || fail "Opus and Grok lane homes resolve to the same path ($OPUS_REAL); they must be distinct."
[ "$GPT_REAL" != "$GROK_REAL" ] || fail "GPT and Grok lane homes resolve to the same path ($GPT_REAL); they must be distinct."

# Identity files are copied once; an existing dest copy is never overwritten.
IDENTITY_FILES="auth.json settings.json mcp.json models.json claude-bridge.json"
# Gentle state files are copied once into <lane>/gentle-ai; dev-binary.json stays global.
GENTLE_FILES="background-subagents.json profiles.json"
# Bulky shared install dirs are symlinked, not duplicated.
SHARED_DIRS="npm install bin"

prepare_lane() {
  local dest=$1 label=$2 src_agent="$SOURCE_HOME/agent" dest_agent name
  dest_agent="$dest/agent"
  printf 'Preparing %s lane at %s\n' "$label" "$dest"
  mkdir -p "$dest_agent" "$dest/gentle-ai"

  for name in $GENTLE_FILES; do
    if [ -f "$SOURCE_HOME/gentle-ai/$name" ] && [ ! -e "$dest/gentle-ai/$name" ]; then
      cp -p "$SOURCE_HOME/gentle-ai/$name" "$dest/gentle-ai/$name"
    fi
  done

  for name in $IDENTITY_FILES; do
    if [ -f "$src_agent/$name" ] && [ ! -e "$dest_agent/$name" ]; then
      cp -p "$src_agent/$name" "$dest_agent/$name"
    fi
  done

  # Routing base: copy the source runtime file only when the dest has none.
  if [ ! -e "$dest_agent/subagents.json" ]; then
    if [ -f "$src_agent/subagents.json" ]; then
      cp -p "$src_agent/subagents.json" "$dest_agent/subagents.json"
    else
      printf '{}\n' > "$dest_agent/subagents.json"
    fi
  fi

  # Extensions: seed the dest tree from the source when the package extension is not
  # present yet. Existing dest extensions are left in place; the installer refreshes
  # only the jb-odd-models files and never deletes extra dest files.
  if [ -d "$src_agent/extensions" ] && [ ! -e "$dest_agent/extensions/odd-model-profiles.ts" ]; then
    mkdir -p "$dest_agent/extensions"
    cp -a "$src_agent/extensions/." "$dest_agent/extensions/"
  fi

  for name in $SHARED_DIRS; do
    if [ -e "$src_agent/$name" ] && [ ! -e "$dest_agent/$name" ]; then
      ln -s "$SOURCE_REAL/agent/$name" "$dest_agent/$name"
    fi
  done

  printf 'Installing jb-odd-models into %s\n' "$dest"
  PI_HOME="$dest" "$INSTALLER" || fail "Installer failed for $label lane at $dest."
}

prepare_lane "$OPUS_HOME" "opus"
prepare_lane "$GPT_HOME" "gpt"
prepare_lane "$GROK_HOME" "grok"

cat <<EOF

ODD lanes are ready (no profile activated, Pi not started):
  opus: $OPUS_HOME
  gpt:  $GPT_HOME
  grok: $GROK_HOME

Next steps:
  1. Launch each lane in its own terminal (the launchers also set the Gentle homes):
       $SCRIPT_DIR/pi-opus.sh
       $SCRIPT_DIR/pi-gpt.sh
       $SCRIPT_DIR/pi-grok.sh
  2. Inside the opus instance run:  /jb-odd-models claude-opus-5.5
     Inside the gpt instance run:   /jb-odd-models openai6-1-gentle
     Inside the grok instance run:  /jb-odd-models grok-4-7
EOF
