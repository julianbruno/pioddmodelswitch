# Namespaced command release 2.0.0

## Scope
Replace the public `/jb-odd-models` command with `/jb:odd-models`, update current guides and lane setup output, bump package metadata to 2.0.0, verify, install into the principal `~/.pi`, and commit on the feature branch. No merge or push. Preserve active routing and identity/auth/session data; no lane installs or provider requests. Package name, filenames and backup prefixes remain unchanged: this is a command rename, not a package rename. Existing 1.6.0 package/test edits are superseded.

## Tasks
- [x] N1 — Test-first command rename with current docs, lane output and version 2.0.0; self-verification and assessment-directed independent verification; work-unit commit.
- [ ] N2 (in progress) — Install verified release into principal Pi home; confirm extension/assets match and routing remains unchanged; record installation evidence and commit tracker.

## Checks
Deterministic command registration/behavior and manifest tests RED then GREEN; full npm test; whitespace checks. Installation is authorized only after repository checks pass. Live interactive reload/provider checks remain pending; do not reload the current session automatically.

## Evidence
Writer RED: 81 tests, 38 passed/43 failed. GREEN: 81/81 focused, 224/224 full, diff check clean. Installer scope expanded with explicit approval to change its three slash-command instructions. Pi API source inspection accepts colon names; interactive reload/autocomplete not exercised. Native ASSESS unavailable due untracked task files; returned high-equivalent plan requires independent verification (RDD off). Independent verifier PASS: 81/81 focused, 224/224 full, no blockers; parent corrected NOTICE.md current command and verifier confirmed readback/diff check. Suites preceded this doc-only correction. N1 verified; commit follows. N2 requires absent transaction markers, registered canonical profile match, routing before/after evidence, and no concurrent profile writes.
Branch: feat/grok-lane, following bbe9c20 and 6c9adfd. Prior untracked odd/tasks/release-1-6-0.md remains a historical pending release record; do not stage unrelated files.
