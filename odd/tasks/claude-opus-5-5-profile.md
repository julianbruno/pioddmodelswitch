# Claude Opus 5.5-only profile

## Objective and scope
Add a selectable `claude-opus-5.5` profile that uses only `claude-bridge/claude-opus-5-5` across every managed agent, including reviewers and judges, with thinking calibrated to each task category rather than copied from models in `openaigentle`. Release the corrected profile as version `1.3.1`, commit the reviewable work units, and install the verified plugin into the active Pi home.

## User request
- Use `openaigentle` as the workload/thinking-intensity reference.
- Add a Claude Opus 5.5-only profile with distinct thinking modes.
- Commit the result.
- Install the plugin.

## Decisions and constraints
- Use the valid profile name `claude-opus-5.5`; camelCase names such as `claudeOpus5.5` are rejected by the package's safe-name validation.
- Use the locally verified Pi identifier `claude-bridge/claude-opus-5-5` for every managed agent.
- Calibrate thinking by task: `low` for mechanical lifecycle work, `medium` for coordination/exploration/implementation, and `high` for research/design/verification/adversarial review.
- Do not use `max`: `sdd-archive` is mechanical and should use `low` on Opus 5.5.
- Keep the profile unpaired so reviewer and judge agents remain on Claude Opus 5.5.
- Preserve `openaigentle` as the default profile and preserve all existing aliases and opposite-provider pairings.
- Use version `1.3.1` for the corrective task-aware calibration after the initial `1.3.0` profile addition.
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
- [x] T1: Add, document, verify, commit, and install the initial Claude Opus 5.5-only profile.
- [ ] T2: Correct thinking levels to be task-aware, verify, commit, and reinstall version 1.3.1.

## Acceptance criteria
- `claude-opus-5.5` is selectable through the existing named-profile mechanism.
- Every canonical and runtime managed agent uses `claude-bridge/claude-opus-5-5`.
- Thinking levels follow explicit task categories and no managed agent uses `max`.
- Reviewer and judge agents are not replaced by an opposite-provider profile.
- Existing defaults, aliases, profiles, and pairings remain unchanged.
- Package version is `1.3.1`; relevant docs describe the task-aware profile.
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
- T1 rollback boundary: remove the standalone profile file and its manifest/test/documentation registration, and restore package version 1.2.0; existing profiles and pairings remain independent.
- Work-unit commit: `76a1a5f` (`feat(profiles): add Claude Opus 5.5 profile`).
- Installation completed in `/home/julian/.pi`; backup: `/home/julian/.pi/backups/jb-sdd-odd-models-2026-09-27T21-07-36-887Z-2619079`.
- Post-install verifier PASS for T1: installed manifest/profile/extension/helper bytes matched the repository; the Claude profile contained exactly 25 agents; active canonical/runtime mappings remained on default `openaigentle`.
- User correction after T1: workload intensity depends on both model capability and task; copying Sol/Luna thinking values directly to Opus 5.5 was rejected, especially `sdd-archive: max`.
- T2 writer RED: 2 focused failures exposed the old package version and copied effort categories.
- T2 writer GREEN: focused Claude tests passed 2/2; manifest tests passed 13/13; full suite passed 58/58; whitespace checks passed.
- T2 independent verifier PASS: focused manifest/installer tests passed 21/21; full suite passed 58/58; shell syntax and whitespace checks passed; exact 5 low / 8 medium / 12 high groups and absence of `max` were confirmed.
- T2 runtime harness before installation: N/A because isolated suites exercise profile derivation; real Pi-home installation remains the explicitly requested final step.
- T2 rollback boundary: restore the 1.3.0 profile values/docs/tests and package version; profile registration and all unrelated mappings remain unchanged.

## Next step
Commit the verified task-aware calibration, reinstall version 1.3.1, and read back the corrected profile.
