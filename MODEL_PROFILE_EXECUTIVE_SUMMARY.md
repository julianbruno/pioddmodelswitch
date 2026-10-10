# Model profile scope: current state and improvement options

## Executive conclusion

`/jb-odd-models <profile>` changes **shared model-routing configuration** and updates the **invoking Pi session**. It is not a session-isolated profile selector. Other Pi instances sharing the same `PI_HOME` can observe the saved routing, but the command does not broadcast a reload or replace their live conversation model.

**Delivery state:** W1 scope/status notices are implemented and independently verified. W2 subprocess harness lifecycle repairs are implemented, but acceptance remains partial pending independent verification of the final artifacts. W3–W5 are blocked on a supported installed Gentle integration contract for both child and reviewer routing. No session isolation is implemented.

**Recommendation:** retain the explicit shared-scope behavior while establishing upstream consumer support. Do not add automatic cross-terminal model switching or store an unused snapshot as a substitute for isolation.

## Current behavior

| Area | Confirmed behavior |
|---|---|
| Command without a profile | Shows status/help; does not switch profiles. |
| Named profile selection | Validates the profile and aligns the invoking session's orchestrator model and thinking level. |
| Persisted routing | Writes managed mappings to `$PI_HOME/gentle-ai/models.json` and `$PI_HOME/agent/subagents.json`. Default `PI_HOME`: `~/.pi`. |
| Reload | Calls `ctx.reload()` only in the instance executing the command, when profile files changed. |
| Other open conversations | No explicit cross-instance model-change or reload broadcast is implemented by this command. |
| Future subagent launches | May observe shared routing; exact refresh timing across all running-instance paths has not been live-tested. |
| Running subagents | A saved routing change does not replace the model of a child already executing. |
| Project configuration | Project-agent routing can use `<cwd>/.pi/subagents.json`, so effective routing can differ from shared user-agent routing. |
| Different `PI_HOME` roots | This command targets different profile/runtime files; this alone is not proof that every upstream configuration surface is isolated. |
| Reload failure | Persisted files and the invoking session remain active; the command requests manual `/reload` or restart. |

### Example: two terminals

1. Terminals A and B share the same `PI_HOME`.
2. A executes `/jb-odd-models <profile>`.
3. A changes its live orchestrator and shared routing files, then reloads when needed.
4. B does not receive an explicit live-model change or reload from this command.
5. B's later delegated work can resolve the changed shared routing, subject to its effective configuration and refresh path.

**Bottom line:** persisted configuration is shared; live conversation state is local. A shared-file update is not an atomic synchronization of all terminals.

## Operational risks

- **Cross-session interference:** changing a shared profile can influence another session's future delegated work.
- **Mixed effective state:** a terminal can retain its current orchestrator while subsequent children use a different shared routing.
- **Scope ambiguity:** the user may reasonably interpret a terminal command as local when its persisted effect is global.
- **Refresh uncertainty:** a successful switch in one terminal does not establish when every other instance adopts the files.
- **Recovery visibility:** a failed reload does not mean the persisted switch was rolled back.

## Improvement options

| Priority | Improvement | Benefit and tradeoff |
|---|---|---|
| 1 | Explicit scope and consequence notices | Low-cost clarification: show “shared configuration changed; only this instance reloaded.” Does not provide isolation. |
| 1 | Effective-routing status | Display live orchestrator, saved profile, configuration source, project overrides, and detected mismatch separately. Avoid claiming another process has adopted a change. |
| 1 | Controlled two-instance verification | The repository subprocess harness checks shared writes and fake live-state boundaries; installed-consumer exercises are still needed to establish refresh timing and override behavior. |
| 2 | Separate session selection from shared default selection | Make intent explicit through distinct actions. A local action must not call the existing shared-file switch underneath. |
| 2 | Session-bound routing snapshot | Resolve model/effort at selection and have new children inherit the parent's snapshot. Independent sessions stop rewriting each other's routing. Requires integration with launch and review-routing consumers. |
| 2 | Explicit snapshot refresh and persistence | Saved profile edits should not silently change bound sessions. Define reload/reselect, resume, fork, and failure semantics. |
| 3 | Shared-default drift notification | Tell unbound sessions that defaults changed, without silently changing their live orchestrator or interrupting running work. Prefer opt-in follow behavior. |

### Recommended target contract

- **Use in this session:** switch the invoking orchestrator and bind its effective routing snapshot without rewriting shared defaults.
- **Set shared default:** deliberately update shared routing and communicate the cross-session effect.
- **Refresh this session:** explicitly adopt a newer saved profile definition.
- Running and already-queued children retain the routing resolved at launch or queue admission.
- Future children use their parent's effective snapshot when bound.
- Status identifies whether the source is session, clone/project, or shared default.
- Review routing must respect the same boundary; isolating only ordinary subagents is incomplete.

These are proposed semantics, not capabilities verified as implemented in this repository.

### Upstream integration acceptance contract

Before W3–W5 can be accepted, a supported installed-runtime seam must prove that:

- Both ordinary child launches **and reviewer launches** consume the same immutable effective model/effort snapshot; storing an entry without consumers is insufficient.
- Queue admission freezes routing, so already-queued and running work remains stable after profile edits or session refresh.
- Only explicit session refresh/reselection adopts changed saved definitions; session-only selection does not rewrite shared defaults.
- Resume and fork resolve snapshots from the active session branch, preserving the intended inherited state rather than selecting an unrelated latest entry.
- Failed persistence, resolution, or adoption does not adopt an uncorroborated snapshot; status and notices accurately distinguish confirmed state from failure.

Pi branch-entry storage alone does not satisfy this contract. Installed Gentle child/reviewer routing has no verified public snapshot consumer seam in the inspected release. Upstream source integration or a supported release must be separately authorized; installed packages must not be patched here.

## Upstream evidence and dependencies

| Reference | Relevance | Observed state |
|---|---|---|
| [#1240](https://github.com/Gentleman-Programming/gentle-shell/issues/1240) | Reports same-clone concurrent sessions influencing each other's later subagent routing; also identifies review-routing and config-home limitations. | Open |
| [#1064](https://github.com/Gentleman-Programming/gentle-shell/issues/1064) | Tracks session-bound profiles and distinguishes them from shared clone/repository pins. | Open; implementation work is split across PRs. |
| [#1478](https://github.com/Gentleman-Programming/gentle-shell/issues/1478) | Documents orchestrator side effects and requests explicit model/effort selection and a leave-untouched option. | Open |
| [#1826](https://github.com/Gentleman-Programming/gentle-shell/pull/1826) | Adds follow mode, drift notice, and per-target routing infrastructure. | Merged |
| [#1827](https://github.com/Gentleman-Programming/gentle-shell/pull/1827) | Integrates frozen session profiles into launches, status, and Usage. | Open |

States above are a snapshot of the GitHub lookup during this investigation, not a release-availability guarantee. A merged helper PR does not prove end-to-end session isolation is shipped or used by `/jb-odd-models`.

**Integration advice:** evaluate the complete upstream session-profile contract and installed release before building a competing mechanism. This custom command still needs explicit adaptation: upstream work alone does not make a command that writes shared files session-local.

## Verification and limitations

| Wave | Evidence and disposition |
|---|---|
| W1 — scope/status notices | Implemented and independently verified: focused command tests **25/25**, full suite **97/97**, and whitespace check clean **before W2 edits**. These are historical W1 results, not current-tree totals. |
| W2 — two-instance harness | Artifacts: `tests/multi-instance.test.ts` and `tests/fixtures/model-profile-instance.ts`. Parent-reported verifier results: multi-instance **4/4**, command **27/27**, full `npm test` **103/103**, diff check clean. Lifecycle repair adds partial-start cleanup, bounded readiness/requests and graceful/SIGTERM/SIGKILL shutdown, spawn/exit failure handling, idempotent close, and removal of only newly owned temporary homes. Failure transitions use deterministic scripted pipes; normal scenarios and a missing-executable spawn check use real Node processes. Final independent verification **PASS**: multi-instance **15/15**, command **27/27**, full suite **114/114**, and diff check clean. W2 harness acceptance is complete; these repairs do not establish installed-consumer routing. |
| W3–W5 — session binding, lifecycle, reviewer consistency | Blocked by the installed consumer integration seam described above. No unused snapshot was introduced or advertised as isolation. |

The W2 harness uses real Node subprocesses and disposable file IO, but mocked Pi model/thinking/reload APIs. It does not launch installed Pi or Gentle consumers. No real two-terminal consumer timing exercise or active-home configuration change is claimed. See [Testing two-instance scope](TESTING.md#testing-two-instance-scope) for prerequisites, scoped cleanup, and residual cleanup limitations.

Before implementing isolation, verify:

- [ ] A shared switch in A: B's live model remains unchanged; record B's next two child launches and effective sources.
- [ ] Session-only selection in A: shared files remain unchanged and B retains its routing.
- [ ] Project overrides and distinct configuration roots resolve as documented.
- [ ] Running/queued children retain their original routing.
- [ ] Review routing follows the selected scope.
- [ ] Resume, explicit refresh, and failed persistence/reload produce truthful state and notices.

The historical totals above remain attributed prior verification. The lifecycle writer's RED/GREEN evidence belongs to the repair handoff; final independent verification of the repaired artifacts passed as recorded above. Scripted failure injection does not establish real Pi/Gentle routing or OS force-kill behavior.

## Source map

- `USAGE.md:3,9–17`: global scope and command reference.
- `extensions/odd-model-profiles.ts:72–81,119–128`: configuration paths.
- `extensions/odd-model-profiles.ts:535–565,713–773`: shared switch, live model/thinking alignment, and instance-local reload.
- `MODEL_SWITCHING.md`: data flow and reload behavior.
- Installed `gentle-pi/extensions/gentle-ai.ts:2073–2110,2398–2400`: subagent routing and project/user configuration paths inspected by the explorer.

## Next decision

Independently verify the repaired W2 lifecycle and final artifacts. Then obtain a supported upstream child/reviewer snapshot consumer contract before implementing W3–W5. Continuing the authorized waves does not remove that integration dependency; retain truthful shared switching until it is resolved.
