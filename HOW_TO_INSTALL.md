# Install and recover `/jb:odd-models`

Run the included installer from this package. It validates package data, backs up existing files that will change, installs the command plus helper layout, and merges only the managed ODD runtime mappings. For every command and practical workflow, use the [complete user guide](USAGE.md).

## Prerequisites

- A working Gentle Pi installation with an `agent/` directory under Pi home.
- Gentle Pi's native agent runtime support for `agent/subagents.json.model_profiles`.
- Node.js 22.19.0 or newer available as `node`; this matches the supported Pi package engine and lets the installer run TypeScript with `--experimental-strip-types`.
- Authentication configured in Pi for each provider you intend to select.

The installer does not install Pi, models, credentials, provider authentication, or provider access. A successful file installation does not prove that a provider account can access every configured model.

## Install

```sh
cd /path/to/pissdmodelswitch
./install/install.sh
```

The installer writes:

- `~/.pi/agent/extensions/jb-odd-model-profiles.ts`
- helper modules under `~/.pi/agent/extensions/model-profiles/`
- `~/.pi/gentle-ai/model-profiles.manifest.json`
- every profile registered by that manifest, including `openaigentle`, GPT-5.6, GPT Astra, GPT Astra-only, Grok lanes, and legacy alias files such as `models.openai.json` and `models.grok.json`
- derived active `~/.pi/gentle-ai/models.json` from the currently active registered profile, or the manifest default on a fresh install, including opposite-provider judge entries when configured
- the merged managed entries in `~/.pi/agent/subagents.json`, using the same effective profile

Existing unrelated canonical keys, unrelated top-level runtime keys, and unrelated `model_profiles` entries in `subagents.json` are preserved. Re-running the installer is safe: identical files are left unchanged and no backup is created. With the packaged manifest, the default profile is `openaigentle`, using GPT-6 Sol/Luna. Unpaired profiles such as `openaigentle` retain their own judge mappings; configured pairs use opposite-provider judges unless `oppositeProviderJudges` is disabled or has no agents.

### Code-only updates with custom active routing

The standard installer also replaces the packaged registry and derives active mappings. If current `models.json` matches no packaged profile, it selects the package default; backups do not prevent that selection change. For a code-only update that must keep custom active routing or archive state, back up and refresh only `agent/extensions/jb-odd-model-profiles.ts` and the package-owned helpers in `agent/extensions/model-profiles/`. Do not replace the manifest, named definitions, `models.json`, `subagents.json`, or Gentle `profiles.json`. Do not overwrite user-owned helper files. Check for an active transaction/lock before copying, and verify installed asset bytes plus unchanged configuration afterward. This is a manual asset refresh, not an installer flag.

Run `/reload` in each existing instance afterward; it retains Gentle's in-process explicit/inherited snapshots. A restart/resume resolves current defaults again.

### Custom Pi home

For installation, `PI_HOME` selects the target only. For a live launch, align all four plugin, Pi, and Gentle home variables:

```sh
PI_HOME=/srv/my-pi ./install/install.sh
export PI_HOME=/srv/my-pi
export PI_CODING_AGENT_DIR="$PI_HOME/agent"
export GENTLE_PI_AGENT_HOME="$PI_HOME/agent"
export GENTLE_PI_CONFIG_HOME="$PI_HOME/gentle-ai"
pi
```

Keep these exports in the launching terminal whenever Pi runs; `PI_HOME` alone does not relocate stock Pi or Gentle routing.

The target must already contain `agent/`; this prevents accidentally installing into an arbitrary directory. The extension defaults to `~/.pi` when `PI_HOME` is unset.

### Two concurrent ODD lanes

Pi instances can share one home while using different profiles: select Grok, OpenAI, or Claude inside each running instance. The command binds only that session; other open sessions keep their Gentle snapshots. Shared defaults remain last-selected for new sessions, so separate homes are optional when persisted defaults must also be isolated. Setup creates three such lanes (opus with `claude-opus-5.5`, gpt with `openai6-1-gentle`, and grok with `grok-4-7`). Four scripts set up and launch isolated lanes:

| Script | Purpose |
| --- | --- |
| `scripts/setup-odd-lanes.sh` | Creates `~/.pi-opus`, `~/.pi-gpt`, and `~/.pi-grok` from `~/.pi` (identity files copied once, `npm`/`install`/`bin` symlinked, sessions skipped) and runs this installer into each. Never writes into the source home. |
| `scripts/pi-opus.sh` | Launches `pi --name opus` with the opus lane home. |
| `scripts/pi-gpt.sh` | Launches `pi --name gpt` with the gpt lane home. |
| `scripts/pi-grok.sh` | Launches `pi --name grok` with the grok lane home. |

Stock Pi does not honor `PI_HOME` for extensions, auth, or subagents, and Gentle keeps its own homes. The launchers therefore export four variables before starting Pi:

| Variable | Value |
| --- | --- |
| `PI_HOME` | `<lane home>` |
| `PI_CODING_AGENT_DIR` | `$PI_HOME/agent` |
| `GENTLE_PI_AGENT_HOME` | `$PI_HOME/agent` |
| `GENTLE_PI_CONFIG_HOME` | `$PI_HOME/gentle-ai` |

At session start Gentle applies `$GENTLE_PI_CONFIG_HOME/models.json` to the lane's agents and `subagents.json`. Without the Gentle variables it reads the global `~/.pi/gentle-ai/models.json` and overwrites the lane's routing. Setup also copies `gentle-ai/background-subagents.json` and `gentle-ai/profiles.json` from the source once; existing lane copies are kept. Override the paths with `PI_LANE_SOURCE`, `PI_LANE_OPUS_HOME`, `PI_LANE_GPT_HOME`, and `PI_LANE_GROK_HOME`; set `PI_LANE_DRY_RUN=1` to print the exported env without starting Pi.

```sh
./scripts/setup-odd-lanes.sh      # once; re-runs keep existing lane files
./scripts/pi-opus.sh              # terminal 1, then: /jb:odd-models claude-opus-5.5
./scripts/pi-gpt.sh               # terminal 2, then: /jb:odd-models openai6-1-gentle
./scripts/pi-grok.sh              # terminal 3, then: /jb:odd-models grok-4-7
```

Setup activates no profile; the selection happens inside each running instance. A complete working example is in [ODD lanes example](ODD_LANES_EXAMPLE.md).

Lanes started before the launchers exported the Gentle variables may hold global routing. Relaunch them with the current launchers and re-select the profile once (`/jb:odd-models <profile>`).

Still shared between lanes: prompt history (`~/.pi/agent/history`), skills, `/gentle:stats`, the Engram server, and pi-pretty's `~/.pi/agent/pi-pretty/fff` database.

## Backups and reinstall behavior

When an existing target changes, the installer creates a timestamped directory under:

```text
$PI_HOME/backups/jb-odd-models-<timestamp>-<pid>/
```

Backups retain paths relative to `PI_HOME`. Newly created files have no prior copy and therefore do not appear in the backup. A reinstall that would produce identical bytes changes nothing and creates no backup.

## Upgrade from the previous command

There are two distinct historical migrations; neither old command is retained as an alias:

| Migration | Extension handling |
|---|---|
| Older `/jb-sdd-odd-models` → ODD-only command | Retires released `sdd-model-profiles.ts` into the backup and removes exactly the 13 retired `sdd-*` routes. |
| Package 2.0.0: `/jb-odd-models` → `/jb:odd-models` | Originally replaced the same `odd-model-profiles.ts` and updated helpers in place; that namespace-only release did not retire this entrypoint. Update saved invocations and reload/restart Pi. |

Manifest `schemaVersion: 2` defines ODD, orchestrator, and review/judge coverage. It is independent of package version 2.0.0, which changes the command namespace. The namespace-only release preserved package name `jb-odd-models`, installed paths, and backup prefix. The later [prefixed filename migration](#prefixed-extension-filename) changes the entrypoint path, but not the command or backup prefix. Run the installer once from this package; historical SDD ownership checks and active-profile handling are:

| Existing state | Installer action |
|---|---|
| `agent/extensions/sdd-model-profiles.ts` matches a released copy of this package byte for byte | Moves it into the backup directory so Pi no longer loads the old command. |
| That file exists but differs from every released copy, or is not a regular file | Stops before writing anything. Review the file, move it out of `agent/extensions/` yourself, then rerun the installer. |
| `models.json` or `subagents.json` contain the 13 retired `sdd-*` routes | Removes exactly those keys. Other custom keys, including similarly named ones, are kept. |
| Canonical mappings match a profile in the package registry | Keeps that profile active and derives runtime mappings from it. |
| Canonical mappings match no profile in the package registry | Activates the default profile and reports this; the previous changed files are in the backup. |

Installed custom registrations and locally edited named definitions are not automatically merged into the package manifest during reinstall. Save copies before updating; an unmatched custom active mapping falls back to the package default. Identically named package files may replace local edits, with changed existing bytes backed up.

The shared helper directory `agent/extensions/model-profiles/` stays in place and is updated for the new command.

If an active transaction journal or lock exists, the installer fails closed before writing. Run `/jb:odd-models doctor` to inspect the state and `/jb:odd-models recover` only when it is safe to complete recovery.

## Verify

1. Run `/reload` in each open Pi instance to load the extension while retaining in-process session bindings, or restart if you want to resolve defaults again.
2. Run `/jb:odd-models status`.
3. Run `/jb:odd-models doctor`.
4. Confirm that all managed mappings are listed and the active profile is `openaigentle`, another registered profile, or intentionally `custom`.
5. Optionally switch and verify:

   ```text
   /jb:odd-models grok-recommended
   /jb:odd-models status
   /jb:odd-models doctor
   ```

If Pi does not recognize the command, verify that Gentle Pi loads TypeScript extensions from `$PI_HOME/agent/extensions`, that `extensions/model-profiles/` was copied next to the command extension, and that the same `PI_HOME` is used at install time and runtime.

## Add or install a third profile

For installed profiles, prefer `/jb:odd-models edit`: Create clones a registered template and offers all auth-available models from the invoking Pi registry, without requiring an exported catalog. Save updates the named definition and registers it, but does not activate it; select `/jb:odd-models <profile>` separately. View/Archive/Restore need no model availability; Archive blocks active profiles and Restore never activates a profile. Missing, empty, invalid, or failing registry evidence blocks Edit/Create without writes or a stale-catalog fallback. Availability does not prove provider reachability or account entitlement. See [editor behavior and optional catalog export](USAGE.md#edit-or-create-a-named-profile).

For packaged profiles, the manifest is the source of truth. To add a profile such as `local`, add it to `model-profiles.manifest.json`, create `models.local.json`, and include exactly the same active managed agents as the existing profiles, including configured judge/reviewer agents. Then reinstall so the new manifest/profile file is copied into Pi home. A profile without an `oppositeProviderJudges.profilePairs` entry uses its own models for judges.

After reinstalling, verify:

```text
/jb:odd-models list
/jb:odd-models preview local
/jb:odd-models doctor
```

## Recover or undo runtime state

Use these commands from Pi after installation:

- `/jb:odd-models undo` reverts the last completed transaction only if neither target file has changed since that transaction completed.
- `/jb:odd-models recover` handles an interrupted transaction when current bytes match recorded safe states.
- `/jb:odd-models doctor` reports stale locks, malformed journals, and preserved unrelated mappings without writing.

Recovery is intentionally conservative. If a noncooperating writer changed either file outside the transaction, recovery refuses unknown bytes instead of overwriting them.

## Uninstall or restore

For complete isolated lane homes, use the [lane lifecycle guide](ODD_LANES_LIFECYCLE.md): `scripts/uninstall-odd-lanes.sh` previews archival, `--yes` archives, and `--delete --yes` permanently removes the homes without a backup. Stop all selected Pi instances first. This does not remove the shared Pi installation.

Package-only uninstall from a retained home is still manual because removing shared JSON keys safely depends on changes made after installation.

To restore a previous state:

1. Stop Pi.
2. Choose the installer backup created for the relevant run.
3. Copy each saved file back to the same relative path under `PI_HOME`.
4. For files that the installer created and that have no backup, inspect them before manually removing them. Do not remove `subagents.json` if another runtime or configuration uses it.
5. Restart Pi and verify the desired runtime behavior.

To uninstall without a complete restore, manually remove the extension and profile files, then remove only the managed `model_profiles` keys from `subagents.json`. Preserve every unrelated key and mapping.

### Prefixed extension filename

The installed entrypoint is now `agent/extensions/jb-odd-model-profiles.ts`, so Pi's extension list shows the `jb-` prefix. The public command remains `/jb:odd-models`. Reinstall with `./install/install.sh` and then restart Pi or run `/reload`. The installer moves recognized copies of the old `odd-model-profiles.ts` (and the older `sdd-model-profiles.ts`, if present) into its backup before completing the install. Unknown or locally modified predecessor files stop installation without writes; review them rather than deleting them blindly. Never restore a predecessor next to the new entrypoint: both would load.
