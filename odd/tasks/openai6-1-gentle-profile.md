# openai6-1-gentle profile

Objective: Provide a selectable copy of `openaigentle` that changes only `openai-codex/gpt-6-sol` to the locally registered `openai/gpt-6.1-sol`; preserve all `gpt-6-luna` assignments and thinking levels.

Why: The initial implementation incorrectly renamed both Sol and Luna to hyphenated GPT-6.1 IDs, causing Pi registry failures. The user clarified Sol-only replacement and chose the existing dotted Sol ID.

Scope: Correct the standalone profile, tests, and README; reinstall into local Pi; preserve manifest default, agent roles, and judge pairing. Do not edit the local model registry. TDD mode remains unknown (not enabled); runner: `node --experimental-strip-types --test tests/*.test.ts`. RDD is off. Delivery: `ask-on-risk`, under 400 changed lines.

## Tasks

- [x] P1: Initial profile registration, tests and documentation. Commit: `67f051e` (superseded by C1).
- [x] P2: Initial local installation and evidence. Commit: `7761fd1` (superseded by C1).
- [x] C1: Replace only Sol IDs with registered `gpt-6.1-sol`, restore Luna assignments, update regression test and README, reinstall, verify, and commit. Route: delegated writer for multi-file correction; bounded install and independent verification. Checks: focused tests 15/15 and full tests 67/67; exact 21 Sol/5 Luna mapping comparison; installed profile and manifest byte-identical; `git diff --check` passed; local offline Pi registry lists both IDs. Commit: `fix(profiles): use registered Sol model and retain Luna` (the commit introducing this correction).
- [x] C2: Qualify bare Sol ID as `openai/gpt-6.1-sol` (provider from local Pi registry entry `provider: "openai"`) to satisfy the provider/model rule; Luna unchanged. Checks: `npm test` 67/67 pass; grep shows no bare or Codex-prefixed GPT-6.1 Sol IDs; `git diff --check` clean. Commit: `fix(profiles): use openai provider for GPT-6.1 Sol`.

## Progress

- Prior diagnosis: local Pi registry contains `gpt-6.1-sol`, but no `gpt-6.1-luna`; the previous profile had 21 incorrect Sol and five incorrect Luna entries. User chose registered Sol ID and the Sol-only copy semantics.
- Current: C2 verified in the repository with `openai/gpt-6.1-sol`; not reinstalled into `/home/julian/.pi`. Runtime model invocation not verified.

## Next step

Restart Pi, select `/jb-sdd-odd-models openai6-1-gentle`, and confirm a live model request; neither authentication nor runtime execution was tested.
