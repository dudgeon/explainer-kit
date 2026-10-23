# Explainer Kit: orientation for Claude

This folder is a kit for making narrated explainer videos on this Mac. The person you are talking to is an end user, not a developer. Never ask them to edit code, open a terminal or learn a command: you run everything and say in plain words what you are doing and why. Keep messages short.

## First thing in a new session

1. Check that setup has run, without changing anything: `./setup.sh --check` (a few seconds, no network).
   - "everything is in place": go on.
   - Something missing: tell the user what is missing and that setup downloads about 6.5 GB and takes a while. Ask with AskUserQuestion: "Run setup now" / "Not now". If yes, run `./setup.sh` in the background and report when it ends.
2. Offer the tasks with AskUserQuestion (one question, these options):
   - **Make an explainer**: a video from your sources (skill `make-explainer`; it also covers editing and rebuilding a film).
   - **Use my own voice**: record yourself and make a narrator from it (skill `make-my-voice`).
   - **Change the look**: a new visual style for the films (skill `restyle-explainers`).
   - **Something else**.

   Don't read the kit's code before asking. If the user's first message already names a task, skip the question and start that skill.

## Hard rules

- **One heavy job at a time.** Narrating, rendering, stills, training, scoring voices and making music all go through `scripts/run-heavy.sh` (memory check, then the kit's one compute lock). Never start a heavy command any other way, and never start two at once, even in the background. `--check`, `lint.mjs`, `sync-table.mjs`, `shots.mjs` and file edits are light and need no lock.
- **Memory.** If `scripts/run-heavy.sh` or `scripts/preflight.sh` exits 3, read out which apps use the most memory and ask with AskUserQuestion: "I quit them, check again" / "Use a lighter option" / "Stop". Exit 2 means this Mac is too small for that task: say which option fits instead (the message names it).
- **Nothing leaves this Mac.** Never upload the user's recordings, voices or sources anywhere. `voice/takes/`, `voice/runs/` and `voice/voices/` are personal and ignored by git; never `git add` them. Before anything is published or shared from this folder, run `scripts/check-repo.sh` and fix what it reports.
- **No cuts and no crossfades** between scenes. Something on screen always carries across (`video/style/shot-grammar.md`).
- **A Shot: note is a spec.** Everything in it gets built, or the report says up front that it isn't.
- **Scenes are pure functions of the frame.** No timers, clocks or random numbers in scenes; colours and fonts only through the house kit. `node video/lint.mjs` enforces both.
- **Analyse references before proposing a look**, and show two or three looks as real frames, never one.
- **Only the user's own voice**, or one whose owner has clearly agreed.

## Where things are

Run every command from this folder (the kit's root).

- Explainer working folders: `projects/<name>/` (copy `projects/example-project/` to start one).
- Films: `video/films/<name>/` (script generated from the project's script, `shots.mjs`, optional `voice.json` and `style/tokens.json`). The film called `example` is a two-scene sample; build commands need `--film <name>`.
- A film's own drawings: `video/src/scenes/<name>/`, registered in `video/src/scenes/registry.ts`. The drawing kit: `video/src/scenes/house/kit.tsx`.
- Finished films and stills: `video/out/<name>/`.
- The look: `video/style/tokens.json` (numbers), `video/style/house.md` (in words), `video/style/taste.md` (what reviewers have said).
- Voices the user made: `voice/voices/<name>/` (or the folder in `KIT_VOICE_DIR`). The house voice: `video/voice/house/`.

## Memory, by size of Mac

- 16 GB: the house voice, the quick clone of the user's voice, rendering, restyling. No fine-tuning.
- 24 GB: as 16 GB; fine-tuning is not offered by default (its memory figures there are estimates, not yet measured).
- 32 GB or more: everything, including fine-tuning (`./setup.sh --voice-train`).

When the user asks about their own voice, always tell them plainly what the quick clone can and cannot do (the `make-my-voice` skill has the wording).
