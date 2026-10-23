#!/usr/bin/env node
// Build a film: script → check → voice → timeline → score → lint → stills → render → review.
// Every product is content-addressed in .cache/, so an unchanged line is never re-voiced and an unchanged scene is
// never re-rendered.
//   node build.mjs --film <name>          full build: out/<name>/<name>.mp4, a still per scene, contact sheet, report.md
//   --check                               the check stage only (seconds; no voicing or rendering). With every line
//                                         already voiced, the plan is checked too.
//   --stills                              no video: one still per scene, where it settles. This VOICES EVERY LINE first
//                                         (the timeline needs each line's length and word timings), so on a fresh film it
//                                         is a GPU run; only once the voice is cached is it quick.
//   --stills --estimate                   stills with no voicing: lines timed at the look's target pace, no audio, no
//                                         score (pipeline/estimate.mjs). Quick, no voice models; for a look or a layout,
//                                         not for timing (style-frames.mjs uses the same estimate).
//   --draft                               half-size render, for a quick look
//   --scene S7                            render one scene (or S7,S8) to out/<name>/scene-S7.mp4, from the cache where unchanged
//   --whole                               render the film in one pass (no scene cache)
//   --voice <name|house>                  narrate with this voice instead of the film's voice.json (pipeline/voice.mjs)
//   --force-voice                         re-voice every line anyway
//   --no-score                            no background score
//   --gc                                  drop scene renders no film's last build uses
// The look is style/tokens.json, the film's films/<name>/style/tokens.json over it, and KIT_TOKENS_OVERRIDE=<file>
// over both (pipeline/film.mjs); the merged look goes into timeline.json, which is how it reaches every scene.
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkScript, scriptChanges} from './pipeline/check.mjs';
import {plan, posterFrame as posterAt, stillAt} from './pipeline/plan.mjs';
import {parseScript, said} from './pipeline/script.mjs';
import {BuildError} from './pipeline/util.mjs';
import {filmNames, filmPaths, filmStyle} from './pipeline/film.mjs';
import {voiceLines, voiceSetup} from './pipeline/voice.mjs';
import {COMPOSITION, gcCache, renderFilm, reviewClips, sceneKeys, soundtrackKey} from './pipeline/render.mjs';
import {scoreBed} from './pipeline/score.mjs';
import {estimateVoiced} from './pipeline/estimate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), args = new Set(argv);
const value = (flag) => {
  if (!args.has(flag)) return undefined;
  const v = argv[argv.indexOf(flag) + 1];
  if (!v || v.startsWith('--')) { console.error(`BUILD FAILED: ${flag} needs a value`); process.exit(1); }
  return v;
};
const film = value('--film');
const voiceArg = value('--voice');
const estimate = args.has('--estimate');
if (estimate && !args.has('--stills')) { console.error('BUILD FAILED: --estimate is for --stills only (a film is never rendered on estimated timings)'); process.exit(1); }
let paths;
try { paths = filmPaths(here, film); } catch (e) { console.error(`BUILD FAILED: ${e.message}`); process.exit(1); }
const cache = join(here, '.cache'), pub = paths.pub, out = paths.out;
for (const d of [cache, pub, out]) mkdirSync(d, {recursive: true});
const report = [];
const log = (s) => { console.log(s); report.push(s); };
const remotion = (...a) => spawnSync(join(here, 'node_modules/.bin/remotion'), [...a, '--log=error', ...paths.publicDirArgs], {cwd: here, stdio: 'inherit'});
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

try {
  const style = filmStyle(here, paths);
  if (!existsSync(paths.shots)) throw new BuildError(`shots: no ${relative(here, paths.shots)}; write the film's shots (node films/${film}/shots.mjs) before checking or building`);
  const shots = JSON.parse(readFileSync(paths.shots, 'utf8'));

  // 1. Script, and the check stage: everything that can be known without voicing or rendering.
  const {scenes, lexicon} = parseScript(readFileSync(paths.script, 'utf8'));
  if (!scenes.length) throw new BuildError(`script: no scenes in ${relative(here, paths.script)}`);
  const {errors, missing} = checkScript({here, scenes, shots, lexicon, said, cache});
  // The voice is checked here too: a missing one stops the build before anything is voiced.
  const voice = voiceSetup({here, paths, voice: voiceArg});
  const changes = scriptChanges(scenes, join(cache, paths.lastBuild));
  if (changes.changes?.length) log(`script since the last build:\n${changes.changes.map((c) => `  ${c}`).join('\n')}`);
  if (errors.length) throw new BuildError(`check: ${errors.length} problem(s):\n${errors.map((e) => `- ${e}`).join('\n')}`);
  for (const m of missing) log(`NOT BUILT YET ${m}`);
  const lines = scenes.flatMap((s) => s.lines.map((l) => ({...l, said: said(l.text, lexicon)})));
  log(`script: ${scenes.length} scenes, ${lines.length} lines; voice: ${voice.describe}; check passed`);
  if (args.has('--check')) {
    // With every line voiced already, the plan itself is checked too: events on heard words, transitions, timings.
    const keyed = voice.keyed(lines);
    const unvoiced = keyed.filter((l) => !existsSync(join(cache, 'voice', `${l.key}.asr.json`)));
    if (unvoiced.length) {
      // Not voiced yet: the plan is checked on estimated timings instead (every event still lands on its word).
      const tl = plan({scenes, shots, voiced: estimateVoiced(lines, style), style});
      log(`check: plan ok on estimated timings, about ${fmt(tl.duration)} (${unvoiced.length} line(s) not voiced yet; a build voices them)`);
      process.exit(0);
    }
    const voiced = keyed.map((l) => { const a = JSON.parse(readFileSync(join(cache, 'voice', `${l.key}.asr.json`), 'utf8')); return {...l, duration: a.duration_s, words: a.words}; });
    const tl = plan({scenes, shots, voiced, style});
    log(`check: plan ok, ${fmt(tl.duration)}`);
    process.exit(0);
  }

  // 2. Voice (every build but --check voices every line not already cached, --stills included; --stills --estimate
  // times the lines by estimate instead and voices nothing).
  const voiced = estimate ? estimateVoiced(lines, style) : voiceLines(lines, {here, paths, setup: voice, cache, pub, style, force: args.has('--force-voice'), log});
  if (estimate) log(`voice: none (--estimate: ${lines.length} lines timed at ${style.voice.targetWps} words/s, no audio)`);

  // 3. Timeline
  const timeline = plan({scenes, shots, voiced, style});
  // 4. Score: the bed for the film's length, mixed in the film under the voice (pipeline/score.mjs).
  if (!args.has('--no-score') && !estimate) timeline.score = scoreBed({here, cache, pub, duration: timeline.duration, voiceWavs: voiced.slice(0, 8).map((l) => join(pub, l.src)), log});
  for (const sc of timeline.scenes) if (sc.transitionIn) log(`transition: into ${sc.id} by ${sc.transitionIn.name}`);
  // The poster: the first scene's settled frame (its title card), when its shot names one (`thumbnail`). Film draws
  // the film's frame 0 as that frame, so a player with no poster image shows the title card until play, and
  // out/<name>/thumbnail.png is the same frame.
  const first = timeline.scenes[0], posterFrame = posterAt(timeline, shots);
  if (posterFrame !== undefined) first.poster = +(posterFrame / timeline.fps - first.start).toFixed(6);
  // The film's own frame size and look: the scenes read `style` through src/scenes/house/kit.tsx, never tokens.json.
  Object.assign(timeline, {width: style.frame.width, height: style.frame.height, style});
  writeFileSync(join(pub, 'timeline.json'), JSON.stringify(timeline, null, 2));
  log(`timeline: ${fmt(timeline.duration)} (${timeline.scenes.map((s) => `${s.id} ${s.duration.toFixed(1)}s`).join(', ')})`);

  // 5. Lint
  if (spawnSync('node', [join(here, 'lint.mjs')], {stdio: 'inherit'}).status !== 0) throw new BuildError('lint');

  // 6. Stills: each scene where it settles (just before its exit, else 70% of the way in).
  // A one-scene preview (--scene) makes no stills.
  for (const s of args.has('--scene') ? [] : timeline.scenes) {
    remotion('still', 'src/index.ts', COMPOSITION, join(out, `still-${s.id}.png`), `--frame=${Math.round(stillAt(s) * timeline.fps)}`);
  }
  // The thumbnail: the poster frame (above), also the video's cover art (pipeline/render.mjs).
  if (posterFrame !== undefined && !args.has('--scene')) {
    remotion('still', 'src/index.ts', COMPOSITION, join(out, 'thumbnail.png'), `--frame=${posterFrame}`);
    log(`thumbnail: ${relative(here, join(out, 'thumbnail.png'))}`);
  }
  const n = timeline.scenes.length, cellH = Math.round(640 * timeline.height / timeline.width / 2) * 2;
  if (!args.has('--scene')) spawnSync('/bin/sh', ['-c', `ffmpeg -v error -y ${timeline.scenes.map((s) => `-i "${join(out, `still-${s.id}.png`)}"`).join(' ')} ` +
    `-filter_complex "${timeline.scenes.map((_, i) => `[${i}]scale=640:${cellH},setsar=1[s${i}]`).join(';')};${timeline.scenes.map((_, i) => `[s${i}]`).join('')}concat=n=${n}:v=1:a=0,tile=4x${Math.ceil(n / 4)}:padding=6" -frames:v 1 "${join(out, 'stills.png')}"`]);

  if (estimate) {
    // Estimated timings are not the film's: they leave no review, no record of the cache, the script or a report behind.
    log(`stills: ${relative(here, out)}/still-*.png (estimated timings)`);
    process.exit(0);
  }
  // 7. Render: a scene at a time, from the cache where a scene is unchanged (pipeline/render.mjs); `--scene S7` renders
  // just that scene to out/<name>/scene-S7.mp4, for a quick look. `--whole` renders the film in one pass.
  const scale = args.has('--draft') ? 0.5 : 1;
  let rendered = [];
  if (args.has('--scene')) {
    const sceneArg = value('--scene');
    renderFilm({here, pub, out, cache, timeline, scale, only: sceneArg.split(','), film, publicDirArgs: paths.publicDirArgs, log});
  } else if (!args.has('--stills')) {
    let mp4;
    if (args.has('--whole')) {
      mp4 = join(out, scale !== 1 ? `${film}-draft.mp4` : `${film}.mp4`);
      if (remotion('render', 'src/index.ts', COMPOSITION, mp4, ...(scale !== 1 ? [`--scale=${scale}`] : [])).status !== 0) throw new BuildError('render');
      // Loudness: the voice comes out of the TTS near -28 LUFS; the film's soundtrack is brought to -16 LUFS
      // (peaks under -1.5 dBTP), the level web video plays at, with the picture copied untouched.
      const loud = join(out, `${film}.loud.mp4`);
      const thumb = join(out, 'thumbnail.png'), art = existsSync(thumb) ? ['-i', thumb, '-map', '0:v', '-map', '0:a', '-map', '1:v', '-c:v:1', 'png', '-disposition:v:1', 'attached_pic'] : [];
      if (spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, ...art, '-c:v:0', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', loud]).status === 0) {
        copyFileSync(loud, mp4);
        log('render: soundtrack at -16 LUFS');
      }
      rendered = timeline.scenes.map((s) => s.id);
    } else ({mp4, rendered} = renderFilm({here, pub, out, cache, timeline, scale, cover: join(out, 'thumbnail.png'), film, publicDirArgs: paths.publicDirArgs, log}));
    // The poster check: the film's first frame must be the title card (the still a player shows before play), the
    // same picture as thumbnail.png.
    const thumb = join(out, 'thumbnail.png');
    if (posterFrame !== undefined && existsSync(thumb) && scale === 1) {
      const r = spawnSync('ffmpeg', ['-v', 'info', '-i', mp4, '-i', thumb, '-lavfi', '[0:v]trim=end_frame=1[a];[1:v]format=yuv420p[b];[a][b]psnr', '-f', 'null', '-'], {encoding: 'utf8'});
      const db = +(r.stderr.match(/PSNR .*average:([0-9.]+|inf)/)?.[1]?.replace('inf', '99') ?? 0);
      if (db < 35) throw new BuildError(`poster: the film's first frame isn't the title card (${db.toFixed(1)} dB against thumbnail.png); Film.tsx draws frame 0 at the first scene's poster time`);
      log(`poster: frame 0 is the title card (${db >= 99 ? 'identical' : `${db.toFixed(1)} dB`} against thumbnail.png), and the file's cover art`);
    }
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'fps=1,scale=320:-1,tile=8x0:padding=4', '-frames:v', '1', join(out, 'contact-sheet.png')]);
    log(`render: ${relative(here, mp4)}`);
    // The score's ear check: a waveform of the final mix, and five timecodes to listen at. The checks above are
    // numbers; whether the bed sits right is decided by ear.
    if (timeline.score) {
      spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-filter_complex', `showwavespic=s=2400x360:split_channels=0:colors=${style.color.accent}`, '-frames:v', '1', join(out, 'score-qa.png')]);
      const ls = timeline.scenes.flatMap((s) => s.lines.map((l) => ({id: l.id, start: s.start + l.start, end: s.start + l.start + l.duration})));
      let gap = {at: 0, len: 0};
      for (let i = 1; i < ls.length; i++) if (ls[i].start - ls[i - 1].end > gap.len) gap = {at: ls[i - 1].end, len: ls[i].start - ls[i - 1].end};
      const topic = timeline.scenes.find((s, i) => i > 0 && s.topic && s.topic !== timeline.scenes[i - 1].topic);
      // The busiest scene: the most seconds of speech for its length.
      const busy = [...timeline.scenes].sort((a, b) => b.lines.reduce((x, l) => x + l.duration, 0) / b.duration - a.lines.reduce((x, l) => x + l.duration, 0) / a.duration)[0];
      const at = [
        ['The open: the bed fades in under the first scene', 0.5],
        [topic ? `A topic change (${topic.id}): a small swell while the topic list is up` : 'No topic change in this film: the bed steady under the voice', topic ? topic.start - 0.5 : Math.min(10, timeline.duration / 2)],
        [`The longest gap between lines (${gap.len.toFixed(1)} s): the bed up, never louder than the voice`, gap.at],
        [`A busy stretch of speech (${busy.id}): the bed well under, words clear`, busy.start + Math.min(2, busy.duration / 2)],
        ['The end: the bed fades out with the hold', Math.max(0, timeline.duration - 6)],
      ];
      writeFileSync(join(out, 'LISTEN.md'), `# Listen at\n\nThe score is checked by numbers; these five moments are for the ear.\n\n${at.map(([w, t]) => `- **${fmt(t)}**: ${w}`).join('\n')}\n\nWaveform: score-qa.png.\n`);
    }
  }
  // What a reviewer reads (out/<name>/review.json): each scene's place, its still, what its Shot: note asks for and
  // when each is on screen, and, for the scenes this build re-rendered, a 480p clip, so a cut is reviewed by what changed.
  const clips = rendered.length && scale === 1 && !args.has('--scene') ? reviewClips({out, timeline, rendered, film}) : {};
  const at = (sc, ref) => {
    if (ref.startsWith('event:')) return sc.drawn?.events?.[ref.slice(6)];
    if (ref === 'transition') return 0;
    return undefined;
  };
  writeFileSync(join(out, 'review.json'), JSON.stringify({duration: timeline.duration, scenes: timeline.scenes.map((sc) => ({
    id: sc.id, title: sc.title, topic: sc.topic, start: fmt(sc.start), end: fmt(sc.start + sc.duration), still: `still-${sc.id}.png`,
    rerendered: rendered.includes(sc.id), clip: clips[sc.id] ?? null,
    requires: (shots[sc.id]?.requires ?? []).map((r) => ({what: r.what, built: r.built !== false,
      at: [...new Set((r.by ?? []).map((ref) => at(sc, ref)).filter((t) => t !== undefined).map((t) => fmt(sc.start + t)))]})),
  }))}, null, 1));
  // What this build uses, kept per film: --gc keeps the union over every film, so cleaning one never removes another's cache.
  const live = {renders: [...[1, 0.5].flatMap((sc) => sceneKeys({here, pub, timeline, scale: sc, film}).map((k) => k.key)),
    `audio-${soundtrackKey({here, pub, timeline, from: 0, to: timeline.frames - 1, film})}`]};
  writeFileSync(join(cache, `live-${film}.json`), JSON.stringify(live));
  if (args.has('--gc')) {
    const keepRender = new Set();
    for (const f of filmNames(here)) {
      const file = join(cache, `live-${f}.json`);
      if (!existsSync(file)) {
        // A film built before this record existed has cache we can't name: stop rather than remove it. One never built has none.
        if (existsSync(join(cache, `last-build-script-${f}.json`))) throw new BuildError(`gc: film ${f} has been built but has no record of its cache entries yet; build it once (node build.mjs --film ${f}), then --gc`);
        continue;
      }
      JSON.parse(readFileSync(file, 'utf8')).renders.forEach((k) => keepRender.add(k));
    }
    gcCache({cache, liveRenderKeys: keepRender, log});
  }
  const table = timeline.scenes.map((s) => `| ${s.id} | ${s.title} | ${fmt(s.start)} | ${s.duration.toFixed(1)} s | ${s.kind === 'drawn' ? s.drawn.scene : s.kind}${s.card?.standIn ? ' (stand-in)' : ''} |`).join('\n');
  const gaps = missing.length ? `## Not built yet\n\nThe script asks for these and this cut doesn't have them:\n\n${missing.map((m) => `- ${m}`).join('\n')}\n\n` : '';
  // The script as built, for the next build's "since the last build".
  writeFileSync(join(cache, paths.lastBuild), JSON.stringify(changes.now, null, 1));
  writeFileSync(join(out, 'report.md'), `# ${film} build\n\n${gaps}${report.map((l) => `- ${l}`).join('\n')}\n\n| Scene | Title | Starts | Length | Shot |\n|---|---|---|---|---|\n${table}\n`);
} catch (e) {
  if (e instanceof BuildError) { console.error(`BUILD FAILED: ${e.message}`); process.exit(1); }
  throw e;
}
