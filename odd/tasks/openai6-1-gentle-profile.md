# openai6-1-gentle profile

Objective: Add an installable `openai6-1-gentle` standalone profile cloned from `openaigentle`, replacing `gpt-6` model identifiers with `gpt-6-1`, without changing the default or unrelated profiles.

Why: The user wants to select the corresponding GPT-6.1 mapping while retaining the current role/effort layout.

Scope: Register the profile, cover mapping and selection in tests, document its availability, install into the local Pi home, and commit the complete work unit. Provider availability of `gpt-6-1-sol`/`gpt-6-1-luna` is outside repository validation. Do not change package version, default profile, or judge pairing.

TDD: No explicit project/session TDD setting was found; mode unknown, so use ordinary focused and full functional checks (runner: `node --experimental-strip-types --test tests/*.test.ts`).

Delivery: `ask-on-risk`; forecast under 400 authored changed lines; two work-unit commits on `feat/openai6-1-gentle-profile` (profile behavior and installation record). RDD is off.

## Tasks

- [x] P1: Add the standalone profile, manifest registration, regression test, and concise profile documentation. Route: delegated writer (multiple non-trivial files). Check: focused manifest tests 15/15; independent full suite 67/67, shell syntax and diff check passed; exact 26-agent mapping checked. Commit: `67f051e` (`feat(profiles): add openai6-1-gentle mapping`).
- [x] P2: Install locally and verify installed profile presence. Route: bounded install, independent delegated verifier. Check: `./install/install.sh` succeeded, both installed profile and manifest are byte-identical to repository sources (`cmp`); `git diff --check` passed. Pi slash-command `list` was unavailable in the shell, so interactive visibility remains pending. Commit: documentation work unit `docs(odd): record openai6-1-gentle installation` (the commit introducing this document).

## Progress

- Exploration: manifest drives installer discovery; `openaigentle` is the current default and the new profile must remain unpaired. Local Pi agent directory exists.
- Current: P1 and P2 complete. Native assessment was unassessable due to untracked files; independent verifier passed. Installer backed up changed targets under `/home/julian/.pi/backups/jb-sdd-odd-models-2026-10-01T02-01-27-744Z-2700878`. Installed default remains `openaigentle`; no profile switch requested.

## Next step

Restart Pi, inspect `/jb-sdd-odd-models list`, and select `/jb-sdd-odd-models openai6-1-gentle` if the provider supports both model IDs.
