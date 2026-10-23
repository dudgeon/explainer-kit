# Script

The example film's script (it builds as `video/films/example`), in the format the kit reads. Copy this file for a new
explainer and replace the scenes.

- One `### S<n> · Title (about N s)` heading per scene, S0 first. S0 is the title card and the film's poster.
- Under each heading, a two-column table: **Narration** (exactly what the voice says, one breath per row) and
  **On screen** (what the viewer sees while that row is said; this is a spec, and every item in it gets built).
- About three words a second. One idea per row. Say numbers and names the way they should be spoken.
- The narration is never written on screen, so the On screen column says what is drawn, not the words.
- `## The voice` lists words the voice should say differently from how they are written (Written | Said).

Turn it into the film's script with `node pipeline/sync-table.mjs ../projects/<name>/script.md --film <name> --write`
(run from `video/`); then write the film's shots and run `node build.mjs --film <name> --check`.

## The voice

| Written | Said |
| --- | --- |

## Scenes

### S0 · A film made from a script (about 8 s)

| Narration | On screen |
| --- | --- |
| This short film was made from a script, a voice and a few drawings, all on one computer. | The title draws in on paper; an accent rule draws under it on the word script. This is the poster: frame 0 shows the settled card. |

### S1 · Pictures arrive on their words (about 8 s)

| Narration | On screen |
| --- | --- |
| Each picture arrives on the word that names it, and the page carries on without a cut. | The paper carries over from the last scene and the new title takes its place; the accent rule draws under it on the word picture. |
