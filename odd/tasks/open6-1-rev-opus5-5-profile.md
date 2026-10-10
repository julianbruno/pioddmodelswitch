# OpenAI 6.1 / Opus 5.5 crossed-review profile

## Authorization and scope
User requests open6.1revoopus5.5 based on openai6-1-gentle and explicitly selected split-review-and-judges: three review roles GPT-6.1, three Opus5.5, judge-a GPT/judge-b Opus, all high. Other roles and all thinking preserve base. Create static repository profile only, no installed-home changes/activation/provider calls/commits/push. Preserve verified Fable and earlier W/E/B work on feat/model-profile-scope-waves.

## Mapping decision
GPT openai/gpt-6.1-sol high: review-risk,review-reliability,review-validator,jd-judge-a.
Opus claude-bridge/claude-opus-5-5 high: review-resilience,review-readability,review-refuter,jd-judge-b.
All remaining roles exact base openai6-1-gentle: explore openai/gpt-6-luna high; worker/jd-fix openai/gpt-6.1-sol low; orchestrator Sol medium; verify Sol high. This spreads lenses across companies and crosses validator/refuter; no claim both models execute every lens or native review workflow changed. No profilePairs entry (would overwrite mixed assignments).

## Tasks
- [x] H1 — Add13-role hybrid profile,manifest registration and exact split/base/thinking/unpaired canonical/runtime regression tests. **Writer RED then GREEN20/20 focused197/197 full,diff clean; static only.**
- [x] H2 — Independent focused/full verification and source readback; prove Fable/default/pairs preserved and clarify no live provider validation. **Independent PASS20/20 focused197/197 full,diff/new JSON checks clean; default/pairs/base/Fable preserved.**

## Allowed surfaces
config/models.open6.1revoopus5.5.json (new)
config/model-profiles.manifest.json
tests/manifest-validation.test.ts

## Checks and evidence
Scout mv2llbt6-12-rcde confirmed exact base and bridge Opus identities,pairing mechanism at core.ts353–360. Installer discovers manifest files automatically. Test-first RED then GREEN node --experimental-strip-types --test tests/manifest-validation.test.ts; npm test; git diff --check; untracked JSON whitespace. Fable independent19/19 focus196/196 full. No benchmark/reachability/thinking capability claims. Parent chosen role distribution within explicit3/3+judge split; no second product question needed. No commits authorized. Writer mv2m3ojo-13-657k completed three surfaces; exact4 model overrides/all13 base thinking retained, Fable/default/pairs unchanged. Native ASSESS unassessable untracked scope; independent H2 mv2m5s23-14-6lev PASS20/20 focused197/197 full, exact mixed canonical/runtime assignments. No live provider/install/activation check. Proceed queued Opus/GPT-judge creation; this profile complete uncommitted.
