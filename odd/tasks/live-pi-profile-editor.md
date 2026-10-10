# Live Pi model profile editor

## Objective and authorization
Update `/jb-odd-models edit` to configure named profiles from models available in the invoking Pi runtime, and update project documentation. User selected **all available Pi models**, not the session-scoped subset. Preserve View/Edit/Create and explicit save confirmation.

## Constraints and rationale
Available means registry/auth configuration evidence, not provider reachability or entitlement. Never make provider calls to validate choices. Saving a named definition must not activate it or write shared active `models.json`/`subagents.json`. Missing, empty or failing live registry blocks Edit/Create clearly, with no stale catalog fallback; View stays available. Keep exported catalogs/headless tooling and optional installer assets. No active installation changes, commits, push, PR or merge without explicit request. Work on existing `feat/model-profile-scope-waves` branch, preserving verified W1/W2 changes.

## Tasks
- [x] E1 — Wire live registry to profile editor; choose models and supported thinking per role, preserve unavailable assignments visibly and require replacement before save. Add test-first regression coverage and user-facing usage docs. **Independent PASS; uncommitted.**
- [x] E2 — Update project onboarding/installation/architecture/testing docs to match runtime registry source, preserve optional export paths and save/activate distinction. **Writer structural verification passed.**
- [x] E3 — Independently verify focused/full suites, dialog lifecycle, persistence safety and docs; functional scripted TUI checks must cover View/Edit/Create/cancel/unavailable cases. **Independent PASS: three factual documentation repairs verified; fresh focused 55/55 and full 127/127, zero failures/skips; diff clean.**

## Acceptance criteria
All live auth-available models are eligible regardless of ctx.scopedModels. No exported catalog is required for interactive mutation. Only allowlisted identity/capability metadata crosses the editor contract, not SDK objects or secrets. Support current public registry API and asynchronous-compatible result handling where needed. Offer model-specific thinking consistent with documented Pi capabilities; unknown metadata must not imply support. Changing a model must not silently clamp/downgrade an existing assignment. View does not need model availability. Edit/Create unavailable states do not write. Save updates only named definition/manifest; confirmation, optimistic drift detection and rollback behavior remain intact.

## Checks
Test-first E1: observe RED for no-catalog live edit/create, runtime exact options/no stale fallback, registry failures, unavailable assignments and effort, command registry wiring. Focus: `node --experimental-strip-types --test tests/profile-editor.test.ts tests/command-behavior.test.ts tests/model-catalog.test.ts`. Full: `npm test`; `git diff --check`. Functional scripted dialogs exercise actual editor flow; actual terminal rendering not proven by unit mocks, report any unavailable manual TUI check. Documentation-only E2 has no meaningful RED/GREEN; structural readback and links/source checks.

## Edit surfaces
E1: `extensions/odd-model-profiles.ts`, `extensions/model-profiles/editor.ts`, `tests/profile-editor.test.ts`, `tests/command-behavior.test.ts`, `USAGE.md`, `MODEL_SWITCHING.md`.
E2: `README.md`, `INSTALLATION.md`, `HOW_TO_INSTALL.md`, `INSTALL_AND_SYNC.md`, `ARCHITECTURE.md`, `TESTING.md` (only relevant stale statements).
User explicitly approved adding `extensions/model-profiles/core.ts` and `tests/manifest-profiles.test.ts` to E1 for a narrow identity-validator fix: split at the first slash, preserve nested model ID, retain malformed-identity rejection. No exporter/installer production changes planned.

## Evidence and progress
Scout map completed; user resolved model-set question: all getAvailable models rather than session scope. Installed getAvailable facade is synchronous; refresh is async if explicitly used. E1 writer finished eight files including approved nested identity correction. Initial live-registry RED41/46; validator RED47/49; final focus55/55 and full127/127, diff clean. Docs USAGE/MODEL_SWITCHING updated. E1 cohesive423 authored lines reported; no tests omitted. Native ASSESS unassessable due untracked declarations returned mandatory independent verifier; verifier now active. Independent E1 PASS55/55 focus127/127 full,diff clean; no blocker. Scripted dialog functionality verified; real rendering/provider execution not tested. Proceed E2 documentation. Prior scope waves W1/W2 independently verified; W3-W5 isolation upstream blocked and not part of this editor change. Commit identities: none (not authorized).

E2 doc writer changed README,INSTALLATION,HOW_TO_INSTALL,ARCHITECTURE,TESTING; reviewed INSTALL_AND_SYNC unchanged. Source/link consistency and diff check passed; no source changes after E1 independent suite run.

## Next step
E3 repairs independently verified by mv1uvyv1-l-qy2t. Fresh focused55/55 and full127/127 passed, no skips/failures, diff clean. Historical byte identity unproven (no baseline hashes); current functional checks freshly executed. Actual terminal/provider execution untested. Continue balancing B1. No commits authorized.
