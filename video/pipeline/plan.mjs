// Turn the script, the voiced lines and the shots into build/<film>/public/timeline.json.
// Voice timing is the beat map: a drawn element arrives on the word that names it.
import {readFileSync} from 'node:fs';
import {BuildError} from './util.mjs';

export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

export const HEARD_AS = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('../voice/heard-as.json', import.meta.url), 'utf8')))
  .filter(([k]) => !k.startsWith('$')).flatMap(([name, heard]) => heard.map((h) => [h, name])));

export function wordTime(line, phrase, nth = 1) {
  // `nth` picks a later occurrence when a word repeats in the line ("files" twice).
  const want = norm(phrase);
  // A heard word reads as the name it stands for (voice/heard-as.json: "cloud" is Claude), as the speech check reads it.
  // A heard word that holds several ("up-to-date") splits into its parts, spread across its time.
  const words = line.words.flatMap((w) => {
    const parts = norm(w.word), n = parts.join(' ');
    if (HEARD_AS[n] || parts.length < 2) return [{...w, n: HEARD_AS[n] ?? n}];
    const d = ((w.end ?? w.start) - w.start) / parts.length;
    return parts.map((p, i) => ({...w, start: w.start + d * i, n: HEARD_AS[p] ?? p}));
  });
  let seen = 0;
  for (let i = 0; i < words.length; i++) {
    if (want.every((w, j) => words[i + j] && words[i + j].n === w) && ++seen === nth) return words[i].start;
  }
  throw new BuildError(`plan: ${line.id} has no word "${phrase}" to land on (heard: ${line.words.map((w) => w.word).join(' ')})`);
}

// No shot ever cuts to the next. Every scene after the first names its way in, `transitionIn` in shots.json, from
// this list; a scene change without one stops the build. Each is a motion graphic the two scenes draw themselves.
// `from`/`to` are scene types (a drawn shot's `scene`, else its `kind`), or '*' for any. `out` seconds are added to
// the end of the scene before (its exit plays there); `in` seconds open this scene (its entry plays there, before
// the voice). style/shot-grammar.md, "Transitions", describes each one.
export const TRANSITIONS = {
  // The film is one large drawn page and the camera travels across it, panel to panel. The move plays in the `out`
  // seconds after the scene before, so the frames either side are the same picture.
  'page-travel': {kind: 'graphic', from: '*', to: '*', out: 1.6},
  // Paper to paper: the paper ground and the title carry across; the next scene's content takes the place of the last's.
  'paper-carry': {kind: 'graphic', from: '*', to: 'paper-card'},
  // A scene that isn't drawn yet stands in as a labelled card (never silent: the report names it). Temporary by
  // nature: replace the card with the scene.
  'stand-in': {kind: 'graphic', from: '*', to: 'card'},
};
export const sceneType = (shot) => (shot.kind === 'drawn' ? shot.scene : shot.kind);
const ok = (side, type) => side === '*' || (Array.isArray(side) ? side.includes(type) : side === type);
export const fromOk = (tr, type) => ok(tr.from, type);
export const toOk = (tr, type) => ok(tr.to, type);

export function plan({scenes, shots, voiced, style}) {
  const fps = style.frame.fps;
  const byId = new Map(voiced.map((l) => [l.id, l]));
  const out = [];
  let t0 = 0;
  for (const scene of scenes) {
    const shot = shots[scene.id];
    if (!shot) throw new BuildError(`shots: scene ${scene.id} "${scene.title}" has no shot in shots.json`);
    const prev = out[out.length - 1];
    let tr;
    if (prev) {
      const name = shot.transitionIn;
      tr = TRANSITIONS[name];
      if (!tr) throw new BuildError(`transition: ${scene.id} has no way in from ${prev.id}${name ? ` ("${name}" is not in plan.mjs TRANSITIONS)` : ''}. Shots never cut: give ${scene.id} a transitionIn.`);
      const pt = sceneType(shots[prev.id]);
      if (!fromOk(tr, pt) || !toOk(tr, sceneType(shot))) throw new BuildError(`transition: "${name}" goes ${tr.from} -> ${tr.to}, but ${prev.id} -> ${scene.id} is ${pt} -> ${sceneType(shot)}`);
      if (tr.out) {
        prev.exit = {name, at: prev.duration};
        if (prev.drawn) prev.drawn.events.exit = prev.duration;
        prev.duration = +(prev.duration + tr.out).toFixed(3);
        t0 += tr.out;
      }
    }
    const lines = [];
    let t = shot.leadIn ?? style.voice.leadIn; // a shot that opens on picture alone (a title building) waits longer
    // `pauses` {"2": 1.8}: extra seconds of picture after a line, for beats the voice doesn't name.
    scene.lines.forEach((l, i) => {
      const v = byId.get(l.id);
      lines.push({...v, start: +t.toFixed(3)});
      t += v.duration + style.voice.gap + (shot.pauses?.[i + 1] ?? 0);
    });
    let end = Math.max(t + (shot.tail ?? style.voice.tail), style.voice.minScene);
    const s = {id: scene.id, title: scene.title, topic: scene.topic ?? null, kind: shot.kind, start: 0, duration: 0, lines};
    if (shot.kind === 'card') {
      Object.assign(s, {card: {title: shot.title ?? scene.title, sub: shot.sub ?? '', standIn: !!shot.standIn}});
    } else if (shot.kind === 'drawn') {
      // A drawn scene: its events happen on words of its lines.
      const events = {};
      for (const [name, e] of Object.entries(shot.events ?? {})) {
        const line = lines[e.line - 1];
        if (!line) throw new BuildError(`shots: ${scene.id} event ${name} names line ${e.line}, but the scene has ${lines.length}`);
        events[name] = +(line.start + (e.word ? wordTime(line, e.word, e.nth) : 0) + (e.offset ?? 0)).toFixed(3);
        end = Math.max(end, events[name] + 0.5);
      }
      if (tr?.in) {
        // The entry plays before anything else; the scene's own business starts when it ends.
        events.entry = tr.in;
        if (lines[0] && lines[0].start < tr.in + 0.6) throw new BuildError(`transition: ${scene.id}'s voice starts at ${lines[0].start}s, during its ${shot.transitionIn} entry (${tr.in}s). Raise its leadIn.`);
      }
      Object.assign(s, {drawn: {scene: shot.scene, events}});
    } else throw new BuildError(`shots: ${scene.id} has unknown kind "${shot.kind}" (a film's shots are "drawn" or "card")`);
    if (tr) s.transitionIn = {name: shot.transitionIn, kind: tr.kind};
    s.start = +t0.toFixed(3);
    s.duration = +end.toFixed(3);
    t0 += end;
    out.push(s);
  }
  const duration = +t0.toFixed(3);
  return {fps, duration, frames: Math.ceil(duration * fps), fade: 0, scenes: out};
}

/** Where a scene settles, for its still: just before its exit, else 70% of the way in (seconds into the film). */
export const stillAt = (s) => s.start + Math.min(s.duration - 0.1, s.exit ? s.exit.at - 0.3 : s.duration * 0.7);

/** The poster frame: the first scene's settled frame, when its shot names one (`thumbnail`, seconds; negative = from its exit). */
export function posterFrame(timeline, shots) {
  const first = timeline.scenes[0], thumbAt = shots[first.id]?.thumbnail;
  return thumbAt === undefined ? undefined : Math.round((first.start + (thumbAt < 0 ? (first.exit?.at ?? first.duration) + thumbAt : thumbAt)) * timeline.fps);
}
