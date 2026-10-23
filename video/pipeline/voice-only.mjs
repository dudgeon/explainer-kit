// Voice a film's whole script (with re-rolls) without planning or rendering:
//   node pipeline/voice-only.mjs --film <name> [--voice <name|house>] [--force-voice]
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseScript, said} from './script.mjs';
import {voiceLines} from './voice.mjs';
import {filmPaths, filmStyle} from './film.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
try {
  const paths = filmPaths(here, arg('--film'));
  const {scenes, lexicon} = parseScript(readFileSync(paths.script, 'utf8'));
  const lines = scenes.flatMap((s) => s.lines.map((l) => ({...l, said: said(l.text, lexicon)})));
  const style = filmStyle(here, paths);
  const v = voiceLines(lines, {here, paths, voice: arg('--voice'), style, cache: join(here, '.cache'), pub: paths.pub, force: process.argv.includes('--force-voice'), log: console.log});
  const total = v.reduce((a, l) => a + l.duration, 0);
  console.log(`voiced ${v.length} lines, ${total.toFixed(1)} s of speech`);
} catch (e) { console.error(e.message); process.exit(1); }
