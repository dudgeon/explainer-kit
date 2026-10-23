// Voice every line, re-voicing only lines whose spoken text or voice setup changed.
// One engine run (one model load) voices all the missing lines; each is then checked by speech recognition
// (video/voice/asr_check.py), whatever engine spoke it.
//
// Which voice: `--voice <name|house>` on the command line, else the film's voice.json ({"voice": "house"} or
// {"voice": "<name>"}), else the house voice. A name is a voice folder under $KIT_VOICE_DIR (default: the repo's
// voice/voices/, which is never committed), or a path to one. A voice folder's voice.json says its engine:
//   qwen-clone  Qwen3-TTS Base cloning a reference clip (video/voice/tts.py, run by video/voice/.venv). The house voice is one; so is
//               a quick clone of your own voice made from one short reading.
//   voxcpm2     VoxCPM2, with the folder's LoRA if it has one (the repo's voice/kit_voice/speak.py, run by the
//               voice tool's own venv, voice/.venv).
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {homedir} from 'node:os';
import {BuildError, fileSha, sha} from './util.mjs';

export const ENGINES = ['qwen-clone', 'voxcpm2'];

const readCard = (f) => {
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw new BuildError(`voice: ${f} isn't readable JSON (${e.message})`); }
};

/** The voice a build uses: --voice, else the film's voice.json, else the house voice. */
export function voiceName({paths, voice}) {
  if (voice) return voice;
  if (paths?.voiceFile && existsSync(paths.voiceFile)) {
    const v = readCard(paths.voiceFile).voice;
    if (typeof v !== 'string' || !v) throw new BuildError(`voice: ${paths.voiceFile} needs {"voice": "house"} or {"voice": "<voice folder name>"}`);
    return v;
  }
  return 'house';
}

// The narrator and what keys its lines: shared by the voicing and the check stage, so a missing voice stops the
// build before anything is voiced. A named voice that isn't there is an error, never a fallback to the house voice:
// falling back would change the narrator, and every timing with it.
export function voiceSetup({here, paths, voice: asked}) {
  const repo = resolve(here, '..');
  const dir = join(here, 'voice');
  const name = voiceName({paths, voice: asked});
  let card, folder;
  if (name === 'house') {
    folder = join(dir, 'house');
    card = readCard(join(folder, 'voice.json'));
  } else {
    const root = (process.env.KIT_VOICE_DIR || join(repo, 'voice/voices')).replace(/^~(?=\/|$)/, homedir());
    folder = name.includes('/') ? resolve(name.replace(/^~(?=\/|$)/, homedir())) : join(root, name);
    const vfile = join(folder, 'voice.json');
    if (!existsSync(vfile)) throw new BuildError(`voice: no voice "${name}": ${vfile} isn't there. Make one with the make-my-voice steps, set KIT_VOICE_DIR to the folder that holds your voices, or use --voice house.`);
    card = readCard(vfile);
  }
  const engine = card.engine ?? 'qwen-clone';
  if (!ENGINES.includes(engine)) throw new BuildError(`voice: ${name}'s voice.json says engine "${engine}"; the engines are ${ENGINES.join(', ')}`);
  // Paths in a voice folder's voice.json are relative to the folder; the house card's, to video/voice/.
  const base = name === 'house' ? dir : folder;
  const at = (f) => (isAbsolute(f) ? f : join(base, f));
  if (!card.ref_wav) throw new BuildError(`voice: ${name}'s voice.json names no ref_wav (its reference clip)`);
  const refWav = at(card.ref_wav);
  if (!existsSync(refWav)) throw new BuildError(`voice: the reference audio ${refWav} isn't there`);
  const refText = card.ref_text ?? (card.ref_text_file && existsSync(at(card.ref_text_file)) ? readFileSync(at(card.ref_text_file), 'utf8').trim() : null);
  if (!refText) throw new BuildError(`voice: ${name}'s voice.json needs ref_text (or ref_text_file): the words its reference clip says`);
  const voice = {...card, engine, mode: 'clone', ref_wav: refWav, ref_text: refText, seed: card.seed ?? 0, tempo: card.tempo ?? 1, said: card.said ?? {}};

  let run = null, setup;
  if (engine === 'voxcpm2') {
    // The own-voice tool's venv and speak script. A line's key is made of what the voice IS (LoRA weights, the speak
    // script and its pinned packages, the reference clip and its text, seed, tempo), never of where it is kept: moving
    // the voice folder re-voices nothing. Spellings stay out, as for qwen-clone: each line's key holds its text as said.
    const tool = join(repo, 'voice'), python = join(tool, '.venv/bin/python'), script = join(tool, 'kit_voice/speak.py');
    // The weights, where speak.py looks for them, so a missing model stops the build here, not mid-voicing.
    const model = join((process.env.KIT_VOICE_MODELS || process.env.KIT_MODELS || join(homedir(), 'Library/Caches/explainer-kit/models')).replace(/^~(?=\/|$)/, homedir()), 'VoxCPM2');
    for (const [what, f] of [['venv python', python], ['speak script', script], ['VoxCPM2 model', join(model, 'model.safetensors')]])
      if (!existsSync(f)) throw new BuildError(`voice: ${name} is a VoxCPM2 voice, but the own-voice ${what} ${f} isn't there. Run ./setup.sh --voice-train, or use --voice house.`);
    const lora = card.lora ? at(card.lora) : null;
    if (lora && !existsSync(join(lora, 'lora_weights.safetensors'))) throw new BuildError(`voice: the LoRA ${join(lora, 'lora_weights.safetensors')} isn't there`);
    const reqs = join(tool, 'requirements/voxcpm.txt');
    setup = sha('voxcpm2', lora ? fileSha(join(lora, 'lora_weights.safetensors')) : 'zero-shot', fileSha(script), existsSync(reqs) ? fileSha(reqs) : '', fileSha(refWav), refText, voice.seed, voice.tempo);
    run = {python, script, tool, lora, folder};
  } else {
    // What the voice sounds like, and nothing else: the reference clip's bytes and its words (from ref_text or
    // ref_text_file alike), seed, tempo, and the engine's own files. Notes, provenance and licence fields in voice.json
    // don't key a line, nor does where the clip is kept. `said` stays out too: a line's key already holds its text as
    // said, so a new spelling re-voices only the lines it changes.
    setup = sha('qwen-clone', {ref_text: refText, seed: voice.seed, tempo: voice.tempo}, fileSha(refWav), ...['models.lock.json', 'requirements.txt', 'tts.py'].map((f) => readFileSync(join(dir, f), 'utf8')));
  }
  // A voice's own spellings (`said` in its file, {written: said}), for words only that voice gets wrong; the script's
  // table stays the same for every voice. The speech check still expects the written line.
  const own = (t) => Object.entries(voice.said).reduce((s, [w, x]) => s.split(w).join(x), t);
  const keyed = (lines) => lines.map((l) => ({...l, said: own(l.said), key: sha(own(l.said), setup)}));
  return {dir, name, engine, folder, voice, refWav, run, setup, keyed, describe: name === 'house' ? 'house voice' : `${name} (${engine})`};
}

export function voiceLines(lines, {here, paths, voice: asked, setup: given, cache, pub, style, force = false, log}) {
  const {dir, voice, refWav, run: vox, keyed: keyLines, describe} = given ?? voiceSetup({here, paths, voice: asked});
  log(`voice: ${describe}, tempo ${voice.tempo}`);
  const vc = join(cache, 'voice');
  mkdirSync(vc, {recursive: true});
  mkdirSync(join(pub, 'voice'), {recursive: true});
  const keyed = keyLines(lines);
  const missing = keyed.filter((l) => force || !existsSync(join(vc, `${l.key}.asr.json`)));
  const py = join(dir, '.venv/bin/python');
  const run = (script, ...a) => spawnSync(py, ['-I', join(dir, script), ...a], {cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], env: {...process.env, KIT_MAX_WPS: String(style.voice.maxWps)}});
  // A line that fails the speech check is re-rolled with the next seed, up to RETRIES times; the
  // passing seed is kept with the line (its .asr.json), so the build stays reproducible.
  const RETRIES = +(process.env.KIT_VOICE_RETRIES ?? 3), {maxWps: MAX_WPS, targetWps: TARGET_WPS, maxStretch: MAX_STRETCH} = style.voice;
  const onlyTooFast = (a) => a.fail_reasons.length === 1 && a.words_per_sec > MAX_WPS && a.words_per_sec <= MAX_WPS * MAX_STRETCH;
  let todo = missing, failures = [];
  for (let attempt = 0; todo.length && attempt <= RETRIES; attempt++) {
    const seed = voice.seed + attempt;
    const jobKey = sha(todo.map((l) => l.key), seed);
    const out = join(vc, `job-${jobKey}`);
    const job = join(vc, `job-${jobKey}.json`);
    writeFileSync(job, JSON.stringify({lines: todo.map((l) => ({id: l.key, text: l.said, expect: l.text, seed})),
      voice: {...voice, ref_wav: refWav}, out_dir: out}));
    if (vox) {
      const linesJson = join(vc, `job-${jobKey}.lines.json`);
      // Each line carries its seed, so its audio depends on (voice, text, seed) and not on its place in the job.
      writeFileSync(linesJson, JSON.stringify(todo.map((l) => ({id: l.key, text: l.said, seed}))));
      // Tempo is applied below, as for every engine, so the speak script is told 1; spellings are already in the text.
      const r = spawnSync(vox.python, ['-I', vox.script, '--voice', vox.folder, '--ref-wav', refWav, '--ref-text', voice.ref_text,
        '--lines', linesJson, '--out', out, '--seed', String(seed), '--tempo', '1', '--lora', vox.lora ?? 'none'],
      {cwd: vox.tool, stdio: ['ignore', 'ignore', 'inherit'], env: {...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1'}});
      if (r.status !== 0) throw new BuildError('voice: the VoxCPM2 speak script failed');
      // The speech check reads each line's <id>.json, as tts.py writes it.
      for (const l of todo) writeFileSync(join(out, `${l.key}.json`), JSON.stringify({id: l.key, text: l.said, expect: l.text, seed}));
    } else if (run('tts.py', job).status !== 0) throw new BuildError('voice: tts.py failed');
    // The voice's pace (voice.json `tempo`; the house voice speaks 10% quicker than it was designed): atempo alone, so
    // the pitch is unchanged; applied before the speech check, which then judges the line at the pace it's heard.
    if (voice.tempo && voice.tempo !== 1) for (const l of todo) {
      const wav = join(out, `${l.key}.wav`), raw = join(out, `${l.key}.raw.wav`);
      copyFileSync(wav, raw);
      if (spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-filter:a', `atempo=${voice.tempo}`, wav]).status !== 0) throw new BuildError(`voice: tempo ${voice.tempo} failed on ${l.id}`);
    }
    const checked = run('asr_check.py', out, ...todo.map((l) => l.key));
    // It exits 1 when a line fails (that line is re-rolled below); it not running at all leaves no .asr.json.
    const unchecked = todo.filter((l) => !existsSync(join(out, `${l.key}.asr.json`)));
    if (checked.error || unchecked.length) throw new BuildError(`voice: the speech check didn't run (${checked.error?.code ?? `exit ${checked.status}, ${unchecked.length} line(s) unchecked`}); is video/voice/.venv set up? (run ./setup.sh)`);
    failures = [];
    for (const l of todo) {
      const asr = JSON.parse(readFileSync(join(out, `${l.key}.asr.json`), 'utf8'));
      if (!asr.passed && onlyTooFast(asr)) {
        // This voice rushes some short lines. Slow such a line toward the target pace, by at most
        // MAX_STRETCH in all (atempo is clean at that size), checking it again after each pass.
        const wav = join(out, `${l.key}.wav`), fast = join(out, `${l.key}.fast.wav`);
        copyFileSync(wav, fast);
        let tempo = 1, again = asr;
        for (let pass = 0; pass < 3 && !again.passed && onlyTooFast(again); pass++) {
          tempo = Math.max(tempo * TARGET_WPS / again.words_per_sec, 1 / MAX_STRETCH);
          spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', fast, '-filter:a', `atempo=${tempo.toFixed(4)}`, wav]);
          run('asr_check.py', out, l.key);
          again = JSON.parse(readFileSync(join(out, `${l.key}.asr.json`), 'utf8'));
        }
        if (again.passed) {
          again.stretched = +tempo.toFixed(4);
          writeFileSync(join(out, `${l.key}.asr.json`), JSON.stringify(again, null, 2));
          log(`voice: ${l.id} slowed to ${again.words_per_sec} words/s (tempo ${tempo.toFixed(3)})`);
          asr.passed = true;
        }
      }
      if (!asr.passed) { failures.push({l, asr}); continue; }
      copyFileSync(join(out, `${l.key}.wav`), join(vc, `${l.key}.wav`));
      copyFileSync(join(out, `${l.key}.asr.json`), join(vc, `${l.key}.asr.json`));
      const ok = JSON.parse(readFileSync(join(vc, `${l.key}.asr.json`), 'utf8'));
      log(`voice: ${l.id} passed the speech check: WER ${ok.wer}, ${ok.words_per_sec} words/s, ${ok.duration_s} s, seed ${seed}${attempt ? ` (re-roll ${attempt})` : ''}`);
    }
    todo = failures.map((f) => f.l);
  }
  if (failures.length) {
    throw new BuildError(`voice: ${failures.length} line(s) failed the speech check after ${RETRIES + 1} seeds:\n` +
      failures.map(({l, asr}) => `  ${l.id} "${l.text}": ${asr.fail_reasons.join('; ')} (heard "${asr.heard}")`).join('\n'));
  }
  log(`voice: ${lines.length} lines, ${missing.length} voiced, ${lines.length - missing.length} from cache`);
  return keyed.map((l) => {
    const asr = JSON.parse(readFileSync(join(vc, `${l.key}.asr.json`), 'utf8'));
    copyFileSync(join(vc, `${l.key}.wav`), join(pub, 'voice', `${l.key}.wav`));
    return {...l, src: `voice/${l.key}.wav`, duration: asr.duration_s, words: asr.words, wer: asr.wer};
  });
}
