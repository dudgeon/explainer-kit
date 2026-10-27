// The voices on this Mac and whether each can narrate now. Light: reads files, runs no model.
//   node video/pipeline/voices.mjs                 every voice in $KIT_VOICE_DIR (default voice/voices/)
//   node video/pipeline/voices.mjs --voice <name>  one voice (a name, or a path to a voice folder)
// For each voice: its kind (quick clone or fine-tune), "ready", or what is missing and the setup line that fixes it.
// Notes, which don't stop a build: a fine-tune trained on another VoxCPM2 revision than this kit pins, a voice with no
// CONSENT.md, a fine-tune on a Mac too small to narrate with it. Exit 0 when every voice listed is ready (or there are
// none), 1 when one is not, 2 on a bad argument.
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {voiceSetup} from './voice.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(here, '..');
const tilde = (p) => p.replace(/^~(?=\/|$)/, homedir());
const root = tilde(process.env.KIT_VOICE_DIR || join(repo, 'voice/voices'));
const i = process.argv.indexOf('--voice');
const one = i > 0 ? process.argv[i + 1] : undefined;
if (i > 0 && !one) { console.error('voices: --voice needs a name or a folder'); process.exit(2); }

const names = one ? [one] : existsSync(root)
  ? readdirSync(root, {withFileTypes: true}).filter((d) => d.isDirectory() && !/^[._]/.test(d.name) && existsSync(join(root, d.name, 'voice.json'))).map((d) => d.name).sort()
  : [];
const where = process.env.KIT_VOICE_DIR ? `${root} (KIT_VOICE_DIR)` : 'voice/voices/';
if (!names.length) { console.log(`your voices: none in ${where}`); process.exit(0); }

const pinned = (() => {
  try { return JSON.parse(readFileSync(join(repo, 'voice/models.lock.json'), 'utf8')).models.VoxCPM2.revision; } catch { return null; }
})();
// A fine-tune's base: package_voice.py writes "repo@revision"; older voices have {hf_repo, revision}.
const baseRevision = (b) => (typeof b === 'string' ? b.split('@')[1] : b?.revision) ?? null;
// Too small to narrate with a fine-tune? preflight's size-only mode: exit 2 means this Mac is under the task's minimum.
let small;
const tooSmall = () => (small ??= spawnSync(join(repo, 'scripts/preflight.sh'), ['voice-voxcpm'], {env: {...process.env, KIT_PREFLIGHT_SIZE_ONLY: '1'}, stdio: 'ignore'}).status === 2);

let bad = 0;
console.log(`your voices (${where}):`);
for (const name of names) {
  const folder = name.includes('/') ? resolve(tilde(name)) : join(root, name);
  let card = {};
  try { card = JSON.parse(readFileSync(join(folder, 'voice.json'), 'utf8')); } catch { /* voiceSetup says why */ }
  const kind = (card.engine ?? 'qwen-clone') === 'voxcpm2' ? (card.lora ? 'fine-tune' : 'VoxCPM2, no LoRA') : 'quick clone';
  const notes = [];
  let status;
  try {
    voiceSetup({here, voice: name});
    status = 'ready';
  } catch (e) {
    bad++;
    status = `NOT READY: ${e.message.replace(/^voice: /, '')}`;
  }
  if (card.engine === 'voxcpm2') {
    const rev = baseRevision(card.base);
    if (rev && pinned && rev !== pinned) notes.push(`trained on VoxCPM2 ${rev.slice(0, 10)}, but this kit uses ${pinned.slice(0, 10)}: it may sound wrong; listen to a draft first`);
    if (tooSmall()) notes.push('this Mac is too small to narrate with a fine-tune (24 GB or more); a quick clone made from its reference clip works here');
  }
  if (!existsSync(join(folder, 'CONSENT.md'))) notes.push('no CONSENT.md (whose voice it is and that they agreed)');
  console.log(`  ${name.padEnd(22)} ${kind.padEnd(12)} ${status}`);
  for (const n of notes) console.log(`  ${''.padEnd(22)} note: ${n}`);
}
process.exit(bad ? 1 : 0);
