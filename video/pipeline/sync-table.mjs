#!/usr/bin/env node
// A project's script (projects/<name>/script.md) is two columns (Narration | On screen) per scene, not the bullets
// pipeline/script.mjs reads. This turns it into films/<name>/script.md: each narration cell becomes one voiced bullet
// (split at a sentence when it runs past MAX words, so long lines aren't rushed), and the visuals column becomes the
// scene's Shot: note, line by line. A "## The voice" table (Written | Said) in the source, or the film's existing one,
// is kept. With --write it makes films/<name>/ if it isn't there yet.
//   node pipeline/sync-table.mjs ../projects/<name>/script.md --film <name> [--write]
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const [src] = process.argv.slice(2);
const film = process.argv[process.argv.indexOf('--film') + 1];
if (!src || !film || film.startsWith('--')) { console.error('usage: node pipeline/sync-table.mjs <script.md> --film <name> [--write]'); process.exit(1); }
if (!/^[a-z0-9][a-z0-9-]*$/.test(film)) { console.error(`"${film}" isn't a film name (lowercase letters, digits, dashes)`); process.exit(1); }
const MAX = 22;
const md = readFileSync(src, 'utf8').split('\n');
const plain = (s) => s.replace(/\*\*|\*|`|\\/g, '').trim();
const cells = (l) => l.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
const split = (t) => {
  const words = t.split(/\s+/).length;
  if (words <= MAX) return [t];
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [t];
  const out = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && (last.split(/\s+/).length < 6 || s.split(/\s+/).length < 6) && (last + ' ' + s).split(/\s+/).length <= MAX + 4) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
};

const scenes = [], voice = [];
let scene = null, inVoice = false;
for (const line of md) {
  if (/^## /.test(line)) { inVoice = /voice/i.test(line); scene = null; continue; }
  const h3 = line.match(/^### (S\d+\s*·.*)$/);
  if (h3) { scene = {head: h3[1].trim(), rows: []}; scenes.push(scene); continue; }
  if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
  const c = cells(line);
  if (inVoice) { if (c[0] !== 'Written') voice.push(`| ${c[0]} | ${c[1]} |`); continue; }
  if (scene && c.length >= 2 && c[0] !== 'Narration') scene.rows.push({say: plain(c[0]), see: plain(c[1])});
}
if (!scenes.length) { console.error('no "### S1 · …" scenes with Narration | On screen tables found'); process.exit(1); }

const out = join(here, 'films', film, 'script.md');
const keepVoice = !voice.length && existsSync(out) ? (readFileSync(out, 'utf8').match(/## The voice\n\n([\s\S]*?)\n\n## /)?.[1] ?? '') : '';
const voiceTable = voice.length ? ['| Written | Said |', '| --- | --- |', ...voice].join('\n') : keepVoice || '| Written | Said |\n| --- | --- |';
const body = scenes.map((s) => {
  const bullets = s.rows.flatMap((r) => split(r.say)).map((t) => `- ${t}`).join('\n');
  const shot = s.rows.map((r, i) => `Line ${i + 1}: ${r.see}`).join(' ');
  return `### ${s.head}\n\n${bullets}\n\nShot: ${shot}`;
}).join('\n\n');
// Only the source's file name and its folder's name go into the generated file: a full path would carry the writer's
// home folder into the repo.
const source = `${basename(dirname(resolve(src)))}/${basename(src)}`;
const text = `# ${film} script\n<!-- Written by pipeline/sync-table.mjs from ${source} on ${new Date().toISOString().slice(0, 10)}; edit that, not this file. -->\n\n## The voice\n\n${voiceTable}\n\n## Scenes\n\n${body}\n`;
if (process.argv.includes('--write')) { mkdirSync(dirname(out), {recursive: true}); writeFileSync(out, text); console.log(`wrote ${out}: ${scenes.length} scenes`); }
else console.log(text);
