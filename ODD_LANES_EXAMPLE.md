# Example: two ODD lanes (Opus and GPT)

A working configuration that runs two Pi instances at the same time, each with its own ODD profile. It was set up with the lane scripts and confirmed working on a real machine.

| Lane | Pi home | Launcher | Profile |
|---|---|---|---|
| opus | `~/.pi-opus` | `scripts/pi-opus.sh` | `claude-opus-5.5` |
| gpt | `~/.pi-gpt` | `scripts/pi-gpt.sh` | `openai6-1-gentle` |

For how the lanes work and what they still share, see [Two concurrent ODD lanes](HOW_TO_INSTALL.md#two-concurrent-odd-lanes).

## 1. Create the lane homes (once)

```sh
cd ~/miscodigos/pissdmodelswitch
./scripts/setup-odd-lanes.sh
```

Expected output at the end:

```text
ODD lanes are ready (no profile activated, Pi not started):
  opus: /home/julian/.pi-opus
  gpt:  /home/julian/.pi-gpt

Next steps:
  1. Launch each lane in its own terminal (the launchers also set the Gentle homes):
       /home/julian/miscodigos/pissdmodelswitch/scripts/pi-opus.sh
       /home/julian/miscodigos/pissdmodelswitch/scripts/pi-gpt.sh
  2. Inside the opus instance run:  /jb-odd-models claude-opus-5.5
     Inside the gpt instance run:   /jb-odd-models openai6-1-gentle
```

Re-running setup is safe: it only adds missing files and never overwrites lane files or writes into `~/.pi`.

## 2. Check the launcher environment (optional)

```sh
PI_LANE_DRY_RUN=1 ./scripts/pi-opus.sh
```

```text
PI_HOME=/home/julian/.pi-opus
PI_CODING_AGENT_DIR=/home/julian/.pi-opus/agent
GENTLE_PI_AGENT_HOME=/home/julian/.pi-opus/agent
GENTLE_PI_CONFIG_HOME=/home/julian/.pi-opus/gentle-ai
```

`scripts/pi-gpt.sh` prints the same four lines for `/home/julian/.pi-gpt`.

## 3. Launch each lane in its own terminal

```sh
# terminal 1
./scripts/pi-opus.sh

# terminal 2
./scripts/pi-gpt.sh
```

Extra Pi flags pass through, for example `./scripts/pi-opus.sh --continue`.

## 4. Select the profile inside each instance (once per lane)

```text
# opus instance
/jb-odd-models claude-opus-5.5

# gpt instance
/jb-odd-models openai6-1-gentle
```

Then confirm with `/jb-odd-models status`: it should show the lane's profile and no `[misaligned]` entries. The selection persists in that lane's home, so later launches keep it.

## Do not

- Run `/jb-odd-models` in a plain `pi` (without a launcher) expecting it to affect a lane: it changes `~/.pi` instead.
- Start a lane with plain `PI_HOME=... pi`: without the Gentle variables, Gentle applies the global `~/.pi/gentle-ai/models.json` to the lane's subagents.
