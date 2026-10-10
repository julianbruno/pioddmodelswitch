# Model profile scope waves

## Objective
Make profile scope explicit and support independent concurrent sessions only through supported routing contracts, including reviewer routing.

## Authorization and constraints
User authorized all executive-summary improvements by waves, with concurrency when appropriate. Parallel read-only work is allowed; writers remain serialized unless isolated worktrees are used. Never modify active PI_HOME or installed packages. No push, PR, or merge. No commits without explicit user request. Feature branch: `feat/model-profile-scope-waves`.

## Problem and rationale
Current selection writes shared profile/runtime mappings while only the invoking conversation switches its live orchestrator and reloads. Users can mistake this for local selection. A session snapshot must govern actual child and review resolution; command-local state alone is insufficient.

## Tasks
- [x] W1 — Explicit shared scope, truthful switch/reload notices, and current-session versus persisted status. **Verified; uncommitted.**
- [x] W2 — Controlled two-instance harness using disposable paths; establish shared writes and lack of live broadcast without inventing refresh timing. **Independent PASS; uncommitted.**
- [ ] W3 — Session-bound snapshots and child inheritance through a verified supported runtime contract. **Blocked: installed Gentle exposes no verified public snapshot consumer seam.**
- [ ] W4 — Explicit refresh, resume/fork, and failure semantics after W3 contract is established.
- [ ] W5 — Reviewer routing consistency and opt-in shared-default drift notices after supported consumers are established.

## Acceptance criteria and checks
W1: status separates shared saved/runtime mappings from live model/thinking, identifies scope and detectable mismatches; switches explain shared effect and local reload; reload failure accurately preserves applied state. Test-first focused command suite, then full npm test.
W2: isolated A/B tests confirm A changes shared files but not B's live model; real runtime scenarios use disposable PI_HOME only, or report unavailable runtime evidence explicitly.
W3–W5: session actions write no shared defaults; children/reviewers inherit correct snapshots; edits require explicit refresh; queued/running work remains stable; resume/fork and failure checks prove truthful adoption. Unsupported APIs are blockers, not successful implementation.

## Wave boundaries and edit surfaces
W1: `extensions/odd-model-profiles.ts`, `tests/command-behavior.test.ts`, `MODEL_SWITCHING.md`, `USAGE.md`.
W2: `tests/command-behavior.test.ts`, `tests/multi-instance.test.ts`, `tests/fixtures/model-profile-instance.ts`, `TESTING.md`. Include W1 undo/recovery reload-failure notice coverage if feasible; no production edits.

## Progress and evidence
Read-only repository and installed-runtime API maps completed. Pi appendEntry/getBranch supports branch-bound snapshot storage, but installed Gentle child/reviewer consumers resolve routing internally with no verified public integration seam. W3 and dependent W4/W5 routing work cannot truthfully complete in this repository alone. Do not modify installed packages or store unused snapshots advertised as isolation. W1 writer and independent verifier finished; W2 baseline harness remains achievable. Existing executive summary is untracked user-requested documentation; preserve it. No active runtime/config writes performed.
W1 writer returned: four allowed files, 139 additions/25 deletions. Observed writer RED: 20 pass/4 fail; final focused GREEN: 25/25; final npm test: 97/97 (earlier compatibility failures corrected); git diff --check passed. Native ASSESS was unassessable because untracked documents need explicit declaration; returned high-risk fallback requiring an independent verifier. Independent verification PASS: focus 25/25, full 97/97, diff check clean; no blocker. Low non-blocking gap: undo/recovery reload-failure notice assertions. Parent spot-read status code confirmed shared/live separation. RDD mode explicitly read off; no native review started. W1 verified. No real concurrent runtime exercise yet. Work-unit commit IDs: none; commits require explicit user request.

W2 incident: worker exited without final report. Parent observed new `tests/multi-instance.test.ts`, `tests/fixtures/model-profile-instance.ts`, and additional command test edits; TESTING.md unchanged. No success/RED/runtime claim inferred. First recovery verifier failed after four turns with zero tool calls, providing no new test evidence. The narrowed continuation also failed after four turns with zero tool calls. Neither verifier attempt ran any check. Tool discovery found no native Agent fallback. Stop retries and source writes; resume when the configured verifier runtime/model works. Do not run verification inline to bypass mandatory routing.

W2 resumed verifier observed: multi-instance 4/4, command suite 27/27, npm test 103/103, diff check clean. Review identified partial-start process leakage, unbounded EOF close, and unremoved temporary roots. W2 remains partial pending repair plus documentation and post-repair verification. Documentation-only worker finished TESTING.md and executive summary; structural readback and diff check passed. A single W2 lifecycle-repair writer now owns test fixture/scenarios and corresponding doc caveats. Tests must prove partial-start cleanup, bounded readiness/request/shutdown, spawn errors, and removal of only newly owned roots. Tracker updates were parent-owned.

W2 lifecycle writer reported RED (4 pass/5 fail/1 timeout; intermediate 8 pass/3 fail) then GREEN 15/15 harness,27/27 command,114/114 full,diff clean. Fixes partial startup, spawn/exit handling, bounded requests/shutdown, FIFO invalidation and exact owned-root cleanup; docs updated. ASSESS again unassessable due untracked declarations; independent final verifier now runs. Scripted pipe signal tests do not prove actual OS force kill or real Gentle routing.

Final W2 independent PASS observed:15/15 harness,27/27 command,114/114 full, diff check clean; no material blocker, expected worktree status only. Parent spot-read confirms each started handle registered inside cleanup boundary. Executive summary updated to final disposition. No installed-runtime, OS force-kill or isolation guarantee.

## Next step
W1/W2 complete and verified; W3-W5 remain upstream-blocked. User separately authorized live-Pi-model profile TUI and project documentation; read-only scout active for new bounded feature. Update doc disposition to observed result and report W3-W5 upstream blockers honestly. Close all feasible repository work and clearly report upstream-blocked integration rather than claiming isolation. Preserve current changes; do not clean up or install unverified artifacts. Do not infer installed Gentle routing behavior from mocked consumers. W3 needs upstream consumer support or separately authorized upstream source integration; no installed-package patches. Complete and verify achievable waves individually, surface the dependency before expanding repositories, and do not claim all improvements complete.

## Commit evidence
- Work-unit commit: `a8a5a3e98ba133da86f639705e87f534a147b015`.
- Boundary: Integrated shared-scope/editor/Balance implementation, tests and guides.
- Fresh precommit full-tree verification: `npm test` 198/198; diff, untracked JSON and whitespace checks pass. Intermediate commit snapshots were not independently tested.
- User accepted the integrated 2,499-line size exception and two implementation commits; no push. RDD off; live provider checks remain unverified.
