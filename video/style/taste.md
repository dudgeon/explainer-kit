# Taste: what has been rejected, and what was chosen

Read this before proposing any look, transition or voice. It holds the directions a reviewer has given, in their words
where we have them, so the direction travels with the films and not only in one session's memory. Add to it after
every review round: a new heading per film for what is particular to that film, and the general rules here.

## The rule under all of them

Generic defaults read as made by a machine. A model falls back on safe defaults unless it is given a reference to
analyse and a director's brief. So:
- analyse a reference (palette, line, type, composition, pacing, motion, texture) before proposing a style, and write
  the analysis down (`reference-analysis-<name>.md`; `reference-analysis-graphic-novel.md` is the house's);
- show two or three crafted options as real frames from the film (`pipeline/style-frames.mjs` and the picker), not
  quick variations of one idea;
- prefer a rich, detailed still with limited movement over a simple picture with a lot of motion;
- make pictures procedurally (drawn by code from the kit), not with image models.

## Cuts

- **No shot ever cuts to the next, and a plain crossfade counts as a cut.** Something on screen carries across: the
  paper and the title, or the camera travelling the page from panel to panel. A new idea gets there by a drawn
  transition, never by a wipe of the whole frame.

## Shot: notes

- **A Shot: note is a spec, not a suggestion.** Every item in it is built, or the report says up front that it
  isn't (a stand-in). A quiet substitute reads as ignoring what the writer wrote. The build stops when a note
  changes until the shots are re-read (`shotSha`).
- When a note asks for a specific motion ("an animated transition here"), build that motion; a different motion that
  is easier to make is a substitute and must be announced.

## The poster

- **The still a player shows before play is the title card.** The film's frame 0 is S0's settled frame (Film.tsx
  draws it at the first scene's `poster` time), `out/<name>/thumbnail.png` is the same frame and is the file's cover
  art, and the build fails if frame 0 isn't the title card.

## Words on screen

- No subtitles: the narration is heard, not read.
- On-screen words are short: labels, captions of three to six words, source tags.
- Lines on a title card are descriptive and plain: no superlatives, no subjective adjectives.

## The voice

| Rejected | The reviewer's words | Chosen instead |
|---|---|---|
| The first designed voices | "sterile", "too high pitched" | a baritone |
| That baritone | "somber"; asked for it "20% more upbeat" | a brighter take of it |
| The brighter take | "too deep; we can go even quicker, say 10%" | the house voice: a lighter baritone at tempo 1.1 |

Before sending a voice, check its pitch and expressiveness, and voice real lines from the film, not a test sentence.

## Per film

(Add a heading per film: what the reviewer asked for, rejected and chose, with dates.)
