# Claude Opus 5.5-only profile

## Objective and scope
Add a selectable `claude-opus-5.5` profile that uses only `claude-bridge/claude-opus-5-5` across every managed agent, including reviewers and judges, while preserving the per-agent thinking intensities from `openaigentle`. Release the backward-compatible profile addition as version `1.3.0`, commit it as one reviewable work unit, and install the verified plugin into the active Pi home.

## User request
- Use `openaigentle` as the workload/thinking-intensity reference.
- Add a Claude Opus 5.5-only profile with distinct thinking modes.
- Commit the result.
- Install the plugin.

## Decisions and constraints
- Use the valid profile name `claude-opus-5.5`; camelCase names such as `claudeOpus5.5` are rejected by the package's safe-name validation.
- Use the locally verified Pi identifier `claude-bridge/claude-opus-5-5` for every managed agent.
- Copy every `openaigentle` per-agent `thinking` value verbatim, including `max` for `sdd-archive`.
- Keep the profile unpaired so reviewer and judge agents remain on Claude Opus 5.5.
- Preserve `openaigentle` as the default profile and preserve all existing aliases and opposite-provider pairings.
- Use a semantic-version minor bump from `1.2.0` to `1.3.0` for the new backward-compatible selectable profile.
- Keep technical artifacts and repository documentation in English.

## Delivery and routing
- Branch: `feat/claude-opus-5-5-profile`.
- Route: delegated bounded implementation because the coherent change spans multiple non-trivial config, test, package, and documentation files.
- Delivery strategy: one work-unit commit, expected below the 400-line review budget.

## Testing mode
- TDD: enabled.
- Focused runner: `node --experimental-strip-types --test tests/manifest-validation.test.ts tests/installer-merge.test.ts`.
- Full runner: `npm test`.
- Additional checks: `bash -n install/install.sh` and `git diff --check`.

## Tasks
- [x] T1: Add, document, verify, commit, and install the Claude Opus 5.5-only profile.

## Acceptance criteria
- `claude-opus-5.5` is selectable through the existing named-profile mechanism.
- Every canonical and runtime managed agent uses `claude-bridge/claude-opus-5-5`.
- Every managed agent preserves the exact `thinking` value from `openaigentle`.
- Reviewer and judge agents are not replaced by an opposite-provider profile.
- Existing defaults, aliases, profiles, and pairings remain unchanged.
- Package version is `1.3.0`; relevant docs describe the new profile.
- Focused tests, full tests, shell syntax, whitespace checks, installed-file readback, and plugin installation succeed.
- One Conventional Commit records the complete work unit.

## Progress and verification evidence
- Read-only exploration mapped the manifest, generated profile, tests, documentation, and installer paths.
- Local Pi catalog confirmed provider/model `claude-bridge/claude-opus-5-5`, 1M context, reasoning support, and thinking levels through `max`.
- Writer RED: `tests/manifest-validation.test.ts` failed 3 expected tests before the profile implementation.
- Writer GREEN: focused manifest tests passed 12/12, then the full suite passed 57/57 and `git diff --check` passed.
- Independent verifier PASS: focused manifest/installer tests passed 20/20; full suite passed 57/57; shell syntax and whitespace checks passed; semantic inspection confirmed all 25 managed agents use Claude Opus 5.5 with the exact `openaigentle` thinking values.
- Native risk assessment was unavailable because intended untracked files were not declared; with RDD off, the required independent verifier completed successfully.
- Runtime harness before installation: N/A because the test suites cover declarative selection/expansion and real Pi-home mutation is reserved for the explicitly requested installation step.
- Rollback boundary: remove the standalone profile file and its manifest/test/documentation registration, and restore package version 1.2.0; existing profiles and pairings remain independent.
- Work-unit commit: `76a1a5f` (`feat(profiles): add Claude Opus 5.5 profile`).
- Installation completed in `/home/julian/.pi`; backup: `/home/julian/.pi/backups/jb-sdd-odd-models-2026-09-27T21-07-36-887Z-2619079`.
- Post-install verifier PASS: installed manifest/profile/extension/helper bytes match the repository; the Claude profile contains exactly 25 agents with matching `openaigentle` thinking values; active canonical/runtime mappings remain on default `openaigentle`; repository was clean before this final tracker update.

## Next step
Restart or reload Pi, then run `/jb-sdd-odd-models preview claude-opus-5.5` and `/jb-sdd-odd-models doctor` in the refreshed process.
