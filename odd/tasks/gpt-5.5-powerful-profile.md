# GPT-5.5-only balanced Powerful profile

## Objective and scope
Add a selectable `gpt-5.5-powerful` profile that uses only `openai-codex/gpt-5.5` across every managed agent, including reviewers and judges, and release the profile catalog as version `1.2.0`.

## User request
- Add a new Powerful profile composed exclusively of GPT-5.5.
- Keep the profile balanced with role efforts: orchestrator `medium`, reasoning `xhigh`, code `high`, lightweight `medium`.
- Bump the package version.

## Decisions and constraints
- Name the profile `gpt-5.5-powerful`, following the existing `gpt-<version>-<lane>` convention.
- Keep the profile unpaired in `oppositeProviderJudges`, so reviewers and judges also remain on GPT-5.5 instead of routing to Grok.
- Preserve `openaigentle` as the default profile and preserve all existing aliases and pairings.
- Use a semantic-version minor bump from `1.1.0` to `1.2.0` because this adds a backward-compatible selectable capability.
- Generate a complete per-agent model file containing exactly the manifest-managed agents.
- Technical artifacts and UI-facing documentation remain in the repository's established English.

## Delivery and routing
- Route: delegated direct implementation.
- Trigger evidence: the coherent change spans multiple non-trivial config, test, package, and documentation files.
- Forecast: approximately 180–260 authored changed lines, below the 400-line review budget.
- Delivery strategy: `ask-on-risk`.
- The user subsequently authorized one work-unit commit and installation after verification.

## Testing mode
- TDD: enabled.
- Source: session implementation policy and repository test coverage.
- Focused runner: `node --experimental-strip-types --test tests/manifest-validation.test.ts tests/installer-merge.test.ts`.
- Full runner: `npm test`.

## Tasks
- [x] T1: Add RED coverage for the new profile registration, complete GPT-5.5 role/agent expansion, unpaired judge behavior, and package version `1.2.0`.
  - Evidence: focused RED failed 3 tests for the missing profile and unchanged package version.
- [x] T2: Add and register `gpt-5.5-powerful` with the agreed role efforts and complete per-agent assignments.
  - Evidence: the profile is registered, has a complete 25-agent assignment file, and remains deliberately unpaired.
- [x] T3: Update package and documentation surfaces for version 1.2 and the new profile semantics.
  - Evidence: `package.json` reports `1.2.0`; README, switching, alias, and architecture docs describe the profile.
- [x] T4: Run focused and full verification, structural checks, and native risk assessment.
  - Evidence: writer and independent verifier passed focused 19/19, full 56/56, shell syntax, and whitespace checks; parent spot-check repeated focused 19/19 and `git diff --check` successfully.

## Acceptance criteria
- `gpt-5.5-powerful` is selectable through the existing named-profile mechanism.
- Every canonical and runtime agent selected by the profile uses `openai-codex/gpt-5.5`.
- Role efforts are orchestrator `medium`, reasoning `xhigh`, code `high`, and lightweight `medium`.
- Reviewer and judge agents are not replaced by an opposite-provider profile.
- Existing defaults, aliases, profiles, and opposite-provider pairings remain unchanged.
- `package.json` reports version `1.2.0`, and relevant docs describe the new profile accurately.
- Focused tests and the full suite pass.

## Progress and verification evidence
- Exploration completed: existing named-profile, manifest, opposite-provider, documentation, and test invariants mapped by `gentle-ai-explore`.
- User confirmed that reviewers and judges must also use GPT-5.5.
- Writer GREEN: focused suite passed 19/19; full suite passed 56/56; `bash -n install/install.sh` and `git diff --check` passed.
- Native assessment returned `unassessable` because the candidate contains undeclared untracked files; with RDD off, its plan required an independent verifier.
- Independent verifier PASS: focused suite 19/19, full suite 56/56, shell syntax, and whitespace checks all passed; semantic inspection confirmed all 25 managed agents remain on GPT-5.5.
- Parent spot-check: focused suite passed 19/19 and `git diff --check` passed.
- Runtime harness: N/A because automated suites cover declarative profile selection/expansion and no installed user configuration should be mutated during verification.
- Approximate authored change including the feature document: 226 lines.
- Installed the committed package into `/home/julian/.pi`; the installer created a timestamped backup and post-install checks confirmed the registered 25-agent GPT-5.5-only profile remains unpaired.

## Next step
Restart Pi, then run `/jb-sdd-odd-models status`, `/jb-sdd-odd-models preview gpt-5.5-powerful`, and `/jb-sdd-odd-models doctor`.
