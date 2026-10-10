# Architecture and boundaries

This package is a small configuration-and-extension layer. It does not bundle Pi, an agent runtime, provider SDKs, model catalogs, or credentials.

## Components

| Component | Responsibility | Does not own |
|---|---|---|
| `extensions/odd-model-profiles.ts` | Registers `/jb-odd-models`, validates ODD profiles through shared helpers, reports status/list/preview/doctor, switches profiles, undoes/recover transactions, and requests reload after changed mutations. | Provider authentication, model execution, model catalog generation, or agent definitions. |
| `extensions/model-profiles/core.ts` | Owns manifest/profile validation, opposite-provider judge selection, and canonical/runtime derivation. | Pi extension registration. |
| `extensions/model-profiles/editor.ts` | Views saved profiles; edits/creates named definitions from all auth-available invoking-registry models, with supported thinking choices and confirmed saves; runs the Balance dialog (consent, preview, named save). | Activation, provider calls outside Balance, or exported-catalog fallback. |
| `extensions/model-profiles/balancing.ts` | Builds the allowlisted Balance request, gates the current model's output cap, runs one bounded/cancellable consultation, and validates the untrusted reply. | Saving, activation, retries, fallback models, or cost/token accounting. |
| `extensions/model-profiles/catalog.ts` and `scripts/export-model-catalog.ts` | Validate/export optional catalog snapshots for inspection and headless tooling. | Interactive editor choices or proof of remote model access. |
| `extensions/model-profiles/transaction.ts` | Owns read/write transaction locking, active journal, history, guarded undo, recovery, and read-only inspection diagnostics. | Choosing model profiles or repairing malformed state automatically. |
| `config/model-profiles.manifest.json` | Defines schema version, managed agent groups, opposite-provider judge routing, default profile, reserved command names, and registered profile files. | Runtime behavior outside declared mappings. |
| `config/models.<profile>.json` | Defines each canonical model profile; version 1.3 materializes every role-based profile from `config/named-profiles.json`, legacy aliases, and standalone `claude-opus-5.5`. At install time, active files follow the currently active registered profile, or the manifest default when none matches. | Runtime behavior or user overrides. |
| `install/install.sh` and `install/model-profiles-install.ts` | Enforce the Node strip-types minimum, validate assets, back up changed targets, install extension/helper layout, retire the released predecessor extension into the backup, and perform a merge-friendly runtime update that removes retired routes. | Installing Gentle Pi, credentials, or providers. |
| Documentation | Explains operation, recovery, and limitations. | A license grant; see `NOTICE.md`. |

## Dependency boundaries

```text
Gentle Pi extension host
  └─ loads odd-model-profiles.ts
       ├─ reads/writes $PI_HOME/gentle-ai model profiles
       ├─ reads/writes $PI_HOME/agent/subagents.json
       ├─ inspects $PI_HOME/gentle-ai/.model-profiles-transactions
       ├─ uses ctx.modelRegistry for local read-only doctor evidence and live editor choices
       ├─ Balance only: one consented ctx.modelRegistry.streamSimple() call with the current model
       └─ requests Pi reload after changed mutations

Gentle Pi native agent runtime
  └─ consumes subagents.json.model_profiles
       └─ dispatches the selected model/effort for each managed agent

Pi registry/auth configuration
  └─ supplies local model/capability evidence, not proof of remote execution
```

The interactive editor reads `ctx.modelRegistry.getAvailable()` (synchronous or asynchronous-compatible), without filtering by `ctx.scopedModels`. Only allowlisted identity, display name, reasoning, and thinking-map metadata enters drafts; SDK objects and credentials are not persisted. View reads saved definitions independently of model availability. Missing, empty, invalid, or failing registries block Edit/Create without writes; an exported catalog is never a fallback.

Existing unavailable models and unsupported thinking remain visible until explicitly replaced; changing a model never silently clamps thinking. Non-reasoning or unknown models offer only `off`. Reasoning models offer `low`/`medium`/`high` unless explicitly disabled; additional levels require an own, non-null, non-undefined thinking-map entry. Model identities split at the first slash: the provider is the prefix and the remaining model ID, including nested slashes, is preserved verbatim.

Confirmed Save writes only the named definition and, for Create, its manifest registration. It does not write active `models.json`/`subagents.json`, change session model/thinking, or reload Pi. Optimistic byte comparisons reject drift; Create rolls back its new profile if manifest writing fails, but is not a crash-safe multi-file transaction. Activation remains a separate command. See [editor details](USAGE.md#edit-or-create-a-named-profile).

Balance is the only provider-calling path. It sends allowlisted metadata (no chat history, source, session prompts, or credentials), treats the reply as untrusted JSON, and reuses the confirmed named-profile save. Its trust boundary:

- The output-cap gate allows only APIs whose installed Pi 1.1.0 adapter writes the cap into the request; `openai-responses` is additionally checked in the request payload before sending. Codex Responses, `pi-virtual`, `pi-messages`, unknown APIs, providers whose streaming an extension supplies or overrides (native provider or custom `streamSimple`), and uninspectable registries are refused before consent. Config-only provider registrations that use a built-in adapter are gated by API like built-in providers.
- The gate is not cost or token accounting.
- Pi's runtime and in-process extensions are trusted. Another extension can replace a built-in API stream in the shared pi-ai API registry for a custom provider without detection; this is not a sandbox.

See [Balance details](USAGE.md#balance-a-profile-with-the-current-model).

`doctor` uses the supported Pi extension APIs documented for command contexts: `ctx.modelRegistry.find()` for effective local catalog lookup and `getProviderAuthStatus()` when available for configured-auth evidence. It does not call providers, resolve provider requests, or prove remote account entitlement.

## Installation boundary

The installer writes only beneath `PI_HOME` at installation time. It validates the versioned manifest and every registered profile before writing, derives active `models.json` and merged `subagents.json` entries from the currently active registered profile (or the default profile when no registered profile matches) using the same opposite-provider judge logic as the command, preserves unrelated JSON keys, and creates timestamped backups for existing targets whose content changes. It also installs the helper modules (`core.ts`, `transaction.ts`, `catalog.ts`, `editor.ts`, and `balancing.ts`) under `extensions/model-profiles/` next to the command extension, which is required for the installed command to load.

The packaged extension resolves Pi home from `PI_HOME` when set, otherwise retaining `~/.pi` behavior. A custom value must be exported into the Pi process as well as the installer process. Profile names are path-safe command arguments: lowercase alphanumeric segments separated by `-` or `.`, with no spaces or path separators.

## Version boundary

- Installer runtime: Node.js 22.19.0 or newer, matching the supported Pi package engine while `install/install.sh` runs TypeScript with `--experimental-strip-types`.
- Pi runtime: a compatible Gentle Pi version with TypeScript extensions, `registerCommand`, `ctx.reload`, and command-context `ctx.modelRegistry`. This package does not add extra machinery solely to report Pi or provider versions.

## Known limitations

- Saved profile identifiers and optional exported catalogs are snapshots and can become unavailable or renamed by providers. Live editor availability is local registry/auth evidence, not provider reachability or account entitlement.
- Installation validates file shape, not credentials or remote model availability.
- `doctor` can report local catalog/auth evidence, but it cannot establish provider execution or account entitlement.
- Opposite-provider judge routing is manifest-driven; absent, empty, or disabled judge configuration preserves the previous uniform-profile behavior.
- Installed/global status does not prove effective project routing when project overrides or scoped models are active.
- The two target files are replaced atomically per file, not as an atomic pair.
- Recovery refuses unknown bytes from noncooperating writers rather than overwriting them.
- Reload failure leaves successfully written mappings in place.
- Balance recommendations are advisory, not benchmarks. The cap gate does not account for cost or tokens, and real provider execution, terminal rendering, and installed-session registry behavior are not covered by automated tests.
- Automated uninstall is omitted to avoid deleting shared configuration or post-install changes.
