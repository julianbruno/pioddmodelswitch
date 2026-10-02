# OpenAI Luna authenticated routing

## Objective
Fix the active openai6-1-gentle profile's five unauthenticated Codex Luna assignments using locally advertised openai/gpt-6-luna. Preserve 21 Sol routes, all efforts (including archive max), defaults and unrelated settings. This supersedes prior Luna-provider preservation only; earlier completed history remains intact.

## Tasks
- [x] F1 (verified; commit pending authorization): Update five profile routes, regression test and user-facing documentation; observe RED then GREEN and full suite. Allowed repository surfaces: config/models.openai6-1-gentle.json, tests/manifest-validation.test.ts, README.md.
- [x] F2: Installed named profile synchronized with backup. Active canonical/runtime switched to Claude Opus 5.5 during work; guard refused their update before replacement. Preserve user's current active selection rather than overwrite it.
- [x] F3 (verified; commit pending authorization): Independently verify repository and installed alignment, report session/live invocation limitations. Commit pending explicit authorization; no push.

## Evidence
Read-only worker confirmed openai/gpt-6-luna locally supports high and max. At initial exploration, installed named, canonical and runtime copies retained five Codex Luna routes. Final independent verification: named profile matches corrected repository bytes; canonical and runtime consistently use Claude Opus 5.5, preserving the changed active selection. Registry metadata is not evidence of remote execution. No credentials will be changed.

## Next step
Independent verification passed: npm test 67/67, git diff --check HEAD clean; exactly five provider changes, all efforts and 21 Sol routes preserved; installed named profile byte-equal; backup byte-equal to previous HEAD; active Claude routing consistent; no active journal, lock or diagnostics. RED 14/15 passing, GREEN 15/15, doctor 16/16, full suite 67/67 reported by writer. Parent diff readback confirms five provider-only substitutions and clean whitespace. Native assessment unassessable due to untracked task document, so separate verifier required. Engram mirror pending: session has already ended. No commit authorized. Live OpenAI execution not tested.
