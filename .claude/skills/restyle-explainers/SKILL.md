---
name: restyle-explainers
description: Change the visual style of the explainer films (palette, accent, fonts, drawing style) by analysing references and showing candidate looks as real frames to pick from. Use when the user says "change the look", "restyle", "new style", "different colours", "different fonts", "make it look like X" or "match my brand".
---

# Change the look

The look is three things: the numbers in `video/style/tokens.json` (colours by role, fonts, sizes, line widths, the frame), the drawing in `video/src/scenes/house/kit.tsx`, and the words in `video/style/house.md`. Every scene reads the look through the kit, so a change here reaches every film. The user is not a developer: you run every command from the kit's root folder and show real frames, never a description alone.

## 1. Read first

`video/style/house.md`, `video/style/reference-analysis-graphic-novel.md` (how a reference is analysed, and what the house took from its references) and `video/style/taste.md`. The rule: analyse references before proposing a look.

## 2. What should change, and references

Ask with AskUserQuestion: "Colours / the accent only" / "Fonts" / "The drawing style" / "Everything". Then ask for two or three references: image files, links, a brand guide, or a description.

For each reference, write `video/style/reference-analysis-<slug>.md`: the ground, the line, the colour, the lettering, the composition, the motion, and **what we take** (the grammar, never the content: no copied characters, logos or layouts).

## 3. Two or three candidate looks, as real frames

Write each candidate as a tokens file in `video/style/looks/<candidate>.json` (lowercase name with dashes), setting only the keys that change; `video/style/looks/night.json` and `riso.json` are examples. Colours are the roles `paper`, `ink`, `muted`, `faint`, `accent`, `accentWash`; fonts are `serif`, `sans`, `mono`. Keep one accent; keep enough contrast between `ink` and `paper` to read on a phone. Fonts must be installed on this Mac; the kit does not load web fonts yet. See what is there with `ls /System/Library/Fonts /System/Library/Fonts/Supplemental /Library/Fonts ~/Library/Fonts 2>/dev/null`. A font that is missing silently falls back to the next name in its list, so check the frames.

Render the same scenes in the house look and each candidate:

```
scripts/run-heavy.sh --task render -- node video/pipeline/style-frames.mjs --film example --tokens video/style/looks/<a>.json,video/style/looks/<b>.json
```

Use the user's own film instead of `example` if they have one (it shows more), and `--scenes S0,S2,S4` to pick a few scenes. Nothing is narrated: the lines are timed by estimate, so this works on a fresh install. It writes `video/style/picker.html`: one local page, phone-friendly, no network, the frames side by side. Send it to the user (attach it if you can, otherwise `open` it), and ask which they pick with AskUserQuestion, one option per candidate plus "None of these; try again".

## 4. Apply the pick

Before changing the house look, ask whether finished films should keep their current look. For each one that should, copy the current `color` and `font` blocks of `video/style/tokens.json` into `video/films/<film>/style/tokens.json`: that pins the film.

Then merge the picked candidate's keys into `video/style/tokens.json` (the same keys, nothing else) and check:

```
node video/lint.mjs
node video/build.mjs --film example --check
scripts/run-heavy.sh --task render node video/build.mjs --film example --stills --estimate
```

Send `video/out/example/stills.png`. For a film the user has already narrated, `scripts/run-heavy.sh --task render node video/build.mjs --film <film> --stills` shows it on its real timings, from the voice cache.

## 5. Deeper changes: the drawing

A new way of drawing (a different line, a texture, a new kind of figure) goes into `video/src/scenes/house/kit.tsx` only, so every film gets it. Scenes never write a hex colour or a font name; `node video/lint.mjs` fails a scene that does. After a kit change, run the commands in step 4 again and show the stills.

## 6. Record the decision

Add to the Decisions list in `video/style/house.md` what changed, why, and the user's words; update its description of the parts if they changed. Add the user's direction to `video/style/taste.md`.

## 7. What to tell the user

- A look change re-renders every scene of every film built next, and re-narrates nothing.
- A film with its own `video/films/<film>/style/tokens.json` keeps its own look.
- Old looks stay in `video/style/looks/`. To try one on a film without making it the house look, Claude runs the build with `KIT_TOKENS_OVERRIDE=video/style/looks/<name>.json` in front of the command; to make it the house look again, its keys go back into `tokens.json`.
- For a quick look after a change, ask for stills or a draft; a full render is only needed for the final film.
