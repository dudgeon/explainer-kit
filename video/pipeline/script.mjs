// Parse a film's script.md (films/<name>/script.md, written from the project's two-column script by sync-table.mjs).
// Scenes are `### S<n> · <title> (about N s)`; each bullet under one is a voiceover line;
// `Topic:` under the heading is its name in the topic list; a paragraph starting `Shot:` is the shot note, and prose after it (paragraphs, numbered beats, but not `> notes`) belongs to it. The table under `## The voice` is the
// pronunciation lexicon (Written | Said): Said is what the voice is given.

export function parseScript(md) {
  const scenes = [];
  const lexicon = [];
  let scene = null, inVoice = false;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const h2 = line.match(/^## (.*)/);
    if (h2) { inVoice = /voice/i.test(h2[1]); scene = null; continue; }
    const h3 = line.match(/^### (S\d+)\s*·\s*(.+?)(?:\s*\(about (\d+) s\))?$/);
    if (h3) {
      scene = {id: h3[1], title: h3[2].trim(), targetSeconds: h3[3] ? +h3[3] : null, lines: [], shot: '', notes: [], asides: [], topic: null};
      scenes.push(scene);
      continue;
    }
    if (inVoice) {
      const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
      if (row && !/^-+$/.test(row[1]) && row[1] !== 'Written') {
        const saidAs = row[2].replace(/\s*\(.*\)\s*$/, ''); // a note in brackets is for people, not the voice
        for (const w of row[1].split(',').map((s) => s.trim()).filter(Boolean)) lexicon.push({written: w, said: saidAs});
      }
      continue;
    }
    if (!scene) continue;
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      // *Italics* mark a phrase the picture should point at (a callout cue); the voice never sees the marks.
      const cues = [...bullet[1].matchAll(/(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g)].map((m) => (m[1] ?? m[2]).trim());
      const text = bullet[1].replace(/\*\*|`/g, '').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1').replace(/(?<!_)_([^_]+)_(?!_)/g, '$1').trim();
      if (/^\(.*\)$/.test(text)) continue; // an empty template slot: "(line)"
      scene.lines.push({id: `${scene.id}-${scene.lines.length + 1}`, text, cues});
      continue;
    }
    // `Topic: …` names the scene in the topic list shown at scene changes.
    const topic = line.match(/^Topic:\s*(.+)/);
    // `Topic: same` keeps the scene under the previous scene's topic: one entry, no topic list between them.
    if (topic && !scene.shot) { scene.topic = /^same$/i.test(topic[1].trim()) ? (scenes.at(-2)?.topic ?? null) : topic[1].trim(); continue; }
    const shot = line.match(/^Shot:\s*(.+)/);
    if (shot) scene.shot = shot[1].trim();
    // Prose after the Shot: line (paragraphs, numbered beats) is part of what the shot must do. A `> note` is for
    // us, as the script's rules promise: kept as an aside, never part of the note's hash.
    else if (scene.shot && /^>/.test(line)) { if (!/^>\s*$/.test(line)) scene.asides.push(line.replace(/^>\s?/, '').trim()); }
    else if (scene.shot && line.trim()) scene.notes.push(line.trim());
  }
  // Example scenes and empty template slots are for the writer, not the film.
  return {scenes: scenes.filter((sc) => !/^example\b/i.test(sc.title) && sc.lines.length), lexicon};
}

/** What the voice is given: each Written form replaced by its Said form, longest first, as whole words. */
export function said(text, lexicon) {
  let out = text;
  for (const {written, said: s} of [...lexicon].sort((a, b) => b.written.length - a.written.length)) {
    if (written === s) continue;
    const esc = written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^\\w])${esc}(?=$|[^\\w])`, 'g'), (_, pre) => pre + s);
  }
  return out;
}
