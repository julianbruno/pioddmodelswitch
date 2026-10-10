# Switch ODD model profiles safely

This portable package installs the `/jb-odd-models` Pi command, helper modules, and a versioned model-profile manifest for the orchestrator, core ODD generic agents, and review/judge agents. The manifest is the source of truth: it defines the managed agent groups, optional opposite-provider judge routing, registered profile files, reserved command names, and default profile.

The installer keeps the currently active registered profile (or uses the default profile on a fresh install), preserves unrelated configuration, and backs up every existing file it changes. Upgrading from the previous `/jb-sdd-odd-models` package is covered in [Installation and recovery](HOW_TO_INSTALL.md#upgrade-from-the-previous-command).

## Quick start

Prerequisites: Gentle Pi, Node.js 22.19.0 or newer for the installer, and Pi provider authentication for the models you plan to use.

```sh
cd pissdmodelswitch
./install/install.sh
# Restart Pi, then run:
/jb-odd-models status
/jb-odd-models doctor
```

For a non-default Pi home:

```sh
PI_HOME=/path/to/pi-home ./install/install.sh
PI_HOME=/path/to/pi-home pi
```

`PI_HOME` must also be present when Pi runs so the extension reads the same files the installer wrote.

## Documentation

- [Quick installation](INSTALLATION.md)
- [Installation and recovery](HOW_TO_INSTALL.md)
- [Programmatic testing](TESTING.md)
- [Command usage](USAGE.md) — `/jb-odd-models edit` views, edits, or creates named profiles from all auth-available models in the invoking Pi registry; no exported catalog is required. Saving does not activate the profile. Optional **Balance** asks the current Pi model once, after consent and with possible provider cost, for an advisory new profile; some current models, including Codex, are refused. See [Balance](USAGE.md#balance-a-profile-with-the-current-model).
- [How switching works](MODEL_SWITCHING.md) — direct selection also aligns the current Pi session's orchestrator model and thinking (1.4.0).
- [Architecture and limitations](ARCHITECTURE.md)
- [Provenance caveat](NOTICE.md)

## Scope

The command manages every agent named in `config/model-profiles.manifest.json`. The current manifest covers `orchestrator`, ODD generic agents (`gentle-ai-explore`, `gentle-ai-worker`, `gentle-ai-verify`, and `jd-fix-agent`), review support agents (`review-refuter` and `review-validator`), and configured judge/reviewer agents (`review-risk`, `review-resilience`, `review-readability`, `review-reliability`, `jd-judge-a`, and `jd-judge-b`).

Version 1.3 registers every named profile from `config/named-profiles.json`: GPT-5.5 Powerful, GPT-5.6, GPT Astra, GPT Astra-only, and Grok low-cost/recommended/powerful variants, plus standalone `claude-opus-5.5` from `config/models.claude-opus-5.5.json`. Standalone `claude-sep` and `openai-sep` are also registered. The default profile is `openaigentle`, using GPT-6 Sol/Luna; legacy `openai` and `grok` aliases remain registered for compatibility. Standalone `openai6-1-gentle` preserves that role/effort layout, using `openai/gpt-6.1-sol` for its 12 Sol assignments and `openai/gpt-6-luna` for its single Luna assignment (`gentle-ai-explore` at high effort). Select it with `/jb-odd-models openai6-1-gentle` after confirming those models are available through your Pi provider. It is unpaired, so its judges and reviewers retain their profile-specific Sol or Luna assignments.

For paired profiles, judge/reviewer agents use an opposite-provider profile in the same cost lane: GPT-family profiles route judges to the matching Grok lane, and Grok profiles route judges to the matching GPT-5.6 lane. Legacy `openai` still pairs with `grok`, and `grok` still pairs with `openai`. Unpaired profiles, including `openaigentle`, `gpt-5.5-powerful`, and `claude-opus-5.5`, retain their own judge mappings; `gpt-5.5-powerful` uses `openai-codex/gpt-5.5` for every agent. `claude-opus-5.5` uses `claude-bridge/claude-opus-5-5` for every agent, with task-aware medium effort for orchestration, exploration, implementation, and readability, and high effort for verification and risk-focused review. `jd-fix-agent` follows the implementation worker in every profile. `claude-sep` inherits the Opus profile but routes exploration and implementation (`gentle-ai-explore`, `gentle-ai-worker`, `jd-fix-agent`) to `claude-bridge/claude-sonnet-5` at high effort, and overrides inherited `review-readability` to `claude-bridge/claude-opus-5-5` at high effort. `openai-sep` inherits `openaigentle` but routes `gentle-ai-worker` and `jd-fix-agent` to `openai-codex/gpt-6-sol` at medium effort. Both stay unpaired, retaining their own judges and reviewers. Select them with `/jb-odd-models claude-sep` or `/jb-odd-models openai-sep`. Manifests without configured judge agents keep the previous uniform-profile behavior.

### GPT-6.1 lanes

Three standalone, unpaired profiles route every ODD role explicitly with `openai/gpt-6.1-sol` (Sol) and `openai/gpt-6-luna` (Luna). There is no GPT-6.1 Luna; the Luna route is the GPT-6 model also used by `openai6-1-gentle`. `gpt-6-1-powerful` uses Sol 6.1 where Astra 6.1 was requested, because Astra 6.1 is unavailable.

| Profile | Orchestrator | Reasoning | Code | Light |
|---|---|---|---|---|
| `gpt-6-1-lowcost` | Luna medium | Sol medium | Luna medium | Luna medium |
| `gpt-6-1-recommended` | Sol medium | Sol medium | Luna high | Luna medium |
| `gpt-6-1-powerful` | Sol medium | Sol xhigh | Sol high | Luna high |

| Role | Agents |
|---|---|
| Orchestrator | `orchestrator` |
| Reasoning | `gentle-ai-verify`, `review-risk`, `review-resilience`, `review-readability`, `review-reliability`, `review-refuter`, `review-validator`, `jd-judge-a`, `jd-judge-b` |
| Code | `gentle-ai-worker`, `jd-fix-agent` |
| Light | `gentle-ai-explore` |

These profiles are not in `config/named-profiles.json` and have no opposite-provider pair, so judges and reviewers keep the reasoning route above. Select one with `/jb-odd-models gpt-6-1-recommended` (or `gpt-6-1-lowcost` / `gpt-6-1-powerful`) after confirming both models are available through your Pi provider. The default profile stays `openaigentle`.

It writes only the managed keys in the installed canonical and runtime mappings. Unrelated top-level JSON keys and unrelated `model_profiles` entries are preserved and reported by `doctor` rather than treated as errors.
