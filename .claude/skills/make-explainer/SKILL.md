---
name: make-explainer
description: Make a narrated explainer video from the user's sources, and edit or rebuild one that exists. Use when the user says "make an explainer", "make a video about", "explain X", "turn this into a video", "edit the script", "change scene 3", "regenerate", "re-render", "rebuild the film" or "make it shorter".
---

# Make an explainer

From the user's sources to a finished film in `video/out/<name>/<name>.mp4`, and every later edit. The user is not a developer: you run every command, from the kit's root folder, and tell them in plain words what is happening. Ask choices with AskUserQuestion, your recommendation first.

Read once before you start: `video/style/house.md`, `video/style/shot-grammar.md`, `video/style/taste.md`.

Heavy commands (anything that narrates or renders) go through `scripts/run-heavy.sh`. If it exits 3, there isn't enough free memory: list the apps it names and ask "I quit them, check again" / "Stop for now". Never run two heavy commands at once.

## 1. Intake

Ask, one AskUserQuestion at a time where it has options:
- A short name for the film: lowercase letters, digits and dashes (`how-tides-work`). It names the project folder and the film.
- The sources: files, links, or pasted text.
- Who it is for, and the one thing they should remember.
- Length: options "about 2 minutes" / "about 4 minutes" / "about 6 minutes".
- Voice: "the house voice", plus one option per folder in `voice/voices/` (or in `KIT_VOICE_DIR` if it is set).
- Shape: "square (phones)" / "wide 16:9 (talks, laptops)".

Then:

```
cp -R projects/example-project projects/<name>
mkdir -p projects/<name>/sources
```

Copy or save every source into `projects/<name>/sources/`. Fill in "About this film" in `projects/<name>/README.md` and log the decisions with today's date.

## 2. Research, with opened sources

For every claim the film will make, open the source (read the file, or fetch the page) and add a row to `projects/<name>/research.md`: an id (R1, R2 ...), the claim, the quote or the place in the source, the link or file, the date you opened it. A claim you could not open a source for is marked UNSOURCED and is never narrated. Ask the user only when sources disagree.

## 3. Story

Write an outline of 6 to 10 scenes, one idea each, S0 being the title card. Show it and ask: "Looks right" / "Change the emphasis" / "Shorter" / "Longer".

## 4. Script

Write `projects/<name>/script.md` in the format of `projects/example-project/script.md`:
- `### S<n> · Title (about N s)`, then a `| Narration | On screen |` table, one spoken breath per row.
- About 3 words a second; one idea per row; say numbers and names the way they should be heard.
- The On screen column is a spec: everything in it will be built. It never repeats the narration as text.
- Words the voice should say differently go in the `## The voice` table (Written | Said).

Write `projects/<name>/claims.md`: every narration sentence that states a fact, with its research row id. The UNSOURCED list at its end must be empty before anything is narrated.

Ask the user to read the script: "Approve" / "I'll edit the file" / "Change something (tell me)". If they use Claude Docs, they may paste it into a Doc to comment and paste it back; nothing depends on that.

## 5. Sync and check

```
node video/pipeline/sync-table.mjs projects/<name>/script.md --film <name> --write
```

This makes `video/films/<name>/script.md` (generated: never edit it by hand). Then set the film's voice and shape:
- `video/films/<name>/voice.json`: `{"voice": "house"}`, or `{"voice": "<voice folder name>"}`.
- For 16:9, `video/films/<name>/style/tokens.json`: `{"frame": {"width": 1920, "height": 1080}}`.

## 6. Shots

Copy `video/films/example/shots.mjs` to `video/films/<name>/shots.mjs` and edit it for this film:
- `EVENTS`: scene, line, event name, and the word it lands on. Use plain words the speech check hears reliably (no product names, no contractions).
- `REQUIRES`: one item per Shot: line, each naming what builds it (`event:<name>`, `transition`, or `src:<file>`), or `built: false` while it is a stand-in.
- The scene kind of each scene (`paper-card` until its own drawing exists) and its way in (`paper-carry` or `page-travel`; see the transitions in `shot-grammar.md`). S0 keeps `thumbnail`, so its settled title card is the poster.

Then write the shots and check (seconds, no GPU):

```
node video/films/<name>/shots.mjs
node video/build.mjs --film <name> --check
```

The check names every problem. Fix them and run it again until it passes.

## 7. Scenes

Write the film's drawings in `video/src/scenes/<name>/` using only the house kit (`video/src/scenes/house/kit.tsx`; `video/src/scenes/house/PaperCard.tsx` is a small model of a scene). Colours by role (`color="accent"`), never hex; fonts from the kit, never a font name. Register each new scene kind in `video/src/scenes/registry.ts`, and set it as the scene kind in `shots.mjs`. Then:

```
node video/films/<name>/shots.mjs
node video/lint.mjs
node video/build.mjs --film <name> --check
scripts/run-heavy.sh --task render node video/build.mjs --film <name> --stills --estimate
```

The last one draws one still per scene in `video/out/<name>/` (`still-S0.png` ...; all of them on `stills.png`) with the lines timed by estimate and nothing narrated. Show the user `stills.png` (attach it if you can, otherwise give its path and `open` it) and ask what to change. Every Shot: item is built, or listed as `built: false` and said to be a stand-in.

## 8. Voice

```
scripts/run-heavy.sh node video/pipeline/voice-only.mjs --film <name>
```

With the user's own voice, add `--task voice-quick` (a quick clone) or `--task voice-voxcpm` (a fine-tuned voice) after `scripts/run-heavy.sh`. Every line is checked by speech recognition and re-tried with another seed if it fails. Then:
- A line that fails on a name the recogniser mishears: add the misheard spelling to `video/voice/heard-as.json` and run again.
- A name the voice says wrongly: add a Written | Said row to the project's `## The voice` table, re-sync (step 5), and run again.

Then check the plan on the real timings and look at the stills again (quick now: the voice is cached):

```
node video/build.mjs --film <name> --check
scripts/run-heavy.sh --task render node video/build.mjs --film <name> --stills
```

Note: `--stills` without `--estimate` narrates every line that isn't narrated yet, so on a new film it is a long GPU run. That is why it comes after this step.

## 9. Music

By default the film has the kit's shipped music bed under the voice. Ask: "Keep the house bed" / "No music" / "Different music".
- No music: add `--no-score` to the render commands below.
- Different music needs `./setup.sh --music` (about 9.4 GB). Then change `seed` (or `prompt`) in `video/score/score.json` and render a draft to listen. That file is shared, so the change applies to every film built afterwards; say so.

## 10. Render

A half-size draft first, then the full film:

```
scripts/run-heavy.sh node video/build.mjs --film <name> --draft
scripts/run-heavy.sh node video/build.mjs --film <name>
```

The draft is `video/out/<name>/<name>-draft.mp4`. The film is `video/out/<name>/<name>.mp4`, with `stills.png`, `contact-sheet.png`, `report.md` (scene timings, and anything under "Not built yet"), `LISTEN.md` (five moments to check the music by ear) and 480p clips of the re-rendered scenes in `review/`. Send the user the film and `stills.png`, and tell them, with timecodes, what to look at and what isn't built yet.

## 11. Review rounds

Ask for changes with buttons where you can, your recommendation first. Write what the user says, in their words, into `video/style/taste.md` under a heading for this film, and log decisions in `projects/<name>/README.md`.

## 12. Edit and rebuild

Teach this as you go, and repeat the table in your last message:

| What changes | Re-narrated | Re-rendered | How |
|---|---|---|---|
| The words of a line | that line only | its scene (and the next, if it runs over) | edit `projects/<name>/script.md`, re-sync (step 5), `--check`, render |
| A Shot: note | nothing | that scene, once redrawn | the check stops and prints the change; update the scene and `REQUIRES`, run `shots.mjs`, `--check`, render |
| The film's drawing code | nothing | every scene of that film | lint, `--check`, `--stills --estimate`, render |
| The look (`video/style/tokens.json`) | nothing | every scene of every film built next | render (a film with its own `style/tokens.json` keeps its look) |
| The voice | every line | everything | change `voice.json`, then step 8 and render |
| The music settings | nothing | the soundtrack only | step 9 |

Useful extras:
- One scene on its own: `scripts/run-heavy.sh node video/build.mjs --film <name> --scene S3` makes `video/out/<name>/scene-S3.mp4`.
- Re-narrate every line anyway: add `--force-voice`.
- Try another voice once: `--voice <name>` (or `--voice house`) on any build command.
- Free disk space: `scripts/run-heavy.sh node video/build.mjs --film <name> --stills --gc` removes the scene renders that no film's last build uses (`--gc` rides on a build; with `--stills` it doesn't render the film again).

A long narration row is split at its sentences; editing one can shift the lines after it in that row, which re-narrates them too. That is expected.
