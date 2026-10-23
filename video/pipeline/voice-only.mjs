// Voice the whole script (with re-rolls) without capturing or rendering: node pipeline/voice-only.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseScript, said} from './script.mjs';
import {voiceLines} from './voice.mjs';
import {filmPaths, filmStyle} from './film.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const fi = process.argv.indexOf('--film'), paths = filmPaths(here, fi > 0 ? process.argv[fi + 1] : 'intro');
const {scenes, lexicon} = parseScript(readFileSync(paths.script, 'utf8'));
const lines = scenes.flatMap((s) => s.lines.map((l) => ({...l, said: said(l.text, lexicon)})));
try {
  const style = filmStyle(here, paths);
  const v = voiceLines(lines, {here, style, cache: join(here, '.cache'), pub: paths.pub, log: console.log});
  const total = v.reduce((a, l) => a + l.duration, 0);
  console.log(`voiced ${v.length} lines, ${total.toFixed(1)} s of speech`);
} catch (e) { console.error(e.message); process.exit(1); }
