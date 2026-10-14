# Example: ODD lanes (Opus, GPT, and Grok)

A working configuration that runs Pi instances at the same time, each with its own ODD profile: opus, gpt, and grok. Setup always creates all three lanes; launch only the ones you need. It was set up with the lane scripts; the opus and gpt lanes were confirmed working on a real machine.

| Lane | Pi home | Launcher | Profile | Credentials the lane needs |
|---|---|---|---|---|
| opus | `~/.pi-opus` | `scripts/pi-opus.sh` | `claude-opus-5.5` | Claude login used by `pi-claude-bridge` |
| gpt | `~/.pi-gpt` | `scripts/pi-gpt.sh` | `openai6-1-gentle` | `openai` in `~/.pi-gpt/agent/auth.json` |
| grok | `~/.pi-grok` | `scripts/pi-grok.sh` | `grok-4-7` | `xai` in `~/.pi-grok/agent/auth.json` |

Setup copies `~/.pi/agent/auth.json` into each lane once. If a lane is missing its provider, log in from inside that lane with `/login`.

For how the lanes work and what they still share, see [Two concurrent ODD lanes](HOW_TO_INSTALL.md#two-concurrent-odd-lanes). For setup, updates, profile alignment, archival, restoration, and permanent removal, see [ODD lane lifecycle](ODD_LANES_LIFECYCLE.md).

## 1. Create the lane homes (once)

```sh
cd ~/miscodigos/pissdmodelswitch
./scripts/setup-odd-lanes.sh
```

Expected output at the end (real output shows absolute paths under your home directory where this example shows `~`):

```text
ODD lanes are ready (no profile activated, Pi not started):
  opus: ~/.pi-opus
  gpt:  ~/.pi-gpt
  grok: ~/.pi-grok

Next steps:
  1. Launch each lane in its own terminal (the launchers also set the Gentle homes):
       ~/miscodigos/pissdmodelswitch/scripts/pi-opus.sh
       ~/miscodigos/pissdmodelswitch/scripts/pi-gpt.sh
       ~/miscodigos/pissdmodelswitch/scripts/pi-grok.sh
  2. Inside the opus instance run:  /jb:odd-models claude-opus-5.5
     Inside the gpt instance run:   /jb:odd-models openai6-1-gentle
     Inside the grok instance run:  /jb:odd-models grok-4-7
```

Re-running setup is safe: it only adds missing files, refreshes the jb-odd-models files in every lane, and never writes into `~/.pi`. A lane that does not exist yet (for example `~/.pi-grok`) is created.

## 2. Check the launcher environment (optional)

```sh
PI_LANE_DRY_RUN=1 ./scripts/pi-opus.sh
```

```text
PI_HOME=~/.pi-opus
PI_CODING_AGENT_DIR=~/.pi-opus/agent
GENTLE_PI_AGENT_HOME=~/.pi-opus/agent
GENTLE_PI_CONFIG_HOME=~/.pi-opus/gentle-ai
```

`scripts/pi-gpt.sh` and `scripts/pi-grok.sh` print the same four lines for `~/.pi-gpt` and `~/.pi-grok`.

## 3. Launch each lane in its own terminal

Launch from the project you want to work on; the launcher keeps the current directory.

```sh
# terminal 1
~/miscodigos/pissdmodelswitch/scripts/pi-opus.sh

# terminal 2
~/miscodigos/pissdmodelswitch/scripts/pi-gpt.sh

# terminal 3 (optional)
~/miscodigos/pissdmodelswitch/scripts/pi-grok.sh
```

Extra Pi flags pass through, for example `./scripts/pi-opus.sh --continue`.

## 4. Select the profile inside each instance (once per lane)

```text
# opus instance
/jb:odd-models claude-opus-5.5

# gpt instance
/jb:odd-models openai6-1-gentle

# grok instance
/jb:odd-models grok-4-7
```

Selecting a profile writes `gentle-ai/models.json` and `agent/subagents.json`. It also aligns Gentle Pi:

- `gentle-ai/profiles.json` gets the profile as its `active` profile, so later launches of the lane start with it.
- The current session is bound to the profile, so its subagents use it right away without a restart.

Run the command even when the lane already shows the right models. Selecting the profile again still repairs a stale Gentle `active` profile.

## 5. Confirm the lane

Inside the instance:

```text
/jb:odd-models status
```

It should show the lane's profile and no `[misaligned]` entries. `/gentle:profiles` should list the profile with `(session)`.

From a shell, the Gentle active profile should match the lane:

```sh
jq -r .active ~/.pi-opus/gentle-ai/profiles.json   # claude-opus-5.5
jq -r .active ~/.pi-gpt/gentle-ai/profiles.json    # openai6-1-gentle
jq -r .active ~/.pi-grok/gentle-ai/profiles.json   # grok-4-7
```

## Updating lanes after a package change

Lanes keep their own copy of the extension, so a package update reaches them only through the installer. Choose one way:

```sh
cd ~/miscodigos/pissdmodelswitch
./scripts/setup-odd-lanes.sh            # all lanes; also creates a missing lane
# or one lane at a time:
PI_HOME=~/.pi-opus ./install/install.sh
PI_HOME=~/.pi-gpt  ./install/install.sh
PI_HOME=~/.pi-grok ./install/install.sh
```

The installer moves a released predecessor entrypoint (`agent/extensions/odd-model-profiles.ts`) into the lane's `backups/` folder and keeps the lane's active profile. Then, in each lane: restart Pi through its launcher (add `--continue` to resume the last session in that directory) and run the profile command from step 4 again.

## Troubleshooting

### Subagents fail with `No API key found for xai` (or run on the wrong model)

Gentle Pi freezes the `active` profile of the lane's `gentle-ai/profiles.json` when a session starts. That frozen snapshot outranks `agent/subagents.json` when subagents launch, and `/reload` keeps it. A lane created from a home whose active Gentle profile used `xai/grok-4.6` will:

- fail its subagents in a lane without an xAI key;
- silently run its subagents on Grok in a lane that has one.

Changing `defaultProvider` in `settings.json` does not fix this. Fix:

1. Update the lane (see above), so its extension includes the Gentle alignment.
2. Restart the lane through its launcher and run the profile command from step 4.
3. Confirm with step 5, then relaunch the failed subagents.

Other sessions that are already open keep their frozen snapshot until they restart or select a profile in `/gentle:profiles`.

## Do not

- Run `/jb:odd-models` in a plain `pi` (without a launcher) expecting it to affect a lane: it changes `~/.pi` instead.
- Start a lane with plain `PI_HOME=... pi`: without the Gentle variables, Gentle applies the global `~/.pi/gentle-ai/models.json` to the lane's subagents.
