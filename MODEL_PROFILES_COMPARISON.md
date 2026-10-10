# Model profile comparison

Choose by configured role allocation, not by the profile name. This snapshot compares all **27 registrations in manifest order**, including all **13 managed roles** per profile. The overview shows the Pi orchestrator assignment that selection would apply; it does not report the current live session. The default registration is **openaigentle**.

## Choose or inspect

- `/jb-odd-models list` now opens a selectable activation picker when UI selection is supported. Choosing an option immediately activates its effective `orchestrator` model and thinking, corresponding to Pi's current `/model`; it does not select a reviewer model. Without UI/select support, the list is textual and read-only. Cancel changes nothing.
- Use `/jb-odd-models preview <profile>` for read-only inspection, not the picker. Activation changes shared persisted configuration and aligns only the invoking live session; other sessions are not broadcast updates.
- See [command usage](USAGE.md) for validation, rollback, reload and availability behavior. Pi's built-in `/model` remains unchanged; no `/list` command is added.

## Reading the tables

Each value is **model alias / exact thinking string**. Aliases preserve provider identity; Codex and OpenAI routes are not interchangeable. Groups combine roles only when both model and thinking are identical.

| Role shorthand | Exact managed role |
|---|---|
| E | `gentle-ai-explore` |
| W | `gentle-ai-worker` |
| V | `gentle-ai-verify` |
| O | `orchestrator` |
| F | `jd-fix-agent` |
| Risk | `review-risk` |
| Resilience | `review-resilience` |
| Readability | `review-readability` |
| Reliability | `review-reliability` |
| Refuter | `review-refuter` |
| Validator | `review-validator` |
| A | `jd-judge-a` |
| B | `jd-judge-b` |

### Model alias legend

| Alias | Exact provider/model ID |
|---|---|
| C56S | `openai-codex/gpt-5.6-sol` |
| C56T | `openai-codex/gpt-5.6-terra` |
| C6L | `openai-codex/gpt-6-luna` |
| C6S | `openai-codex/gpt-6-sol` |
| O6L | `openai/gpt-6-luna` |
| O61S | `openai/gpt-6.1-sol` |
| G46 | `xai/grok-4.6` |
| G47 | `xai/grok-4.7` |
| G43 | `xai/grok-4.3` |
| C55 | `openai-codex/gpt-5.5` |
| CA | `openai-codex/gpt-6-astra` |
| Opus | `claude-bridge/claude-opus-5-5` |
| Sonnet | `claude-bridge/claude-sonnet-5` |
| Fable | `claude-bridge/claude-fable-5-1` |

## Overview

ODD allocation summarizes E, W, V and F; O is in the separate orchestrator column. “Self” means the selected profile's raw review/judge entries remain effective, not necessarily a single provider.

| Profile | Pi orchestrator model / thinking | ODD allocation | Effective review source |
|---|---|---|---|
| [openai](config/models.openai.json) | C56S / medium | E, V: **C56S / medium**<br>W, F: **C56T / high** | grok |
| [openaigentle](config/models.openaigentle.json) | C6S / medium | E: **C6L / high**<br>W, F: **C6S / low**<br>V: **C6S / high** | Self |
| [openai6-1-gentle](config/models.openai6-1-gentle.json) | O61S / medium | E: **O6L / high**<br>W, F: **O61S / low**<br>V: **O61S / high** | Self |
| [grok](config/models.grok.json) | G46 / medium | E, V: **G46 / medium**<br>W, F: **G46 / high** | openai |
| [grok-4-7](config/models.grok-4-7.json) | G47 / medium | E, V: **G47 / medium**<br>W, F: **G47 / high** | Self |
| [gpt-5.5-powerful](config/models.gpt-5.5-powerful.json) | C55 / medium | E, V: **C55 / xhigh**<br>W, F: **C55 / high** | Self |
| [gpt-5.6-low-cost](config/models.gpt-5.6-low-cost.json) | C56T / medium | E, V: **C56S / medium**<br>W, F: **C56T / medium** | grok-low-cost |
| [gpt-5.6-recommended](config/models.gpt-5.6-recommended.json) | C56S / medium | E, V: **C56S / medium**<br>W, F: **C56T / high** | grok-recommended |
| [gpt-5.6-powerful](config/models.gpt-5.6-powerful.json) | C56S / medium | E, V: **C56S / xhigh**<br>W, F: **C56S / high** | grok-powerful |
| [gpt-astra-low-cost](config/models.gpt-astra-low-cost.json) | C56T / medium | E, V: **CA / medium**<br>W, F: **C56T / medium** | grok-low-cost |
| [gpt-astra-recommended](config/models.gpt-astra-recommended.json) | CA / medium | E, V: **CA / medium**<br>W, F: **C56T / high** | grok-recommended |
| [gpt-astra-powerful](config/models.gpt-astra-powerful.json) | CA / medium | E, V: **CA / xhigh**<br>W, F: **CA / high** | grok-powerful |
| [grok-low-cost](config/models.grok-low-cost.json) | G43 / medium | E, V: **G46 / medium**<br>W, F: **G43 / medium** | gpt-5.6-low-cost |
| [grok-recommended](config/models.grok-recommended.json) | G46 / medium | E, V: **G46 / medium**<br>W, F: **G46 / high** | gpt-5.6-recommended |
| [grok-powerful](config/models.grok-powerful.json) | G46 / medium | E, V: **G46 / xhigh**<br>W, F: **G46 / high** | gpt-5.6-powerful |
| [gpt-astra-only-low-cost](config/models.gpt-astra-only-low-cost.json) | CA / low | E, W, V, F: **CA / low** | grok-low-cost |
| [gpt-astra-only-recommended](config/models.gpt-astra-only-recommended.json) | CA / low | E, W, V, F: **CA / low** | grok-recommended |
| [gpt-astra-only-powerful](config/models.gpt-astra-only-powerful.json) | CA / low | E, V: **CA / high**<br>W, F: **CA / medium** | grok-powerful |
| [claude-opus-5.5](config/models.claude-opus-5.5.json) | Opus / medium | E, W, F: **Opus / medium**<br>V: **Opus / high** | Self |
| [claude-sep](config/models.claude-sep.json) | Opus / medium | E, W, F: **Sonnet / high**<br>V: **Opus / high** | Self |
| [openai-sep](config/models.openai-sep.json) | C6S / medium | E: **C6L / high**<br>W, F: **C6S / medium**<br>V: **C6S / high** | Self |
| [gpt-6-1-lowcost](config/models.gpt-6-1-lowcost.json) | O6L / medium | E, W, F: **O6L / medium**<br>V: **O61S / medium** | Self |
| [gpt-6-1-recommended](config/models.gpt-6-1-recommended.json) | O61S / medium | E: **O6L / medium**<br>W, F: **O6L / high**<br>V: **O61S / medium** | Self |
| [gpt-6-1-powerful](config/models.gpt-6-1-powerful.json) | O61S / medium | E: **O6L / high**<br>W, F: **O61S / high**<br>V: **O61S / xhigh** | Self |
| [fable5.1](config/models.fable5.1.json) | Fable / medium | E, W, F: **Fable / medium**<br>V: **Fable / high** | Self |
| [open6.1revoopus5.5](config/models.open6.1revoopus5.5.json) | O61S / medium | E: **O6L / high**<br>W, F: **O61S / low**<br>V: **O61S / high** | Self |
| [opus5.5revgpt6.1](config/models.opus5.5revgpt6.1.json) | Opus / medium | E, W, F: **Opus / medium**<br>V: **Opus / high** | Self |

## Detailed ODD assignments

These five roles remain from the selected profile even when its reviews are paired. F is always explicit, including when it shares W's assignment. Together with the eight review/judge roles below, each row reconstructs all 13 effective assignments.

| Profile | Exact grouped ODD assignments (E, W, V, O, F) |
|---|---|
| openai | E, V, O: **C56S / medium**<br>W, F: **C56T / high** |
| openaigentle | E: **C6L / high**<br>W, F: **C6S / low**<br>V: **C6S / high**<br>O: **C6S / medium** |
| openai6-1-gentle | E: **O6L / high**<br>W, F: **O61S / low**<br>V: **O61S / high**<br>O: **O61S / medium** |
| grok | E, V, O: **G46 / medium**<br>W, F: **G46 / high** |
| grok-4-7 | E, V, O: **G47 / medium**<br>W, F: **G47 / high** |
| gpt-5.5-powerful | E, V: **C55 / xhigh**<br>W, F: **C55 / high**<br>O: **C55 / medium** |
| gpt-5.6-low-cost | E, V: **C56S / medium**<br>W, O, F: **C56T / medium** |
| gpt-5.6-recommended | E, V, O: **C56S / medium**<br>W, F: **C56T / high** |
| gpt-5.6-powerful | E, V: **C56S / xhigh**<br>W, F: **C56S / high**<br>O: **C56S / medium** |
| gpt-astra-low-cost | E, V: **CA / medium**<br>W, O, F: **C56T / medium** |
| gpt-astra-recommended | E, V, O: **CA / medium**<br>W, F: **C56T / high** |
| gpt-astra-powerful | E, V: **CA / xhigh**<br>W, F: **CA / high**<br>O: **CA / medium** |
| grok-low-cost | E, V: **G46 / medium**<br>W, O, F: **G43 / medium** |
| grok-recommended | E, V, O: **G46 / medium**<br>W, F: **G46 / high** |
| grok-powerful | E, V: **G46 / xhigh**<br>W, F: **G46 / high**<br>O: **G46 / medium** |
| gpt-astra-only-low-cost | E, W, V, O, F: **CA / low** |
| gpt-astra-only-recommended | E, W, V, O, F: **CA / low** |
| gpt-astra-only-powerful | E, V: **CA / high**<br>W, F: **CA / medium**<br>O: **CA / low** |
| claude-opus-5.5 | E, W, O, F: **Opus / medium**<br>V: **Opus / high** |
| claude-sep | E, W, F: **Sonnet / high**<br>V: **Opus / high**<br>O: **Opus / medium** |
| openai-sep | E: **C6L / high**<br>W, O, F: **C6S / medium**<br>V: **C6S / high** |
| gpt-6-1-lowcost | E, W, O, F: **O6L / medium**<br>V: **O61S / medium** |
| gpt-6-1-recommended | E: **O6L / medium**<br>W, F: **O6L / high**<br>V, O: **O61S / medium** |
| gpt-6-1-powerful | E: **O6L / high**<br>W, F: **O61S / high**<br>V: **O61S / xhigh**<br>O: **O61S / medium** |
| fable5.1 | E, W, O, F: **Fable / medium**<br>V: **Fable / high** |
| open6.1revoopus5.5 | E: **O6L / high**<br>W, F: **O61S / low**<br>V: **O61S / high**<br>O: **O61S / medium** |
| opus5.5revgpt6.1 | E, W, O, F: **Opus / medium**<br>V: **Opus / high** |

## Raw versus effective reviews and judges

“Raw” comes from the selected profile JSON. “Effective” is the result of `deriveCanonicalProfileForSelection`, after validating the manifest and complete profile set. All six reviews and both JD judges are shown; A and B never stand for review roles. “Same as raw” means all eight model/thinking entries match exactly.

| Profile | Raw assignments | Effective assignments |
|---|---|---|
| openai | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| openaigentle | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C6S / high** | Same as raw |
| openai6-1-gentle | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **O61S / high** | Same as raw |
| grok | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / medium** |
| grok-4-7 | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G47 / medium** | Same as raw |
| gpt-5.5-powerful | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C55 / xhigh** | Same as raw |
| gpt-5.6-low-cost | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| gpt-5.6-recommended | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| gpt-5.6-powerful | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / xhigh** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / xhigh** |
| gpt-astra-low-cost | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **CA / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| gpt-astra-recommended | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **CA / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| gpt-astra-powerful | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **CA / xhigh** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / xhigh** |
| grok-low-cost | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / medium** |
| grok-recommended | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / medium** |
| grok-powerful | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / xhigh** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C56S / xhigh** |
| gpt-astra-only-low-cost | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **CA / low** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| gpt-astra-only-recommended | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **CA / low** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / medium** |
| gpt-astra-only-powerful | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **CA / high** | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **G46 / xhigh** |
| claude-opus-5.5 | Risk, Resilience, Reliability, Refuter, Validator, A, B: **Opus / high**<br>Readability: **Opus / medium** | Same as raw |
| claude-sep | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **Opus / high** | Same as raw |
| openai-sep | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **C6S / high** | Same as raw |
| gpt-6-1-lowcost | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **O61S / medium** | Same as raw |
| gpt-6-1-recommended | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **O61S / medium** | Same as raw |
| gpt-6-1-powerful | Risk, Resilience, Readability, Reliability, Refuter, Validator, A, B: **O61S / xhigh** | Same as raw |
| fable5.1 | Risk, Resilience, Reliability, Refuter, Validator, A, B: **Fable / high**<br>Readability: **Fable / medium** | Same as raw |
| open6.1revoopus5.5 | Risk, Reliability, Validator, A: **O61S / high**<br>Resilience, Readability, Refuter, B: **Opus / high** | Same as raw |
| opus5.5revgpt6.1 | Risk, Resilience, Reliability, Refuter, Validator, A: **Opus / high**<br>Readability: **Opus / medium**<br>B: **O61S / high** | Same as raw |

### Exact directed review-source mapping

The manifest enables opposite-provider judges for the eight review/judge roles above. These are **14 directed entries**, not seven reciprocal pairs: the Astra families point to Grok lanes, but those Grok lanes point back to GPT-5.6, not Astra. Every profile absent from this table retains its own raw review/judge entries. Neither ODD roles nor jd-fix-agent are replaced.

| Selected profile → | Review/judge source profile |
|---|---|
| gpt-5.6-low-cost | grok-low-cost |
| gpt-5.6-recommended | grok-recommended |
| gpt-5.6-powerful | grok-powerful |
| gpt-astra-low-cost | grok-low-cost |
| gpt-astra-recommended | grok-recommended |
| gpt-astra-powerful | grok-powerful |
| gpt-astra-only-low-cost | grok-low-cost |
| gpt-astra-only-recommended | grok-recommended |
| gpt-astra-only-powerful | grok-powerful |
| grok-low-cost | gpt-5.6-low-cost |
| grok-recommended | gpt-5.6-recommended |
| grok-powerful | gpt-5.6-powerful |
| openai | grok |
| grok | openai |

## Important distinctions

- **fable5.1:** all 13 roles use Fable. It copies the Opus profile's thinking pattern: E/W/O/F and Readability medium; V, the other five reviews and both judges high. It is unpaired.
- **open6.1revoopus5.5:** ODD retains the OpenAI 6.1 gentle allocation (E O6L high, W/F O61S low, V O61S high, O O61S medium). The six reviews split **3/3**: Risk/Reliability/Validator use O61S high; Resilience/Readability/Refuter use Opus high. JD A uses O61S high and JD B Opus high. This explicit mixed definition is unpaired and is not an all-Opus review profile.
- **opus5.5revgpt6.1:** retains the Opus ODD allocation and all six Opus reviews, including **Readability medium**. Only **jd-judge-b** changes to O61S high; jd-judge-a stays Opus high. It is unpaired.
- **Astra-only:** “only” describes raw definitions, not effective paired reviews. All three orchestrators use CA low; their effective reviews come from the directed Grok lanes above.
- **Provider route matters:** openaigentle/openai-sep use openai-codex; openai6-1-gentle and GPT-6.1 lanes use openai. openai-sep raises W/F from the gentle Codex profile's low to medium. claude-sep uses Sonnet high for E/W/F, Opus high for V and all reviews/judges, and Opus medium for O.

## Evidence boundary and sources

This is **static repository configuration**, not installed-home state or a live provider check. Profiles were validated with `validateManifest` and `validateProfileSet`; every effective row was derived with the existing `deriveCanonicalProfileForSelection`, not an independent pairing approximation. Canonical `thinking` is copied to runtime `effort`.

- [Manifest](config/model-profiles.manifest.json): registration order, default, managed roles and directed pairing.
- [Core validation and derivation](extensions/model-profiles/core.ts): effective assignment semantics.
- [Profile definitions](config/): each overview profile name links directly to its exact JSON.
- [Usage](USAGE.md): selectable list, read-only preview, activation and diagnostic boundaries.

No installation, home inspection, activation, model registry query, authentication check or provider call was performed for this comparison. Installed definitions, project overrides and live availability may differ. These configured strings do not establish model quality, latency, cost, account entitlement or per-provider thinking support (especially extended levels such as xhigh). Names such as lowcost, low-cost, recommended and powerful are labels, **not empirical cost/performance results or a ranking**. Use read-only preview and doctor in the intended installation before choosing; doctor itself does not prove remote execution.
