# Use `/jb-odd-models`

The command reports, previews, diagnoses, switches, undoes, recovers, or edits the global model profile used by the managed orchestrator, ODD generic agents, and configured judge/reviewer agents. Registered profile names and optional opposite-provider judge routing come from `model-profiles.manifest.json` instead of being hard-coded.

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
| `/jb-odd-models edit` | Opens a Pi dialog to view, edit, or create a named profile from a template. Viewing is read-only; saving never changes the active profile. |
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

## Edit or create a named profile

```text
/jb-odd-models edit
```

Pi dialogs offer View, Edit, or Create. Viewing shows each managed agent's model and thinking and works without a catalog. Edit and Create require a valid installed catalog at `$PI_HOME/gentle-ai/model-catalog.json` and only offer those models plus standard thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). Create clones a complete existing profile as the template, then registers the new name in the manifest. Saving asks for confirmation. Cancelled dialogs write nothing. Existing assignments that are missing from the catalog must be replaced before save; the editor never invents a model. New names must be safe lowercase command names, cannot use reserved actions including `edit`, and cannot overwrite an existing profile file. Saving never changes the active canonical/runtime profile; use `/jb-odd-models <profile>` afterwards if you want to apply it.

If the manifest or any loaded named profile changes while the editor is open, saving fails without writing. Reopen `/jb-odd-models edit` to load the current files and retry. The editor compares original file bytes, so formatting-only changes also count as drift. These are optimistic checks, not a lock: an external writer can still race in the small interval between the checks and writes. Individual files are replaced atomically, but creating a profile and registering it is not a crash-safe multi-file transaction. Avoid simultaneous file edits or installs while saving.

## Export a credential-available model catalog

Generate the local catalog used by `/jb-odd-models edit`:

```bash
npm run export:model-catalog
```

The default output is `config/model-catalog.json`, relative to the current working directory. Reinstall after generating it to copy the catalog into `$PI_HOME/gentle-ai/model-catalog.json`, or copy that file there yourself. An existing install without a catalog still loads; `/jb-odd-models edit` can view profiles and tells you how to generate a catalog before mutation. The script uses the supported Pi SDK `ModelRuntime.create()` and asynchronous `getAvailable()` APIs, not the entire bundled model registry. Run it with the same credential environment and `PI_CODING_AGENT_DIR` as Pi. It does not start an agent session or load project/provider extensions; models registered only by those extensions are not included.

Local Node package resolution looks for `@earendil-works/pi-coding-agent`. For a global or installer-managed Pi, pass its package directory or JavaScript SDK entry explicitly; no machine-specific installation path is assumed:

```bash
npm run export:model-catalog -- --sdk /path/to/pi-coding-agent --output /private/path/model-catalog.json
```

Use a Node version supported by your Pi SDK (the current SDK requires Node 22.19+). Missing/incompatible SDKs, configuration errors, and empty availability fail before writing the output. A successful export replaces the chosen file; refresh it when credentials or models change. Availability means Pi can resolve provider authentication, not that a remote request or account entitlement has been verified.

### Catalog contract (version 1)

The reusable `extensions/model-profiles/catalog.ts` validator rejects empty catalogs, unknown fields, duplicate identities, invalid metadata, and noncanonical ordering. The JSON envelope contains `schemaVersion: 1`, `source: "pi-model-runtime"`, an ISO UTC `generatedAt` timestamp, and `models`.

Each model contains only `provider`, `id`, `model` (`provider/id`), `name`, `reasoning`, `contextWindow`, `maxTokens`, and `input` (`text`/`image`). Provider IDs cannot contain `/`; model IDs may contain `/` and are preserved verbatim. Entries sort by the full identity using locale-independent code-unit ordering. Identical inputs produce identical model data; the generation timestamp changes between runs. Reasoning metadata is not a guarantee of support for any specific effort level.

The exporter deliberately omits credentials, headers, URLs, auth status, and arbitrary SDK properties. Do not commit your personal generated catalog: although it contains no credential fields, provider/model availability and custom display names can reveal local configuration. No personal catalog is shipped in this repository, and exporting does not change profiles, `named-profiles.json`, or the active session.

## Add a registered profile

Prefer `/jb-odd-models edit` to create or change a profile from the catalog. To add a third profile such as `local` by hand, keep the same active managed-agent coverage as existing profiles:

1. Add `{ "name": "local", "modelsFile": "models.local.json" }` to `model-profiles.manifest.json`.
2. Create `models.local.json` with exactly every agent listed under the manifest's `managedAgentGroups` plus the configured `oppositeProviderJudges.agents` when that block is enabled.
3. Use `{ "model": "provider/model", "thinking": "max" }` for each agent, choosing an effort appropriate for that model. The package accepts any nonempty, already-trimmed effort string and copies it verbatim; it does not trim, lowercase, whitelist, or downgrade values. Direct switching rejects nonstandard `orchestrator` thinking before mutation; other agents' efforts remain unrestricted and the installed runtime or provider may reject unsupported levels even after a successful switch.
4. Restart or reinstall so the installed manifest/profile files are copied into Pi home.
5. Run `/jb-odd-models list`, `/jb-odd-models preview local`, and `/jb-odd-models doctor`.

Profile names must be safe lowercase command names: start with a lowercase letter, use lowercase letters/digits separated by single `-` or `.` segments, and cannot use reserved command names such as `status`, `list`, `preview`, `doctor`, `undo`, `recover`, or `edit`.

## Completion

Argument completion is synchronous and manifest-backed. It offers `status`, `list`, `preview`, `doctor`, `undo`, `recover`, `edit`, and registered profile names filtered by the typed prefix; `preview <prefix>` completes registered profile names for preview commands.

## Installed extension files

The installed extension imports helper modules from `extensions/model-profiles/`. Package or manual installs must include that directory next to `extensions/odd-model-profiles.ts`; the helper modules are not standalone auto-loaded extensions.
