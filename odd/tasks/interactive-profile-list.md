# Interactive profile list

## Objective and authorization
User requests selectable `/jb-odd-models list`, profile activation assigning its model to Pi's current `/model`, and review of current profile model choices. Implement on `feat/interactive-profile-list`; no install, activation of the actual session or push. User subsequently requested a Markdown comparison and explicitly authorized integrating all pending work into main, including necessary local commits.

## Design and scope
Use the effective `orchestrator` model/thinking from each profile, already implemented by direct activation. Current 27 profiles reviewed: most orchestrators medium, three Astra-only variants low. Mixed-review presets retain their base orchestrator; no profile JSON changes necessary. Show manifest profile names plus orchestrator identity/thinking; do not infer incomplete display metadata or new preferred defaults. Reuse the direct activation path, including registry checks, transaction/rollback and invoking-session reload semantics. Noninteractive list remains textual; cancel writes nothing. Do not redefine Pi `/list` or `/model`.

## Tasks
- [x] L1 — Implement interactive picker with test-first selection/cancel/fallback/invalid-selection/failure coverage and focused usage documentation. **Writer RED 34/43 then GREEN 43/43 focused, 209/209 full; 11 picker cases, 117 authored lines.**
- [x] L2 — Independently verify picker, shared activation/model alignment, regression suite and docs; close with evidence. **Independent PASS 43/43 focused, 209/209 full; docs/API/rollback checks pass; source hashes unchanged.**

- [x] L3 — Create `MODEL_PROFILES_COMPARISON.md` comparing all 27 profiles from actual effective derivation; configured assignments only. **Writer structural PASS: 351 raw + 351 effective assignments, 14 directed mappings, 32 links.**
- [x] L4 — Independently check comparison against source, commit verified units and fast-forward main; no push or install. **Independent PASS: 209/209 fresh tests, 351 raw + 351 effective assignments, 14 directed mappings, 32 links. Commits created and main fast-forward observed at a43676d; main/feature 0/0. No push/install.**

## Allowed source surfaces
`extensions/odd-model-profiles.ts`, `tests/command-behavior.test.ts`, `USAGE.md`.

## Acceptance and checks
- UI list options reflect current manifest; explicit selection activates only that profile and its effective orchestrator model/thinking.
- Cancel, no-UI fallback, unknown option and picker failures do not activate/write/reload.
- Selection revalidates current registry; unavailable models fail safely, persistence failure preserves rollback guarantees.
- Focused `node --experimental-strip-types --test tests/command-behavior.test.ts` observed RED then GREEN; `npm test`; `git diff --check`; independent verification.
- Live Pi UI/provider checks remain outside authorized scope; simulated API evidence distinguished.

## Evidence and next step
Explorer mv2op4dw-1b-esjz mapped reuse of handler activation and all27 orchestrator choices. Branch created from clean main at a5f0853. Writer mv2osuc5-1c-iomq completed L1 on three allowed surfaces; exact label mapping falls into existing activation lifecycle. Native ASSESS unassessable due untracked task file; RDD off, independent verifier mv2ownw6-1d-24ow passed fresh 43/43 focused and 209/209 full, diff/task whitespace, exact option mapping, RPC/cancel/fallback/revalidation and orchestrator-not-judge alignment. No findings; source hashes/status stable. Live Pi checks skipped; no installed-home mutations. Picker implementation verified offline. User now requests comparison Markdown and integration of all pending changes to main. Create comparison without changing model JSON/source; independent data checks and authorized local commits/merge completed. No push or installation authorized.

## Commit and verification evidence
- L1/L2: `7580151f959e3ee055c95e0a0d77ce75630f7b3d` — selectable list with tests and usage; rollback boundary is picker branch/completion, 11 tests and related usage only.
- L3: `a43676de5df055179ae166cd2c3c9617d397ee50` — comparison documentation; rollback boundary is `MODEL_PROFILES_COMPARISON.md` only.
- L4 verifier `mv2pb85d-1g-qul9`: fresh full suite 209/209, document decoder exact 27 profiles / 351 raw + 351 effective / 14 directed mappings / 32 links; diff and document whitespace checks pass. 90 file hashes stable.
- RED is writer-reported; independent GREEN observed. Live picker/RPC/provider checks skipped. Build/typecheck not run.
- User-authorized local integration uses fast-forward only; no push or active-home installation.
