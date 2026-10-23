// The background score: one ambient bed at least the length of the film, generated locally (ACE-Step 1.5, video/score/),
// finished to sit under speech, and checked by speech recognition so no word-like sounds slip in. Cached by
// everything that shapes it. The film mixes it from the voice timeline (src/scenes/Film.tsx, scoreGain).
//
// Without the music models (no score/.venv: `setup.sh --music` was not run), the kit's shipped bed is used instead:
// score/beds/house-ambient.m4a, the bed ACE-Step made once from score.json as shipped (its settings are recorded in
// score/beds/house-ambient.json). It is decoded into the cache under the same name a generated bed would have, so
// the rest of the build cannot tell the difference. It only stands for score.json as shipped: with other settings
// there is no bed to use until the music models are installed. KIT_SCORE_BEDS=<dir> looks for the shipped bed in
// another folder (tests).
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {BuildError, fileSha, sha} from './util.mjs';

const lufs = (file) => {
  const p = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], {encoding: 'utf8'});
  const m = [...(p.stderr ?? '').matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? +m[1] : null;
};

export function scoreBed({here, cache, pub, duration, voiceWavs, log}) {
  const dir = join(here, 'score');
  const cfg = JSON.parse(readFileSync(join(dir, 'score.json'), 'utf8'));
  // The bed is cut to the film by the film itself (its fade-out is the score's gain, Film.tsx), so any bed at least as
  // long as the film will do: a cached one is reused, and a new one is made at least 8 minutes long, in whole minutes,
  // so a change in the film's length doesn't make new music under review.
  const need = Math.ceil(duration + 1);
  const scripts = ['models.lock.json', 'score.py', 'finish.py'].map((f) => fileSha(join(dir, f)));
  const family = sha('bed', cfg.prompt, cfg.key, cfg.seed, cfg.steps, cfg.fade_in, cfg.fade_out, cfg.lufs, ...scripts).slice(0, 16);
  const sc = join(cache, 'score'); mkdirSync(sc, {recursive: true});
  const lengths = readdirSync(sc).map((f) => f.match(new RegExp(`^bed-${family}-(\\d+)\\.wav$`))?.[1]).filter(Boolean).map(Number).filter((l) => l >= need).sort((a, b) => a - b);
  // A bed made before this scheme, for exactly this length, is the same music: keep it.
  const legacy = join(sc, `bed-${sha(cfg.prompt, cfg.key, cfg.seed, cfg.steps, cfg.fade_in, cfg.fade_out, cfg.lufs, need, ...scripts).slice(0, 16)}.wav`);
  if (!lengths.length && existsSync(legacy)) { copyFileSync(legacy, join(sc, `bed-${family}-${need}.wav`)); lengths.push(need); }
  const len = lengths[0] ?? Math.max(480, Math.ceil(need / 60) * 60);
  const key = `${family}-${len}`;
  const bed = join(sc, `bed-${key}.wav`);
  const py = (venv, script, arg) => spawnSync(join(venv, '.venv/bin/python'), ['-I', join(venv, script), arg], {cwd: venv, stdio: ['ignore', 'ignore', 'inherit']});
  const venv = join(dir, '.venv/bin/python');
  if (!existsSync(bed) && !existsSync(venv)) {
    const shipped = shippedBed({dir, cfg, need, family, sc, log});
    return mixed({here, pub, cfg, voiceWavs, log, bed: shipped.bed, key: shipped.key});
  }
  if (!existsSync(bed)) {
    const raw = join(sc, `raw-${key}.wav`);
    const job = join(sc, `job-${key}.json`);
    writeFileSync(job, JSON.stringify({thinking: false, steps: cfg.steps, clips: [{prompt: cfg.prompt, key: cfg.key, duration: len, seed: cfg.seed, fade_in: cfg.fade_in, fade_out: cfg.fade_out, out: raw}]}));
    log(`score: generating ${len} s of bed (seed ${cfg.seed})`);
    if (py(dir, 'score.py', job).status !== 0) throw new BuildError('score: score.py failed');
    const fin = join(sc, `finish-${key}.json`);
    writeFileSync(fin, JSON.stringify({in: raw, out: bed, lufs: cfg.lufs}));
    if (py(dir, 'finish.py', fin).status !== 0) throw new BuildError('score: finish.py failed');
    // No words in the music: the voice's own recognizer listens to the bed.
    const chk = join(sc, `check-${key}`); mkdirSync(chk, {recursive: true});
    copyFileSync(bed, join(chk, 'bed.wav'));
    writeFileSync(join(chk, 'bed.json'), JSON.stringify({id: 'bed', text: ''}));
    py(join(here, 'voice'), 'asr_check.py', chk);
    const heard = JSON.parse(readFileSync(join(chk, 'bed.asr.json'), 'utf8')).words?.length ?? 0;
    if (heard > cfg.maxHeardWords) throw new BuildError(`score: speech recognition hears ${heard} words in the bed (seed ${cfg.seed}). Try another seed in score/score.json.`);
  } else log(`score: bed from cache (${len} s, for a ${need} s film)`);
  return mixed({here, pub, cfg, voiceWavs, log, bed, key});
}

// The settings that shape the music (not the mix levels): a shipped bed stands for exactly these.
const MUSIC = ['prompt', 'key', 'seed', 'steps', 'fade_in', 'fade_out', 'lufs'];

/** The shipped bed, decoded into the cache as bed-<family>-<seconds>.wav, the name a generated bed of that length has. */
function shippedBed({dir, cfg, need, family, sc, log}) {
  const beds = process.env.KIT_SCORE_BEDS ? process.env.KIT_SCORE_BEDS : join(dir, 'beds');
  const m4a = join(beds, 'house-ambient.m4a'), meta = join(dir, 'beds', 'house-ambient.json');
  const noMusic = 'the music models are not installed (no score/.venv; ./setup.sh --music installs them)';
  if (!existsSync(m4a)) throw new BuildError(`score: ${noMusic}, and the shipped bed ${m4a} is not there either. Build with --no-score, or install the music models.`);
  if (!existsSync(meta)) throw new BuildError(`score: ${noMusic}, and score/beds/house-ambient.json (what the shipped bed was made from) is missing`);
  const made = JSON.parse(readFileSync(meta, 'utf8')).made_from ?? {};
  const changed = MUSIC.filter((k) => JSON.stringify(made[k]) !== JSON.stringify(cfg[k]));
  if (changed.length) throw new BuildError(`score: score.json's ${changed.join(', ')} ${changed.length > 1 ? 'differ' : 'differs'} from the shipped bed's (score/beds/house-ambient.json), so it is not the music asked for, and ${noMusic}. Put those settings back, build with --no-score, or install the music models.`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', m4a], {encoding: 'utf8'});
  const seconds = Math.floor(+probe.stdout.trim());
  if (probe.status !== 0 || !(seconds > 0)) throw new BuildError(`score: ffprobe cannot read the shipped bed ${m4a}`);
  if (seconds < need) throw new BuildError(`score: the shipped bed is ${seconds} s and this film needs ${need} s; ${noMusic}. Shorten the film, build with --no-score, or install the music models.`);
  const key = `${family}-${seconds}`, bed = join(sc, `bed-${key}.wav`);
  if (existsSync(bed)) { log(`score: shipped bed from cache (${seconds} s, for a ${need} s film)`); return {bed, key}; }
  // The same format as a generated bed (finish.py writes 48 kHz stereo 24-bit), cut to whole seconds.
  const tmp = `${bed}.tmp.wav`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', m4a, '-t', String(seconds), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', tmp], {stdio: ['ignore', 'ignore', 'inherit']});
  if (r.status !== 0) throw new BuildError(`score: ffmpeg could not decode the shipped bed ${m4a}`);
  renameSync(tmp, bed);
  log(`score: the shipped bed (${seconds} s, score/beds/house-ambient.m4a) decoded to .cache/score/bed-${key}.wav`);
  return {bed, key};
}

// The bed into the film's public dir, and its levels against the voice.
function mixed({pub, cfg, voiceWavs, log, bed, key}) {
  mkdirSync(join(pub, 'score'), {recursive: true});
  copyFileSync(bed, join(pub, 'score', `bed-${key}.wav`));
  // Levels relative to the voice: the bed's gain while a line plays, between lines, and its swell at a topic change.
  const vl = voiceWavs.map(lufs).filter((x) => x !== null);
  const voice = vl.length ? vl.reduce((a, b) => a + b, 0) / vl.length : -18;
  const bedL = lufs(bed) ?? cfg.lufs;
  const gain = (db) => +Math.pow(10, (voice + db - bedL) / 20).toFixed(4);
  log(`score: voice ${voice.toFixed(1)} LUFS, bed ${bedL.toFixed(1)} LUFS; under speech ${cfg.speechDb} dB, in gaps ${cfg.gapDb} dB`);
  return {src: `score/bed-${key}.wav`, speech: gain(cfg.speechDb), gap: gain(cfg.gapDb), swell: gain(cfg.gapDb + cfg.swellDb), fadeIn: cfg.fade_in, fadeOut: cfg.fade_out};
}
