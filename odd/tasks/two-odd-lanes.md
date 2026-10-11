# Two concurrent ODD lanes

## Authorization and scope

User asked how to run two true ODD lanes (separate `PI_HOME` trees), then explicitly requested the scripts. Create setup and launch wrappers in this repository. Do not mutate the live `~/.pi` tree, do not activate live profiles, do not commit, push, or install into the user's real home. Scripts must be safe to run later by the user.

## Design

- Default homes: `$HOME/.pi-opus` and `$HOME/.pi-gpt`.
- Overrides: `PI_LANE_SOURCE`, `PI_LANE_OPUS_HOME`, `PI_LANE_GPT_HOME`.
- Launchers export `PI_HOME` and `PI_CODING_AGENT_DIR=$PI_HOME/agent` (stock Pi does not honor `PI_HOME` for extensions/auth/subagents).
- Setup copies a skeleton from the source home, then runs this package's installer into each dest.
- Copy, do not share, routing files (`agent/subagents.json`, `gentle-ai/` after install). Identity files (`auth.json`, `settings.json`, `mcp.json`, `models.json`, `claude-bridge.json`) copy if missing at dest.
- Symlink bulky shared Pi install dirs when present (`npm`, `install`, `bin`) so packages are not duplicated.
- Copy `agent/extensions` so the dest can load the command after install writes.
- Do not copy `sessions`.
- Idempotent: never overwrite existing dest identity/routing files; never write into the source home.
- Refuse when a dest resolves to the source, or when source `agent/` is missing.
- Launchers use `PI_LANE_DRY_RUN=1` to print env and exit without `exec pi`.
- After launch, the user selects `/jb-odd-models claude-opus-5.5` or `/jb-odd-models openai6-1-gentle` inside that instance. Setup does not activate profiles.

## Tasks

- [x] L1 — Test-first scripts: setup two isolated homes, two launchers, HOW_TO_INSTALL section. Writer RED 0/9 (ENOENT) then GREEN 9/9 focused, 218/218 full; scripts mode 755. Commit pending user authorization.
- [x] L2 — Independent verification of script behavior, installer invocation on temp homes only, docs, and no live-home mutation. Verifier 9/9 focused, 218/218 full, `git diff --check` clean, 755, `~/.pi-opus` and `~/.pi-gpt` still absent. RED not independently re-observed (scripts already present).

- [x] L3 — Gentle isolation: launchers also export `GENTLE_PI_AGENT_HOME=$PI_HOME/agent` and `GENTLE_PI_CONFIG_HOME=$PI_HOME/gentle-ai`; setup copies `background-subagents.json` and `profiles.json` from source `gentle-ai/` into each lane only when missing; docs note what stays shared. Writer RED 9/12 (3 fail) then GREEN 12/12 focused, 221/221 full; test suite now cleans its temp roots. Uncommitted.
- [x] L4 — Independent verification of L3. Verifier PASS 9/9 checks: 12/12 focused, 221/221 full, diff/whitespace clean, 755, dry-run prints four vars, setup copy-once without dev-binary.json, source and live-home mtimes unchanged. Real `exec pi` path not run. Parent removed 56 stale `/tmp/odd-lanes-*` and verifier scratch.

- [x] L5 — Propagate lane docs beyond HOW_TO_INSTALL: README, USAGE scope, MODEL_SWITCHING scope, MODEL_PROFILE_EXECUTIVE_SUMMARY (PI_HOME row, delivery state), INSTALLATION and INSTALL_AND_SYNC custom-home sections, ARCHITECTURE home resolution, TESTING test table. Passive docs: 8 files, 21 insertions/4 replacements; links to `HOW_TO_INSTALL.md#two-concurrent-odd-lanes` resolve; `git diff --check` clean; `npm test` 221/221; parent readback of executive summary consistency.

## Commit evidence

- L1–L4: `e99f34d` feat(lanes): add isolated two-lane Pi setup and launchers — scripts, tests, HOW_TO_INSTALL section, tracker. Verified on identical bytes by L4 (12/12 focused, 221/221 full).
- L5: `87c7b67` docs(lanes): point guides to two concurrent ODD lanes.
- L6: user confirmed the real lanes work (setup re-run, launchers, per-lane profile selection) and asked to save the configuration as an example, commit, and integrate. Added `ODD_LANES_EXAMPLE.md` (verbatim setup output, real dry-run output checked against the live lanes) and a link from HOW_TO_INSTALL; fast-forward into `main`. No push.
- Unrelated release 1.6.0 bump stays uncommitted (package.json, tests/manifest-validation.test.ts, odd/tasks/release-1-6-0.md).

## Gentle isolation finding (validated)

Live lanes showed Gentle `session_start` (`applySavedModelConfig`) rewriting lane `agents/*.md` and 10 `subagents.json` profiles from the global `~/.pi/gentle-ai/models.json`. Gentle resolves config home `GENTLE_PI_CONFIG_HOME || ~/.pi/gentle-ai` and agent home `GENTLE_PI_AGENT_HOME || PI_CODING_AGENT_DIR`. Empirical temp-home RPC test: without the GENTLE vars the lane leaked the global routing; with them the lane used its own routing; global and lane hashes unchanged. Missing `background-subagents.json` defaults background subagents to off. Still shared without Gentle changes: prompt history, skills, stats, Engram server, pi-pretty fff db.

## Allowed source surfaces

`scripts/setup-odd-lanes.sh`
`scripts/pi-opus.sh`
`scripts/pi-gpt.sh`
`tests/odd-lanes-scripts.test.ts`
`HOW_TO_INSTALL.md`

## Checks

- `node --experimental-strip-types --test tests/odd-lanes-scripts.test.ts` RED then GREEN
- `npm test`
- `git diff --check`
- Tests use temporary source/dest only; no writes under the developer's `~/.pi`
- Setup does not activate profiles or start Pi

## Next step

Existing `~/.pi-opus` and `~/.pi-gpt` predate L3: re-run `scripts/setup-odd-lanes.sh` (copy-once, safe) to add `background-subagents.json`/`profiles.json`, relaunch with the new launchers and re-select each profile once. Commit remains a separate user decision.
