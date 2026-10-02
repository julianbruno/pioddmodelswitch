# Use `/jb-odd-models`

The command reports, previews, diagnoses, switches, undoes, or recovers the global model profile used by the managed orchestrator, ODD generic agents, and configured judge/reviewer agents. Registered profile names and optional opposite-provider judge routing come from `model-profiles.manifest.json` instead of being hard-coded.

## Command reference

| Input | Effect |
|---|---|
| `/jb-odd-models` | Shows usage, active-state detection, and all managed mappings. Read-only. |
| `/jb-odd-models status` | Shows active-state detection and all managed mappings. Read-only. |
| `/jb-odd-models doctor` | Performs read-only diagnostics for manifest/profile shape, active canonical/runtime state, transaction journals/locks, local Pi catalog presence, effort compatibility, and auth configuration evidence. |
| `/jb-odd-models list` | Lists registered profiles and the default profile. Read-only. |
| `/jb-odd-models preview <profile>` | Shows managed canonical/runtime before → after mappings for a profile. Read-only. |
| `/jb-odd-models <profile>` | Validates registered profiles and current files, aligns this Pi session with the effective `orchestrator` model and standard thinking level, writes changed canonical/runtime mappings, then reloads Pi only if files changed. No-op when session and files already match. |
| `/jb-odd-models undo` | Reverts the last completed profile transaction only if both files still match the recorded transaction output, then reloads Pi. |
| `/jb-odd-models recover` | Finishes, records, or clears an interrupted profile transaction when the current file bytes match a safe recorded state, then reloads Pi when recovery changed state. |
| `/jb-odd-models <invalid>` | Displays an unknown-argument warning and usage. Read-only. |

Arguments are trimmed and case-insensitive. Dots and hyphens are supported in registered path-safe profile names, so `/jb-odd-models GPT-5.6-RECOMMENDED` selects `gpt-5.6-recommended`.

## Common checks

### Inspect without changing anything

```text
/jb-odd-models status
```

Expected heading:

```text
Active ODD profile: openaigentle
```

The state can also be any registered profile name, `custom`, or `unknown`. `[misaligned]` means the canonical entry and live runtime entry differ for that agent. With the packaged `oppositeProviderJudges` block, only paired profiles use opposite-provider judges: paired GPT-family profiles use the matching Grok cost lane, paired Grok profiles use the matching GPT-5.6 lane, and legacy `openai`/`grok` aliases retain their previous pairing. Unpaired profiles, including the default `openaigentle`, retain their own judge mappings.

### Diagnose local configuration

```text
/jb-odd-models doctor
```

`doctor` never writes, repairs, reclaims locks, or reloads Pi. It distinguishes:

- missing or malformed managed entries;
- canonical/runtime drift;
- active profile states: registered profile, `custom`, or `unknown`;
- malformed active/history transaction journals;
- stale or ambiguous transaction locks;
- unrelated runtime mappings that are preserved;
- retired mappings from the previous command, which the next switch or install removes;
- local effective Pi catalog entries found or missing through `ctx.modelRegistry.find()`;
- effort compatibility using model `reasoning` and `thinkingLevelMap` evidence; and
- configured-auth evidence through Pi's registry auth status.

Extended or model-specific efforts, including `xhigh` and `max`, require an explicit non-null, non-undefined `thinkingLevelMap` entry on a reasoning model before `doctor` calls them compatible. Accepting an effort string in a profile is not evidence of model support. Without the Pi registry, effort checks are skipped.

A missing local catalog model, missing auth status, or missing registry is a bounded diagnostic. It is not proof that a remote provider is unavailable. `doctor` also cannot establish provider execution or account entitlement.

Installed/global profile status does not prove effective project routing: project overrides and the current Pi session registry can change the effective model catalog.

### List and preview profiles

```text
/jb-odd-models list
/jb-odd-models preview openaigentle
```

The preview shows each managed agent's current canonical entry and runtime entry next to the selected profile's effective after state, including opposite-provider judge mappings when configured for a paired profile. Missing legacy entries can be repaired by a switch. Malformed existing managed entries stop the switch before any write.

### Select a profile

```text
/jb-odd-models openaigentle
```

On success, the selected ODD mappings are written and Pi reloads only for changed files. The canonical profile uses `thinking`; the runtime mapping receives the same value as `effort`. Already-active files stay untouched, but direct selection still aligns the current session. Missing model/auth, unavailable rollback model, unsupported orchestrator thinking, and clamped thinking fail before file mutation. A later file-switch failure attempts session restoration and reports restoration errors.

## Add a registered profile

To add a third profile such as `local`, keep the same active managed-agent coverage as existing profiles:

1. Add `{ "name": "local", "modelsFile": "models.local.json" }` to `model-profiles.manifest.json`.
2. Create `models.local.json` with exactly every agent listed under the manifest's `managedAgentGroups` plus the configured `oppositeProviderJudges.agents` when that block is enabled.
3. Use `{ "model": "provider/model", "thinking": "max" }` for each agent, choosing an effort appropriate for that model. The package accepts any nonempty, already-trimmed effort string and copies it verbatim; it does not trim, lowercase, whitelist, or downgrade values. Direct switching rejects nonstandard `orchestrator` thinking before mutation; other agents' efforts remain unrestricted and the installed runtime or provider may reject unsupported levels even after a successful switch.
4. Restart or reinstall so the installed manifest/profile files are copied into Pi home.
5. Run `/jb-odd-models list`, `/jb-odd-models preview local`, and `/jb-odd-models doctor`.

Profile names must be safe lowercase command names: start with a lowercase letter, use lowercase letters/digits separated by single `-` or `.` segments, and cannot use reserved command names such as `status`, `list`, `preview`, `doctor`, `undo`, or `recover`.

## Completion

Argument completion is synchronous and manifest-backed. It offers `status`, `list`, `preview`, `doctor`, `undo`, `recover`, and registered profile names filtered by the typed prefix; `preview <prefix>` completes registered profile names for preview commands.

## Installed extension files

The installed extension imports helper modules from `extensions/model-profiles/`. Package or manual installs must include that directory next to `extensions/odd-model-profiles.ts`; the helper modules are not standalone auto-loaded extensions.
