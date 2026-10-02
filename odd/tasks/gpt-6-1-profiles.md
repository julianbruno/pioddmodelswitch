# GPT-6-1 selectable profiles

## Objective
Create gpt-6-1-lowcost, gpt-6-1-recommended and gpt-6-1-powerful selectable ODD-only profiles, document real role routing and install preserving active selection.

## Confirmed decisions
User chose reuse IDs in openai6-1-gentle: openai/gpt-6-luna and openai/gpt-6.1-sol. Explicitly chose Sol 6.1 instead of unavailable Astra 6.1 for Powerful. Light controls gentle-ai-explore. Reasoning controls gentle-ai-verify and all eight reviewers/judges; code controls gentle-ai-worker and jd-fix-agent; orchestrator controls itself. Unpaired entries preserve intended reasoning models; default/other profiles unchanged.

|Profile|Orchestrator|Reasoning|Code|Light|
|---|---|---|---|---|
|gpt-6-1-lowcost|Luna medium|Sol medium|Luna medium|Luna medium|
|gpt-6-1-recommended|Sol medium|Sol medium|Luna high|Luna medium|
|gpt-6-1-powerful|Sol medium|Sol xhigh|Sol high|Luna high|

## Tasks
- [x] G1 (writer verified; commit pending checks): Register 3 standalone explicit 13-route profiles; regression RED/GREEN, mapping/default/pair preservation and docs. No metadata-only light claims.
- [x] G2 (independently verified): Assess and independently verify as required; full suite, diff check, exact routing, catalog-supported efforts.
- [x] G3 (installed and verified; final commit next): Install into ~/.pi using verified installer preserving active profile; verify installed profiles and registration; record commit after checks. No push.

## Evidence
Previous branch integrated into local main by authorized fast-forward to 5be1872; feature/6.1Sep created from it. No remote writes. Catalog contains selected OpenAI Sol/Luna IDs and requested efforts; no Astra substituted without user decision. Existing switcher ODD-only, jb-odd-models installed.

## Next step
Writer completed 3 explicit 13-route profiles, appended registrations, exact mapping regressions and docs. RED 14 pass/2 fail; GREEN manifest 16/16, manifest+ODD 18/18, full suite 74/74. Other profiles/default/pairs unchanged. Parent Powerful spot readback and diff check clean. Native assessment unassessable due untracked files; independent verifier required. Independent verification passed: npm test exit 0, 74/74; exact 13 routes in all three profiles; existing 20 profiles/default/pairs unchanged; actual local IDs and medium/high/xhigh supported. Installed current selection is uniquely claude-opus-5.5; no transaction active/lock; safe installer preconditions confirmed. Installation succeeded with backup /home/julian/.pi/backups/jb-odd-models-2026-10-02T01-43-54-771Z-436666; claude-opus-5.5 preserved. Parent installed readback: three profile files and manifest byte-equal; active canonical matches Claude profile; installed command harness lists all three names. Final parent manifest spot check 16/16 passed. User explicitly authorized final commit. Live provider requests and real-session profile selection not executed. No push. Engram mirror pending; previous saves fail session has already ended.
