# Opus 5.5 with GPT 6.1 judge

## Authorization and scope
User requests profile based on claude-opus5.5 with one GPT6.1 reviewer; explicitly chose jd-judge-b -> openai/gpt-6.1-sol high. Proposed name opus5.5revgpt6.1 presented with selection. Every other role/model/thinking must remain exact config/models.claude-opus-5.5.json (including review-readability medium). jd-judge-a remains claude-bridge/claude-opus-5-5 high. No profilePairs entry; no default/base/version changes. Repository creation only, no installation/activation/provider calls/commits/push.

## Tasks
- [x] O1 — Add profile,manifest registration and one-role override/base parity/unpaired canonical+runtime regression tests. **Writer RED2 failures then GREEN21/21 focused198/198 full; exactly one model override; no install/activation.**
- [x] O2 — Independently verify13-role exact parity except judge-B model, focused/full tests and preservation of Fable/OpenAI hybrid. **Independent PASS21/21 focused198/198 full,diff/new JSON checks clean; one model override confirmed.**

## Allowed surfaces
config/models.opus5.5revgpt6.1.json (new)
config/model-profiles.manifest.json
tests/manifest-validation.test.ts

## Checks and next step
Existing reference mapped read-only:13-role standalone unpaired. Selected one judge only; six reviewers not changed. Test-first observed RED then GREEN node --experimental-strip-types --test tests/manifest-validation.test.ts; npm test;git diff --check,new JSON whitespace. Preserve uncommitted work on feat/model-profile-scope-waves. H1/H2 completed independently20/20 focused197/197 full. Begin O1 single writer; retain both verified hybrid and Fable. Writer mv2m7i0p-15-wuwv completed exact one-model override+last manifest registration+test. GREEN21/21 focused198/198 full,diff/new JSON checks clean. Native ASSESS unassessable due untracked declaration; independent O2 mv2m9lst-16-vhst PASS21/21 focused198/198 full, one-line model diff/all13 thinking retained/unpaired canonical+runtime routes. Fable/hybrid tests pass; default/pairs/schema/base unchanged. Complete static creation only; no live provider/install/activation/commits. Next user decision: install and select separately. Live provider capability not verified. Commit identities:none authorized.

## Commit evidence
- Work-unit commit: `32881857f58c60327074598b02e9c920f9886118`.
- Boundary: Three static presets, manifest registrations and parity regression tests.
- Fresh precommit full-tree verification: `npm test` 198/198; diff, untracked JSON and whitespace checks pass. Intermediate commit snapshots were not independently tested.
- User accepted the integrated 2,499-line size exception and two implementation commits; no push. RDD off; live provider checks remain unverified.
