# Programmatic testing guide

This document explains how to test the plugin without launching a real Pi session or mutating the real `~/.pi` home.

## Quick path

Run the complete test suite from the repository root:

```sh
node --experimental-strip-types --test tests/*.test.ts
```

Also run the shell and whitespace checks before committing:

```sh
bash -n install/install.sh
git diff --check
```

Test totals depend on the working tree. Record results from the actual run rather than treating a historical total as an acceptance threshold.

## What the suite covers

| Test file | Purpose |
|---|---|
| `tests/manifest-validation.test.ts` | Validates manifest schema, package version, managed agent coverage, generated profile files, named-profile role expansion, opposite-provider judge pairing, and runtime derivation. |
| `tests/installer-merge.test.ts` | Verifies installation into temporary `PI_HOME` fixtures, dynamic copying of every registered profile and helper module (including `balancing.ts`), default active profile derivation, backup behavior, idempotency, and Node version gating. |
| `tests/multi-instance.test.ts` | Runs two Node subprocesses against disposable shared or separate homes to check shared-file effects and absence of command-driven live-state broadcast through fake Pi APIs. |
| `tests/command-behavior.test.ts` | Exercises the `/jb-odd-models` command seam with a fake Pi command context: completions, list, preview, session model/thinking alignment, no-op behavior, preflight failures, restoration, undo, recover, and transaction safety. |
| `tests/profile-editor.test.ts` | Exercises scripted View/Edit/Create/Balance dialogs, live availability and thinking choices, cancellation, unavailable assignments, drift guards, and save-only persistence/rollback. |
| `tests/profile-balancing.test.ts` | Tests Balance request allowlisting, criteria and size limits, output-cap gating, timeout/cancellation, no-retry behavior, and strict proposal validation with stubbed consultations. |
| `tests/model-catalog.test.ts` | Verifies the optional exporter/catalog contract independently of interactive editing. |
| `tests/doctor.test.ts` | Verifies read-only diagnostics for healthy state, drift, malformed journals, missing entries, catalog evidence, auth evidence, and effort compatibility. |
| `tests/odd-only.test.ts` | Guards the ODD-only contract: no packaged profile contains retired routes, runtime derivation removes exactly those routes, and only `/jb-odd-models` is registered. |
| `tests/transaction-recovery.test.ts` | Tests the transaction layer directly: locks, rollback, interrupted writes, recovery, undo, and external-change guards. |

## Focused test commands

Use focused files while developing, then always run the full suite before delivery.

```sh
# Manifest/profile schema, named profiles, and role expansion
node --experimental-strip-types --test tests/manifest-validation.test.ts

# Installer merge, backups, defaults, and dynamic profile copying
node --experimental-strip-types --test tests/installer-merge.test.ts

# Command behavior through the Pi extension seam
node --experimental-strip-types --test tests/command-behavior.test.ts

# Live editor, command registry wiring, and optional catalog contract
node --experimental-strip-types --test tests/profile-editor.test.ts tests/command-behavior.test.ts tests/model-catalog.test.ts

# Balance domain, dialog workflow, loader lifecycle, and installed helper presence
node --experimental-strip-types --test tests/profile-balancing.test.ts tests/profile-editor.test.ts tests/command-behavior.test.ts tests/installer-merge.test.ts

# Two-instance subprocess/file harness (not installed Pi/Gentle integration)
node --experimental-strip-types --test tests/multi-instance.test.ts

# Doctor diagnostics
node --experimental-strip-types --test tests/doctor.test.ts

# ODD-only contract and retired-route removal
node --experimental-strip-types --test tests/odd-only.test.ts

# Transaction safety and recovery
node --experimental-strip-types --test tests/transaction-recovery.test.ts
```

## Fixtures and safety model

The tests avoid the real Pi home by creating temporary directories under the OS temp directory.

Common fixture patterns:

- Temporary `PI_HOME` roots include an `agent/` directory before installer tests run.
- Runtime files are written under temp paths such as `gentle-ai/models.json` and `agent/subagents.json`.
- Command tests register the extension against a fake command API and capture notifications/reload counts in memory.
- Installer tests copy package assets into a temporary package fixture before mutating them.
- Transaction tests operate on temp `models.json`, `subagents.json`, and `.model-profiles-transactions` paths.

Do not point tests at a real `~/.pi` directory. The test helpers are intentionally written to create isolated fixtures.

## Testing profile changes

When adding or changing profiles:

1. Update `config/named-profiles.json` if the role catalog changes.
2. Update or regenerate the corresponding `config/models.<profile>.json` files.
3. Update `config/model-profiles.manifest.json` if profiles are added, removed, renamed, or paired differently.
4. Run:

   ```sh
   node --experimental-strip-types --test tests/manifest-validation.test.ts
   node --experimental-strip-types --test tests/installer-merge.test.ts
   node --experimental-strip-types --test tests/*.test.ts
   ```

The manifest tests compare generated full profiles against the role expansion from `config/named-profiles.json`. This protects against missing managed agents and stale generated profile files.

## Testing installer behavior

Use the in-process installer tests for normal coverage:

```sh
node --experimental-strip-types --test tests/installer-merge.test.ts
```

Use shell syntax and version-gate checks before release:

```sh
bash -n install/install.sh
node --experimental-strip-types --test tests/installer-merge.test.ts
```

The installer tests verify that:

- all manifest-registered profile files are copied;
- every helper module the command imports, including `balancing.ts`, is installed;
- active `models.json` follows the active registered profile, or the manifest default when none matches;
- the 13 retired routes are removed while similarly named custom entries stay;
- a released predecessor extension moves into the backup, and an unrecognized one stops the install before any write;
- runtime `subagents.json.model_profiles` is merged without deleting unrelated entries;
- backups are created only when existing files change;
- repeat installs are byte no-ops;
- unresolved transaction state fails closed.

## Testing command behavior

Command tests do not require real Pi. They import the extension, register the command in a fake API, then call the handler directly.

Run:

```sh
node --experimental-strip-types --test tests/command-behavior.test.ts
```

This verifies:

- argument completions;
- `list` output;
- `preview <profile>` without writes;
- direct profile switching;
- semantic no-op switching;
- opposite-provider judge mappings;
- transaction undo and recovery through the command seam.

## Testing the live profile editor

The focused editor command above uses scripted UI adapters and fake registry metadata, not an installed Pi session. It covers choices from all auth-available registry models (including nested model IDs), command wiring without session-scope filtering, synchronous/asynchronous availability, model-specific reasoning evidence, and preservation of unsupported assignments until explicit replacement. Identity parsing separates the provider at the first slash and preserves the remaining model ID.

Negative cases cover missing, empty, invalid, throwing, rejected, and error-state registries: Edit/Create write nothing and never fall back to a stale exported catalog. View does not query availability. Cancel, confirmed save, external file drift, and failed manifest persistence exercise named-definition safety; saving never activates the profile or changes live session state.

These tests establish scripted dialog behavior and persistence boundaries, **not real terminal rendering, provider reachability, model execution, or account entitlement**. A manual installed-Pi rendering check must be reported separately when performed; registry/auth evidence alone cannot prove remote access.

## Testing Balance

Run the Balance focused command above. Coverage is split by evidence level:

| Level | What it shows | Where |
|---|---|---|
| Scripted tests (automated) | Balance is offered without inference on opening; cancel/decline at every step writes nothing; automatic and customized criteria; all live models, full role coverage, and captured current effort; error/invalid/timeout never save or retry; drift and refreshed-registry loss stop Save; invalid names re-prompt without re-inference; unsupported APIs and extension providers are refused before consent. | `tests/profile-balancing.test.ts`, `tests/profile-editor.test.ts` |
| Loader seam (automated) | `balanceProgress` disposes the UI and abort listeners on success, cancel, and error, using an injected fake loader. | `tests/command-behavior.test.ts` |
| Installer seam (automated) | The installed layout contains `model-profiles/balancing.ts`. | `tests/installer-merge.test.ts` |
| Offline manual checks (recorded once, not in the suite) | Installed jiti 2.7.0 loaded the module cycle with cache disabled and registered the command. The real OpenAI Responses adapter, run with a stub `fetch`, made zero fetches under ChatGPT auth and exactly one with `max_output_tokens: 4096` under API-key auth. | `odd/tasks/profile-balancing.md` |
| Not verified | Real provider calls, terminal rendering, the registry in a live session, installation into an active Pi home, and cost or token accounting. There is no TypeScript compiler (`tsc`) check. | — |

Automated tests stub the provider. Do not run live provider consultations as part of the suite; report any manual live check separately with its provider and model.

## Testing two-instance scope

From the repository root, run:

```sh
node --experimental-strip-types --test tests/multi-instance.test.ts
```

**Prerequisites:** a Node version supporting `--experimental-strip-types`, permission to spawn Node subprocesses, and a writable OS temporary directory. No installed Pi/Gentle runtime, provider credentials, or model access is needed.

`tests/fixtures/model-profile-instance.ts` starts two distinct Node processes that import the real extension. Requests and replies use line-delimited JSON over process pipes. Profile, canonical, runtime, and transaction files use real filesystem IO under freshly generated `odd-model-profiles-multi-*` temporary homes.

| Real boundary | Simulated boundary |
|---|---|
| Separate process IDs and per-process memory | Pi command registration, model registry, model/thinking changes, notifications, and reload |
| Shared or separate temporary `PI_HOME` paths | Live conversation state held in fixture memory |
| Extension command execution and persisted file reads/writes | No installed Gentle child-launch or reviewer-routing consumer |

The scenarios cover shared switches, read-only status and mismatch reporting, live alignment when shared files are already current, undo, reload failure, and byte/mtime stability of B's separate root. They establish no command-driven live-state broadcast in this harness. They **do not establish real Gentle consumer refresh timing, queued/running child behavior, reviewer routing, or end-to-end session isolation**.

Repeated runs use fresh temporary homes and override child `PI_HOME`; no real-home installation or configuration change is required. Do not invoke the fixture manually with an active Pi home or replace its temporary roots with real configuration paths. **Scoped cleanup:** each newly created home owns an idempotent removal closure; scenario teardown closes started children before removing those homes, including when B startup or a scenario fails. Readiness and each request have a 10-second deadline. Close ends stdin, waits up to 10 seconds, then sends SIGTERM and waits another 10 seconds, then SIGKILL and waits a final 10 seconds for process/pipe closure. A child that still does not close produces an explicit cleanup failure rather than an indefinite wait. A request timeout invalidates the reply channel; later requests reject rather than misattribute a late reply.

Lifecycle regressions inject scripted process/pipe failures with short deadlines; assertions depend on protocol events and outcomes, not elapsed-time thresholds. Normal scenarios use real Node subprocesses, and a missing-executable check exercises a real spawn error. Hung-child and force-kill transitions are scripted, not proof of real OS signal behavior. Cleanup only removes the exact roots created by this invocation; it never scans or removes older temp roots and never targets active `~/.pi`. Abruptly killing the test runner or an OS refusing termination/removal can still leave artifacts. W2 acceptance is complete with independent verification of the repaired artifacts (15/15 harness, 27/27 command, 114/114 full-suite tests, and a clean diff check), as recorded in `odd/tasks/model-profile-scope-waves.md`. This does not establish actual OS force-kill behavior or installed live-runtime routing/isolation.

## Testing doctor behavior

Run:

```sh
node --experimental-strip-types --test tests/doctor.test.ts
```

Doctor tests are read-only. They verify diagnostics without repair or writes.

## Testing transaction recovery

Run:

```sh
node --experimental-strip-types --test tests/transaction-recovery.test.ts
```

These tests focus on the lower-level transaction machinery and simulate fault points. They verify that interrupted or competing writes do not silently overwrite unknown bytes.

## Pre-delivery checklist

Before commit, install, push, or release:

```sh
node --experimental-strip-types --test tests/*.test.ts
bash -n install/install.sh
git diff --check
```

Then inspect repository state:

```sh
git status --short
```

Only install into a real Pi home when explicitly intended:

```sh
./install/install.sh
```

After real installation, restart Pi and verify manually:

```text
/jb-odd-models status
/jb-odd-models doctor
```
