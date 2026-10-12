# Scrollable model picker

## Scope
Fix the Model picker in /jb:odd-models edit for long model catalogs. No Pi core/Gentle edits, live install, reload, provider calls or profile activation. Preserve editor validation/persistence and RPC fallback. Resume complete-plugin-guide D1 afterward.

## Tasks
- [x] S1 — Test-first bounded visible model selector in interactive TUI, deterministic long-list keyboard/render tests and cancel/fallback/selection mapping coverage; installer delivery if a helper is added; self-check, native assessment-directed verification and commit.

## Diagnosis
Explorer mv4p1ill-7-869s: editor.ts:299–307 passes entire live catalog to ui.select; odd-model-profiles.ts:760–771 forwards ctx.ui directly. Pi 1.1.0 generic ExtensionSelectorComponent renders every option without viewport, although keyboard index advances. Use custom SelectList bounded viewport rather than changing Pi. Mouse wheel only if wrapper correctly forwards supported events; do not claim untested behavior.

## Evidence
Writer RED: 229 tests, 225 pass/4 fail (viewport bounds and callback); GREEN: 233/233 full suite. Actual native SelectList input/render tests with 80 models and heights 24/5/2/1, last row visibility, reverse keys, wheel, resize, confirm/Escape; editor identity/cancel/fallback coverage. New helper delivered by installer. Native ASSESS unassessable due untracked scope; RDD off, independent verifier required: PASS focused110/110, full233/233, diff clean, no functional blockers. Native render/input exercised via fake custom host; live terminal dispatch/installation pending. Test prerequisite installed pi-tui (PI_TUI_MODULE override); no self-contained clean-checkout runner claim. Reverse coverage one step; resize each initial height to3. Work-unit commit: dd490f2.

## Checks
Applicable deterministic test-first: RED then GREEN, full npm test, actual headless rendering/input of long list and small viewport, confirm/cancel identity mapping, noninteractive fallback. Structural doc/installer checks. No live interactive smoke or installation; those remain pending.
