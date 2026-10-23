# The house look

What every film made with the kit looks like unless its owner changes it. The numbers live in `style/tokens.json`;
the drawing lives in `src/scenes/house/kit.tsx`; this page says what they are for, so a change can keep the spirit.

## In one paragraph

A restrained, drawn explainer in the manner of a nonfiction graphic novel and good educational film: greyscale ink
on warm paper, one accent colour, hairline drawing, small type, square 1080 × 1080 for phones. The pictures serve the
narration and never compete with it. Each element arrives on the word that names it, earlier ones step back, and
nothing moves unless the voice asks it to. There are no subtitles: the voice carries the words.

## The parts

- **Ground.** Warm paper (`color.paper`), plain. A faint graph grid is available (`ground.grid`, in pixels) but off
  in the house look.
- **Ink.** One ink (`color.ink`) for lines and type that matter now; `muted` for labels and for things that have
  stepped back; `faint` for guides, rules and what hasn't happened yet. Value and contrast carry the drama, not hue.
- **The accent.** One colour (`color.accent`, with its tint `accentWash` for fills and waiting time), kept for the
  single idea that matters most in a scene: the constraint, the decision, the person who approves. When that idea
  moves, the accent moves with it. Never a second accent; never accent for decoration.
- **Line.** Hairline drawing: `line.stroke` for drawing, `line.hairline` for guides and arrowheads, `line.bold` for
  the accent's marks. Rounded caps and joins. Whole drawings arrive as drawings; only borders, arrows and rules draw
  themselves on (a whiteboard-style line draw of everything reads as a cliché).
- **Type.** A serif (`font.serif`, Charter) for titles and the occasional phrase; a sans (`font.sans`, Avenir Next)
  for labels and cards; a mono (`font.mono`, Menlo) for file names, commands and source tags. Small: a title is
  `type.title` (46 px), a label `type.label` (28 px). On-screen words are short: a label, a caption of three to six
  words, a source tag. The narration is never written on screen.
- **Frame.** Square 1080 × 1080 at 30 fps, with a `frame.safe` margin of 72 px. A film may set another frame in its
  own `films/<name>/style/tokens.json` (16:9 for a talk, say), and the kit's sizes follow.
- **Motion.** Limited, eased, motivated by the voice. Prefer a rich, detailed still with a little movement to a
  simple picture with a lot. A scene builds as it is narrated and settles; it doesn't loop or bounce.
- **Between scenes.** Never a cut, never a crossfade. Something on screen carries across: the paper and the title
  (`paper-carry`), or the camera travelling one large page panel to panel (`page-travel`). See `shot-grammar.md`.
- **The poster.** The still a player shows before play is the title card (S0's settled frame).

## What it is not

Not a slide deck (no bullets building on a white page), not a motion comic (no paper-doll puppets, no panels that
only slide and fade), not a product film (no app windows, no wallpapers), not stock illustration. Generic defaults
read as made by a machine: every scene is drawn for what its narration says.

## Drawing a scene in the house look

Scenes are made of the kit's primitives (`Canvas`, `Title`, `Label`, `Serif`, `Mono`, `Para`, `Draw`, `Page`,
`Lines`, `Box`, `Bar`, `Tick`, `Person`, `Agent`, `Mark`, `Bubble`, `Clock`, `Code`, `Strike`). Colours are given by
role (`color="accent"`), never as hex; fonts come from the kit, never as a string. `node lint.mjs` fails a scene that
writes either, so a restyle reaches every scene. A new kind of drawing that several films need goes into the kit.

## Changing the look

Analyse a reference first (see `reference-analysis-graphic-novel.md` for how), then try two or three candidate
looks as real frames of a real film: put each as a tokens file (like `style/looks/night.json`) and run

    scripts/run-heavy.sh --task render -- node pipeline/style-frames.mjs --film example --tokens style/looks/night.json,style/looks/riso.json

which writes `style/picker.html` (the same frames in each look, one local file, phone-friendly) to choose from. The
pick goes into `style/tokens.json`; record here what changed and why, in the reviewer's words. A film that must keep
its look sets it in its own `films/<name>/style/tokens.json`. A tokens change re-renders every scene but re-voices
nothing.

## Decisions

- The house look as shipped: restrained graphic-novel drawing, greyscale ink on warm paper, one clay accent, no
  subtitles, square 1080 for phones.
