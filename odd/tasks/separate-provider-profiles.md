# Separate Claude and OpenAI profiles

## Objective and scope
Add two selectable profiles named `claude-sep` and `openai-sep`, based on the supplied routing screenshot. Preserve the repository's lowercase path-safe profile-name contract and keep both profiles unpaired so their explicit judge and reviewer assignments are not replaced.

## User request
- Add two new profiles originally requested as `claudeSep` and `openaiSep`.
- Match the visible ODD, Judgment Day, and review-agent routes from the supplied screenshot.
- The user selected canonical lowercase names `claude-sep` and `openai-sep` after the existing validator and case-insensitive selector were explained.

## Decisions and constraints
- Register `claude-sep` and `openai-sep` as standalone profiles.
- For SDD roles absent from the screenshot, inherit the closest existing profile: `claude-opus-5.5` for Claude and `openaigentle` for OpenAI.
- Add `jd-fix-agent` to the managed ODD agents because it appears in the screenshot but is not currently managed. Every existing profile must gain a complete assignment for it, following that profile's code/implementation role.
- Apply the screenshot-specific ODD/reviewer overrides after inheritance.
- `openai-sep` changes `gentle-ai-worker`, `jd-fix-agent`, and the equivalent implementation agent `sdd-apply` to `openai-codex/gpt-6-sol` at `medium`; its remaining screenshot routes match `openaigentle`.
- `claude-sep` keeps Opus assignments for reasoning, verification, judges, and reviewers, while routing `sdd-explore`, `gentle-ai-explore`, `sdd-apply`, `gentle-ai-worker`, and `jd-fix-agent` to `claude-bridge/claude-sonnet-5` at `high`. The orchestrator remains the task-aware Opus baseline because the screenshot does not specify it.
- Do not add either profile to `oppositeProviderJudges.profilePairs`.
- Do not change the default profile, aliases, existing pairings, or package version.

## Delivery and routing
- Route: delegated direct implementation.
- Trigger evidence: the change spans multiple non-trivial config, test, and documentation files.
- Exploration fallback: two `gentle-ai-explore` attempts failed before any tool call; mapping was completed from bounded parent reads, and implementation preparation is delegated with the write.
- Forecast: approximately 280–420 authored changed lines because `jd-fix-agent` must be added to every complete profile. Keep the implementation cohesive; the 400-line value is an advisory review heuristic, not a correctness cap.
- Delivery strategy: `ask-on-risk`.
- No commit is authorized by the user.

## Testing mode
- TDD: enabled.
- Source: active coding instructions require strict TDD when tests exist.
- Focused runner: `node --experimental-strip-types --test tests/manifest-validation.test.ts`.
- Full runner: `npm test`.

## Tasks
- [x] T1: Confirm valid canonical names and resolve the camelCase conflict with the user.
- [x] T2: Add RED coverage for `jd-fix-agent` management, registration, complete managed-agent coverage, exact screenshot routes, inherited SDD routes, and unpaired behavior.
- [x] T3: Add `jd-fix-agent` to existing profiles, then add and register both complete new profile files.
- [x] T4: Update user-facing profile documentation.
- [x] T5: Run focused and full verification plus structural checks.

## Acceptance criteria
- `/jb-sdd-odd-models claude-sep` and `/jb-sdd-odd-models openai-sep` are valid registered selections.
- `jd-fix-agent` becomes a manifest-managed ODD agent and every registered profile remains complete.
- Both new files contain exactly every manifest-managed agent.
- The screenshot's visible model and effort assignments are reproduced exactly.
- Screenshot-unlisted SDD entries follow their documented baseline, with implementation routes consistent with each profile's worker model.
- Both profiles remain unpaired, preserving their own judge/reviewer mappings.
- Existing defaults, aliases, profiles, and opposite-provider pairings remain unchanged.
- Focused tests and the full suite pass.

## Progress and verification evidence
- User selected lowercase kebab-case canonical names.
- Two read-only exploration delegations and one bounded writer delegation failed before making any tool call.
- Strict TDD RED: focused `node --experimental-strip-types --test tests/manifest-validation.test.ts` failed 7 of 14 tests after test-first edits, including missing `jd-fix-agent` in the manifest and profiles and missing separate profiles.
- GREEN: the focused command passed 14/14 after implementation; subsequent required verification passed: `npm test` 66/66, `git diff --check` clean, and config JSON parse check printed `config JSON OK`.
- Added `jd-fix-agent` to the manifest and every registered profile, registered both unpaired standalone profiles, and documented their inherited and overridden routes in README.md and MODEL_SWITCHING.md. No commit was made, as requested.
- Visual correction: `claude-sep` `review-readability` explicitly overrides the baseline to Opus/high. Test-first focused run failed 1/14 on the old medium route; after the profile correction, focused verification passed 14/14, `npm test` passed 66/66, and `git diff --check` was clean. No commit was made.
- Independent verification found stale inheritance wording; corrected README.md and MODEL_SWITCHING.md to state the `claude-sep` `review-readability` Opus/high override alongside the five Sonnet/high routes. Documentation correction verification: `npm test` passed 66/66 and `git diff --check` was clean.

## Next step
Parent review of the uncommitted changes and any user-directed delivery decision.
