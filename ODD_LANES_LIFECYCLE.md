# ODD lane setup, updates, and removal

Keep the existing workflow: prepare lanes, launch each in its own terminal, and select its ODD profile with `/jb:odd-models`. Use the uninstaller to archive complete lane homes, or add `--delete` for permanent removal. The uninstaller previews by default and never removes shared Pi symlink targets.

## 1. Prepare and launch the existing lanes

From this repository:

```sh
cd ~/miscodigos/pissdmodelswitch
./scripts/setup-odd-lanes.sh
```

The setup manages these homes automatically; you do not need to export `HOME` or `PI_HOME` yourself:

| Lane | Home | Launcher | Profile to select inside Pi |
|---|---|---|---|
| opus | `~/.pi-opus` | `scripts/pi-opus.sh` | `/jb:odd-models claude-opus-5.5` |
| gpt | `~/.pi-gpt` | `scripts/pi-gpt.sh` | `/jb:odd-models openai6-1-gentle` |
| grok | `~/.pi-grok` | `scripts/pi-grok.sh` | `/jb:odd-models grok-4-7` |

Launch from the project you want to work on, using the launcher's absolute path. It preserves your current directory:

```sh
~/miscodigos/pissdmodelswitch/scripts/pi-opus.sh
~/miscodigos/pissdmodelswitch/scripts/pi-gpt.sh
~/miscodigos/pissdmodelswitch/scripts/pi-grok.sh
```

Each launcher exports `PI_HOME`, `PI_CODING_AGENT_DIR`, `GENTLE_PI_AGENT_HOME`, and `GENTLE_PI_CONFIG_HOME` for its lane. The source home, normally `~/.pi`, is separate. Setup shares the source's bulky `agent/npm`, `agent/install`, and `agent/bin` directories through symlinks when those directories exist.

The current scripts name three lanes. Arbitrary N-lane creation is not implemented by this change. Homes can be overridden with the environment variables below, but that does not add another named launcher.

## 2. Select and verify the ODD profile

Inside each instance, select the profile from the table, then run:

```text
/jb:odd-models status
/jb:odd-models doctor
```

The intended normal workflow is `/jb:odd-models` alone, not an additional mandatory `/gentle:profiles` step. A selection needs to align:

- `gentle-ai/models.json`, the canonical routing;
- `agent/subagents.json`, the persisted runtime routing;
- `gentle-ai/profiles.json`, when it exists, including its active profile;
- the invoking session's Gentle binding, so its subagents use the selected routing.

The pending repository extension includes Gentle alignment. That is not proof that every installed lane has the same extension, or that the live Gentle runtime consumes its binding correctly. Editing `profiles.json` manually changes persisted state only; it does not prove that an already open session changed its frozen profile. `/reload` must not be assumed to refresh that snapshot.

### What was found in the GPT lane

The investigation found matching OpenAI routes in `models.json` and `subagents.json`, but a stale active Gentle profile named `current` with Grok 4.6 workers and Codex 5.6 judges. That matched the observed unexpected worker model and judge authentication failures.

With explicit permission, `openai6-1-gentle` was added to the GPT lane's saved profiles and marked active using its canonical routing. Existing profiles were retained. This was a one-time persisted-state repair, not a verified live-session activation or a fix to the installed extension.

The intended new installed entrypoint `agent/extensions/jb-odd-model-profiles.ts` and helper `agent/extensions/model-profiles/gentle-profiles.ts` were absent from that lane. The predecessor `agent/extensions/odd-model-profiles.ts` was subsequently inspected with permission: it registers `/jb-odd-models` (the older hyphenated command), updates the invoking parent and the two canonical/runtime files, and has no Gentle saved-profile or session-binding synchronization. Its SHA-256 matches a predecessor recognized by the pending installer. This establishes a repository-versus-installed-code mismatch, not the historical cause of a reinstall or the live session's frozen state.

## 3. Distinguish Pi updates from package updates

| Change | Action |
|---|---|
| Pi updated in the shared installation directories | Normally close and relaunch each instance. Re-running lane setup is not inherently required. |
| This repository's extension or helpers changed | Each lane's copied package assets need updating; shared Pi symlinks do not update those copies. |
| A new lane is needed | Use setup, then its launcher and profile selection. |

**Known unresolved upgrade defect:** the pending setup filename gate can recopy the entire source extension tree into an existing lane with the old entrypoint, overwriting lane-local extensions before the installer backs them up. Do not treat rerunning setup as a safe upgrade until that defect is fixed.

The previously reviewed same-home Gentle alignment races and semantic no-op rewrite also remain unfixed. These are separate from removal. The uninstaller does not correct routing or update package assets.

## 4. Preview or archive complete lane homes

First close **all** Pi instances using the selected homes. Run removal from a separate terminal, not as a command inside a selected Pi lane. The script can detect inherited lane environment variables, but it cannot prove that every process in other terminals has stopped.

Node.js 22.19.0 or newer is required, as with the package installer.

```sh
cd ~/miscodigos/pissdmodelswitch

# Preview; no files are changed.
./scripts/uninstall-odd-lanes.sh
# Equivalent explicit preview:
./scripts/uninstall-odd-lanes.sh --dry-run

# After checking the paths and stopping Pi, archive the selected homes.
./scripts/uninstall-odd-lanes.sh --yes
```

Archival moves whole homes into a unique directory under `~/.pi-lanes-archive/`. It preserves sessions, credentials, configuration, extensions, and the symlinks themselves. Nested symlink targets, including shared Pi installation directories, are not moved. The private archive directory contains:

```text
odd-lanes-<unique-id>/
  manifest.json   # Original and archived absolute paths
  RESTORE.md      # Recovery instructions
  opus/          # Only when that lane existed
  gpt/
  grok/
```

Archival uses same-filesystem renames, not recursive copies. A cross-filesystem destination fails. If a move fails, the script attempts to restore homes already moved; it never overwrites a newly created original home during rollback. If rollback is incomplete, the error identifies the archive to keep and inspect. Do not delete it.

Archival does not preserve a replacement copy of the shared Pi installation. The symlinks depend on their existing external targets continuing to exist.

## 5. Restore archived lanes

1. Stop Pi and read the archive's `manifest.json` and `RESTORE.md`.
2. Make sure each `originalPath` is absent. Never overwrite an existing lane home; resolve any conflict explicitly first.
3. Move each complete directory from `archivedPath` back to `originalPath`, preferably on the same filesystem.
4. Launch it with its existing launcher and verify its selected profile.

There is no automated restore command. If setup creates new homes before you restore the old ones, do not merge them blindly.

## 6. Delete permanently instead of archiving

**This deletes sessions, credentials, configuration, extensions, and every other file stored inside the selected lane homes. It creates no backup and cannot be undone.** Existing archives are not deleted.

```sh
# Preview permanent deletion only.
./scripts/uninstall-odd-lanes.sh --delete

# Permanent deletion, after checking paths and stopping every selected instance.
./scripts/uninstall-odd-lanes.sh --delete --yes
```

The shared Pi installation and source home are retained. Nested symlinks are removed without following their targets. If deletion fails partway, there is no rollback: the error reports fully removed lanes and warns that other homes may be partially removed. Inspect the paths before deciding whether to run it again.

## 7. Paths and safeguards

| Variable | Default | Purpose |
|---|---|---|
| `HOME` | Shell home | Base for default paths; required except for `--help`. |
| `PI_LANE_SOURCE` | `$HOME/.pi` | Protected source home. |
| `PI_LANE_OPUS_HOME` | `$HOME/.pi-opus` | Selected opus home. |
| `PI_LANE_GPT_HOME` | `$HOME/.pi-gpt` | Selected gpt home. |
| `PI_LANE_GROK_HOME` | `$HOME/.pi-grok` | Selected grok home. |
| `PI_LANE_ARCHIVE_ROOT` | `$HOME/.pi-lanes-archive` | Archive destination; ignored by `--delete`. |

All selected paths are validated before the first move or deletion. Missing homes are skipped. The script refuses HOME or its ancestors, source-home overlap, overlapping lane homes, lane-root symlinks, and homes without real `agent/` and `gentle-ai/` directories. Parent symlinks are resolved for the overlap checks. Archive storage cannot overlap a lane or the source.

`--yes` and `--dry-run` cannot be combined. See the complete command help:

```sh
./scripts/uninstall-odd-lanes.sh --help
```

## Verification boundaries

Removal tests run only against fake homes inside the repository and check exit codes, stdout/stderr, preserved data, shared symlink targets, rejected paths, and archive rollback. No real lane was archived or deleted during development. Tests use injected filesystem failures, not real provider calls.

Installed Gentle routing and live provider execution are a separate verification boundary. Earlier offline tests validated the existing three-lane setup/profile-selection flow, not live authentication or the installed runtime's session snapshot.
