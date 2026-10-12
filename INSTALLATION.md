# Install `/jb:odd-models`

This guide shows the shortest safe path to install the model-profile switch plugin into Pi. Continue with the [complete user guide](USAGE.md) for inspection, activation, editing, Balance, and routing lanes.

## Quick install

From this repository:

```sh
cd /path/to/pissdmodelswitch
./install/install.sh
```

Then restart Pi and verify the command is loaded:

```text
/jb:odd-models status
/jb:odd-models doctor
```

## Requirements

- Gentle Pi is already installed.
- `$PI_HOME/agent/` exists. If `PI_HOME` is unset, the installer uses `~/.pi`.
- Node.js 22.19.0 or newer is available as `node`.
- Pi provider authentication is already configured for the providers you plan to use.

The installer does not install Pi, provider credentials, or model access.

## What gets installed

The installer copies the command and profile data into Pi home:

| Target | Purpose |
|---|---|
| `$PI_HOME/agent/extensions/odd-model-profiles.ts` | Slash command extension |
| `$PI_HOME/agent/extensions/model-profiles/` | Helper modules, including catalog validation and the profile editor |
| `$PI_HOME/gentle-ai/model-profiles.manifest.json` | Profile manifest |
| `$PI_HOME/gentle-ai/model-catalog.json` | Optional generated catalog copied only when `config/model-catalog.json` exists in the package |
| `$PI_HOME/gentle-ai/models.<profile>.json` | Every registered named profile, including `openaigentle`, GPT-5.6, GPT Astra, GPT Astra-only, Grok lanes, and legacy aliases |
| `$PI_HOME/gentle-ai/models.json` | Derived active canonical profile |
| `$PI_HOME/agent/subagents.json` | Merged runtime `model_profiles` entries |

Unrelated JSON keys and unrelated `model_profiles` entries are preserved. Reinstall preserves canonical mappings matching the package registry; unmatched custom mappings fall back to its default. Installed custom registrations/edits are not automatically merged, so preserve copies before updating.

## Two distinct migrations

- **Historical SDD retirement:** upgrading from `/jb-sdd-odd-models` moves a recognized released `sdd-model-profiles.ts` into the backup and removes exactly its 13 retired `sdd-*` routes. Unknown extension bytes stop installation for ownership review.
- **Package 2.0.0 namespace change:** `/jb-odd-models` becomes `/jb:odd-models` by replacing the same `odd-model-profiles.ts` and its helpers. Update saved invocations and reload/restart Pi. Package name `jb-odd-models`, installed paths, and backup prefix are unchanged.

Neither old command remains an alias. Manifest `schemaVersion: 2` describes ODD-only configuration coverage, not package version 2.0.0. See [migration and preservation details](HOW_TO_INSTALL.md#upgrade-from-the-previous-command).

## Custom `PI_HOME`

Use the same `PI_HOME` for installation and when running Pi:

```sh
PI_HOME=/path/to/pi-home ./install/install.sh
PI_HOME=/path/to/pi-home pi
```

The target must already contain an `agent/` directory.

With Gentle, a custom home also needs `PI_CODING_AGENT_DIR` and `GENTLE_PI_AGENT_HOME` set to `$PI_HOME/agent`, and `GENTLE_PI_CONFIG_HOME` set to `$PI_HOME/gentle-ai`; otherwise Pi and Gentle keep reading `~/.pi`. The lane launchers set all four; see [Two concurrent ODD lanes](HOW_TO_INSTALL.md#two-concurrent-odd-lanes).

## Backups

When an existing target file changes, the installer creates a backup under:

```text
$PI_HOME/backups/jb-odd-models-<timestamp>-<pid>/
```

Re-running the installer with identical generated files is a no-op and does not create a new backup.

## Verify after restart

Run:

```text
/jb:odd-models status
/jb:odd-models doctor
```

Expected result:

- Pi recognizes `/jb:odd-models`.
- `status` shows `openaigentle` by default, another registered profile, or intentionally `custom`.
- `doctor` reports healthy managed mappings or actionable diagnostics.
- `/jb:odd-models edit` can view saved profiles without a model registry or catalog. Edit/Create use all auth-available models in the invoking Pi registry, not the session-scoped subset; no export is required. A missing, empty, invalid, or failing registry blocks Edit/Create without writes or a file-catalog fallback.
- Saving a named profile does not activate it. Select it separately with `/jb:odd-models <profile>`.

`npm run export:model-catalog` remains optional for inspection/headless tooling. Reinstall to copy a generated `config/model-catalog.json` into `$PI_HOME/gentle-ai/model-catalog.json`, or copy it there yourself; interactive editing does not consult it. Registry availability is local auth/configuration evidence, not proof of provider reachability or account entitlement.

## Common recovery path

If the installer refuses to write because a transaction or lock exists, restart Pi and inspect:

```text
/jb:odd-models doctor
```

Recover only when the diagnostic says recovery is safe:

```text
/jb:odd-models recover
/jb:odd-models doctor
```

## Related docs

- [Install and recover details](HOW_TO_INSTALL.md)
- [Command usage](USAGE.md)
- [How switching works](MODEL_SWITCHING.md)
