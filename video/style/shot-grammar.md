# Shot grammar

How a drawn film moves. The look is in `house.md` and `tokens.json`; this page is the grammar every scene follows, and
the build enforces most of it.

## A scene

- **One idea per scene.** A scene has a title (top left, in the serif) and a drawing that builds as the narration
  goes. When the idea is made, the scene settles: its still (`out/<name>/still-S<n>.png`) is that settled frame.
- **Each element arrives on the word that names it.** The shot's events (`shots.json`, written by
  `films/<name>/shots.mjs`) land on words of its lines: `{line: 2, word: "tests"}`. Pick plain words the speech check
  hears reliably: no product names or contractions. `node build.mjs --film <name> --check` stops on an event whose
  word the line doesn't say.
- **Earlier elements step back.** When the next thing arrives, what came before dims (to about half) or moves aside;
  it is never deleted in a way that reads as a cut. The accent moves to whatever now matters most.
- **Nothing moves unless the voice asks it to.** A settled element stays put. Arrivals take 0.4 to 0.9 s, eased.
- **Scenes are pure functions of the time t.** No clocks, timers, random numbers or CSS animation (`lint.mjs` fails
  them), so every render of a frame is the same picture.

## Timing

All in seconds, from `tokens.json` `voice` unless a shot sets its own:
- `leadIn` (0.5): picture before the first line. A scene that opens on a title building waits longer (0.8).
- `gap` (0.35): between lines. `pauses: {"2": 1.8}` adds picture after line 2, for a beat the voice doesn't name.
- `tail` (0.8): picture after the last line, for the scene to settle; `minScene` (3) is the shortest scene.
- Lines run 2 to 4.3 words a second (the speech check), about 3 words a second as written.

## Transitions

**No shot ever cuts or dissolves to the next.** Every scene after the first names its way in (`transitionIn` in
`shots.json`) from the list in `pipeline/plan.mjs` (`TRANSITIONS`); a scene change without one stops the build. The
outgoing scene's last frame and the incoming scene's first frame are the same picture.

| Name | From → to | What happens |
|---|---|---|
| `page-travel` | any → any | The film is one large drawn page and the camera travels across it, panel to panel. The move plays in the 1.6 s added after the scene before (its exit), so both scenes draw it: the old one steps back as the camera leaves, the new one is already there when it lands. |
| `paper-carry` | any → `paper-card` | The paper ground stays put; the incoming title and drawing take the place of the outgoing ones. |
| `stand-in` | any → `card` | Only while a scene isn't drawn yet: a labelled card that says so in its corner, and the report names it. Temporary by nature. |

A transition's `out` seconds are added to the end of the scene before; its `in` seconds open the scene after,
before the voice. The build stops if a scene's voice starts during its entry.

## The Shot: note is the spec

The script's `Shot:` note for each scene says what the viewer sees, line by line. `shots.mjs` turns it into a
`requires` list, one item per Shot: line, each naming what builds it (`event:<name>`, `transition`, or
`src:<path>`), or `built: false`, which the report lists under "Not built yet". When a note changes, the build stops
and prints the change until the shots are re-read and `shotSha` updated.

## The poster

S0 is the title card. Its shot has `thumbnail` (seconds; negative counts back from its exit), and the film's frame 0
shows that settled frame, so a player shows the title card before play. The build checks it.

## Previews

- `node build.mjs --film <name> --stills --estimate`: one still per scene, with lines timed by estimate and nothing
  voiced. For a look or a layout, in a minute.
- `node build.mjs --film <name> --stills`: the same, on the real voice (voices every line first: a GPU run).
- `--draft` renders at half size; `--scene S3` renders one scene.

## The topic list (optional)

A `Topic:` line under a scene's heading names it in a running list: at each change of topic the picture steps right
and the list of topics stands in the left fifth of the frame for about three seconds, the accent bar sliding to the
new one. Films that don't need it leave `Topic:` out.
