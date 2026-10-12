# Example: ODD lanes (Opus, GPT, and Grok)

A working configuration that runs Pi instances at the same time, each with its own ODD profile: opus, gpt, and grok. Setup always creates all three lanes; launch only the ones you need. It was set up with the lane scripts; the opus and gpt lanes were confirmed working on a real machine.

| Lane | Pi home | Launcher | Profile |
|---|---|---|---|
| opus | `~/.pi-opus` | `scripts/pi-opus.sh` | `claude-opus-5.5` |
| gpt | `~/.pi-gpt` | `scripts/pi-gpt.sh` | `openai6-1-gentle` |
| grok | `~/.pi-grok` | `scripts/pi-grok.sh` | `grok-4-7` |

For how the lanes work and what they still share, see [Two concurrent ODD lanes](HOW_TO_INSTALL.md#two-concurrent-odd-lanes).

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

Re-running setup is safe: it only adds missing files and never overwrites lane files or writes into `~/.pi`.

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

```sh
# terminal 1
./scripts/pi-opus.sh

# terminal 2
./scripts/pi-gpt.sh

# terminal 3 (optional)
./scripts/pi-grok.sh
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

Then confirm with `/jb:odd-models status`: it should show the lane's profile and no `[misaligned]` entries. The selection persists in that lane's home, so later launches keep it.

## Do not

- Run `/jb:odd-models` in a plain `pi` (without a launcher) expecting it to affect a lane: it changes `~/.pi` instead.
- Start a lane with plain `PI_HOME=... pi`: without the Gentle variables, Gentle applies the global `~/.pi/gentle-ai/models.json` to the lane's subagents.
