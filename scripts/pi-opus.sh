#!/usr/bin/env bash
# Launch Pi in the opus ODD lane. Stock Pi reads extensions, auth, and subagents from
# PI_CODING_AGENT_DIR, and Gentle reads its agent and config homes from
# GENTLE_PI_AGENT_HOME and GENTLE_PI_CONFIG_HOME (otherwise it applies the global
# ~/.pi/gentle-ai/models.json to this lane), so all four are exported before exec.
#
#   PI_LANE_OPUS_HOME  lane home (default: $HOME/.pi-opus)
#   PI_LANE_DRY_RUN=1  print the exported env and exit without starting Pi
set -euo pipefail

fail() {
  printf 'pi-opus: %s\n' "$*" >&2
  exit 1
}

PI_HOME=${PI_LANE_OPUS_HOME:-"${HOME:?HOME is not set}/.pi-opus"}
PI_CODING_AGENT_DIR="$PI_HOME/agent"
GENTLE_PI_AGENT_HOME="$PI_HOME/agent"
GENTLE_PI_CONFIG_HOME="$PI_HOME/gentle-ai"
[ -d "$PI_CODING_AGENT_DIR" ] || fail "Lane agent directory not found at $PI_CODING_AGENT_DIR. Run scripts/setup-odd-lanes.sh first."

export PI_HOME PI_CODING_AGENT_DIR GENTLE_PI_AGENT_HOME GENTLE_PI_CONFIG_HOME

if [ "${PI_LANE_DRY_RUN:-0}" = "1" ]; then
  printf 'PI_HOME=%s\n' "$PI_HOME"
  printf 'PI_CODING_AGENT_DIR=%s\n' "$PI_CODING_AGENT_DIR"
  printf 'GENTLE_PI_AGENT_HOME=%s\n' "$GENTLE_PI_AGENT_HOME"
  printf 'GENTLE_PI_CONFIG_HOME=%s\n' "$GENTLE_PI_CONFIG_HOME"
  exit 0
fi

exec pi --name opus "$@"
