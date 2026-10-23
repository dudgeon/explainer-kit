#!/usr/bin/env node
// Candidate looks as real frames: renders stills of a film's scenes in the house look and in each candidate token set,
// and writes style/picker.html, a page that shows them side by side to pick from. The page is one local file (the
// stills are inside it), works on a phone, and loads nothing from the network; send it as a file, and the picks come
// back in chat.
//   node pipeline/style-frames.mjs --film example [--tokens style/looks/a.json,style/looks/b.json] [--scenes S0,S1]
//                                  [--no-house] [--out style/picker.html]
// Each candidate is a tokens file merged over the film's look exactly as a build merges KIT_TOKENS_OVERRIDE
// (pipeline/film.mjs filmStyle): the merged look goes into the candidate's own timeline.json, and `remotion still`
// draws the frames through the same path a build does (Film.tsx → the house kit). Nothing is voiced: lines are timed
// by estimate (pipeline/estimate.mjs), so this runs on a fresh install, before any voice exists. Rendering is GPU work:
//   scripts/run-heavy.sh --task render -- node pipeline/style-frames.mjs …
// Stills land in out/<film>/style-frames/<candidate>/ (gitignored), the page in style/picker.html (gitignored).
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {filmPaths, filmStyle} from './film.mjs';
import {parseScript, said} from './script.mjs';
import {plan, posterFrame, stillAt} from './plan.mjs';
import {estimateVoiced} from './estimate.mjs';
import {COMPOSITION} from './render.mjs';
import {BuildError} from './util.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const value = (flag) => {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) { console.error(`style-frames: ${flag} needs a value`); process.exit(1); }
  return v;
};
const film = value('--film');
const abs = (p) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const tokenFiles = (value('--tokens') ?? '').split(',').filter(Boolean).map(abs);
const outPage = abs(value('--out') ?? join(here, 'style/picker.html'));
const template = join(here, 'style/picker.template.html');

try {
  const paths = filmPaths(here, film);
  for (const f of tokenFiles) if (!existsSync(f)) throw new BuildError(`style-frames: no tokens file ${f}`);
  const candidates = [...(argv.includes('--no-house') ? [] : [{name: 'house', file: null}]),
    ...tokenFiles.map((f) => ({name: basename(f).replace(/\.json$/, ''), file: f}))];
  if (!candidates.length) throw new BuildError('style-frames: nothing to render (give --tokens, or leave out --no-house)');
  const names = new Set();
  for (const c of candidates) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(c.name)) throw new BuildError(`style-frames: a candidate's file name must be lowercase letters, digits, dashes (${c.name})`);
    if (names.has(c.name)) throw new BuildError(`style-frames: two candidates are called ${c.name}`);
    names.add(c.name);
  }
  const shots = JSON.parse(readFileSync(paths.shots, 'utf8'));
  const {scenes, lexicon} = parseScript(readFileSync(paths.script, 'utf8'));
  const want = value('--scenes')?.split(',') ?? scenes.map((s) => s.id);
  for (const id of want) if (!scenes.some((s) => s.id === id)) throw new BuildError(`style-frames: ${film} has no scene ${id}`);
  const lines = scenes.flatMap((s) => s.lines.map((l) => ({...l, said: said(l.text, lexicon)})));

  const results = [];
  for (const c of candidates) {
    // The candidate's look, merged exactly as a build merges it.
    if (c.file) process.env.KIT_TOKENS_OVERRIDE = c.file; else delete process.env.KIT_TOKENS_OVERRIDE;
    const style = filmStyle(here, paths);
    const timeline = plan({scenes, shots, voiced: estimateVoiced(lines, style), style});
    const poster = posterFrame(timeline, shots);
    if (poster !== undefined) timeline.scenes[0].poster = +(poster / timeline.fps - timeline.scenes[0].start).toFixed(6);
    Object.assign(timeline, {width: style.frame.width, height: style.frame.height, style});
    const pub = join(here, 'build', film, 'styles', c.name, 'public');
    rmSync(pub, {recursive: true, force: true});
    mkdirSync(pub, {recursive: true});
    writeFileSync(join(pub, 'timeline.json'), JSON.stringify(timeline, null, 2));
    const dir = join(paths.out, 'style-frames', c.name);
    mkdirSync(dir, {recursive: true});
    const stills = [];
    for (const id of want) {
      const s = timeline.scenes.find((x) => x.id === id);
      const file = join(dir, `still-${id}.png`);
      console.log(`style-frames: ${c.name} ${id}`);
      const r = spawnSync(join(here, 'node_modules/.bin/remotion'), ['still', 'src/index.ts', COMPOSITION, file, `--frame=${Math.round(stillAt(s) * timeline.fps)}`, `--public-dir=${pub}`, '--log=error'],
        {cwd: here, stdio: 'inherit', env: process.env});
      if (r.status !== 0 || !existsSync(file)) throw new BuildError(`style-frames: remotion still failed for ${c.name} ${id}`);
      stills.push({id, title: s.title, file});
    }
    const {$note: _n, ...color} = style.color;
    results.push({name: c.name, from: c.file ? relative(here, c.file) : 'style/tokens.json (the house look)', color, font: style.font, note: c.file ? (JSON.parse(readFileSync(c.file, 'utf8')).$note ?? '') : 'The house look as it stands.', stills});
  }
  delete process.env.KIT_TOKENS_OVERRIDE;

  // The page: the template with the candidates in it, each still as a data URI so the page is one self-contained file.
  const data = results.map((r) => ({...r, stills: r.stills.map((s) => ({id: s.id, title: s.title, src: `data:image/png;base64,${readFileSync(s.file).toString('base64')}`}))}));
  const page = readFileSync(template, 'utf8')
    .replace('__FILM__', film)
    .replace('"__CANDIDATES__"', JSON.stringify(data).replace(/</g, '\\u003c'));
  mkdirSync(dirname(outPage), {recursive: true});
  writeFileSync(outPage, page);
  console.log(`style-frames: ${results.length} look(s) × ${want.length} scene(s); stills in ${relative(here, join(paths.out, 'style-frames'))}/, page ${relative(here, outPage)} (${(page.length / 1e6).toFixed(1)} MB)`);
} catch (e) {
  if (e instanceof BuildError) { console.error(e.message); process.exit(1); }
  throw e;
}
