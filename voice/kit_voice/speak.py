#!/usr/bin/env python3
"""Speak text in one of your voices (VoxCPM2, plus a LoRA for a fine-tuned voice, on Apple-silicon MPS). Local only; no denoiser.

  bin/speak --voice NAME --text "Hello there." --out out/
  bin/speak --voice NAME --lines lines.json --out out/ --seed 12 --tempo 1.1 --said '{"Markdown":"Mark-down"}'

Lines: --text "one line", or --lines as a JSON list ('["a","b"]'), a .json file (strings or {"id","text"}), or a text
file with one line per row. Each line becomes <id>.wav in --out (ids default to L01, L02, ...); timing.json lists them.
Line i is seeded with --seed + i, so the same lines, seed and voice give the same audio; a {"id","text","seed"} item is
seeded with its own seed instead, so its audio does not depend on its place in the list (the kit's video build does this).

The voice is a folder (voices/<name>: voice.json, lora_weights.safetensors, lora_config.json, reference.wav,
reference.txt), made by train/package_voice.py. --voice takes a folder or a name under voices/; $KIT_VOICE sets the default.
--ref-wav, --ref-text and --lora override the folder's, which is how a caller that keeps its own copy (the kit's video
build) drives it; `--lora none` is plain zero-shot cloning.
--said maps written words to how they should be spelled for the voice (JSON object or file): it is the caller's, not the
voice's. --tempo applies ffmpeg atempo (pitch unchanged); the untouched take is kept as <id>.raw.wav. --trim-head MS cuts the quiet
lead-in (0.3-0.9 s of room tone, sometimes a breath) down to MS before the first speech, faded in.

VoxCPM2 itself lives in $KIT_VOICE_MODELS/VoxCPM2 (else $KIT_MODELS/VoxCPM2, default ~/Library/Caches/explainer-kit/models);
./setup.sh fetches it. Heavy: one model load (~10 s), about 1.4x real time per line, and about 13 GiB of GPU memory in fp32.
Run it through the kit's scripts/run-heavy.sh, which takes the shared GPU lock. It speaks in float32 on MPS: the VoxCPM
library warns that bfloat16 and float16 glitch there, so do not set VOXCPM_MPS_DTYPE."""
import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOICES = ROOT / "voices"
MODELS = Path(os.environ.get("KIT_VOICE_MODELS") or os.environ.get("KIT_MODELS") or Path.home() / "Library/Caches/explainer-kit/models")


def trim_head(wav, sr, lead_ms, thresh_db=-36.0):
    """Cut the quiet lead-in (room tone, a breath) off the front of a line: keep `lead_ms` of it before the first 10 ms frame
    whose RMS is above `thresh_db` dBFS (speech jumps to about -25; the lead-in sits at -45 or lower), fading that bit in over
    its length so nothing starts with a click. A line with no such frame is returned unchanged."""
    import numpy as np
    w = np.asarray(wav, dtype=np.float32)
    fr = max(int(sr * 0.01), 1)
    n = len(w) // fr
    if n == 0:
        return w
    rms = np.sqrt((w[: n * fr].reshape(n, fr) ** 2).mean(axis=1))
    loud = np.nonzero(rms > 10 ** (thresh_db / 20))[0]
    if loud.size == 0:
        return w
    start = max(int(loud[0] * fr - sr * lead_ms / 1000), 0)
    out = w[start:].copy()
    k = min(int(sr * lead_ms / 1000), len(out))
    if k:
        out[:k] *= np.linspace(0.0, 1.0, k, dtype=np.float32)
    return out


def die(msg):
    print(f"speak: {msg}", file=sys.stderr)
    sys.exit(2)


def load_voice(path):
    if not path:
        made = sorted(p.parent.name for p in VOICES.glob("*/voice.json"))
        die("which voice? Pass --voice NAME or set KIT_VOICE" + (f" (yours: {', '.join(made)})" if made else " (none made yet: see the make-my-voice skill)"))
    d = Path(path).expanduser()
    if not d.is_dir() and (VOICES / path).is_dir():
        d = VOICES / path
    card = d / "voice.json"
    if not card.is_file():
        die(f"{d} isn't a voice folder (no voice.json)")
    v = json.loads(card.read_text())
    v["_dir"] = d
    return v


def read_lines(raw, text):
    if text is not None:
        items = [text]
    elif raw.lstrip().startswith("["):
        items = json.loads(raw)
    elif Path(raw).suffix == ".json":
        items = json.load(open(raw))
    else:
        items = [l.strip() for l in open(raw) if l.strip()]
    return [(it.get("id", f"L{i+1:02d}"), it["text"], it.get("seed")) if isinstance(it, dict) else (f"L{i+1:02d}", it, None) for i, it in enumerate(items)]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Speak text in one of your voices.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="one line to speak")
    src.add_argument("--lines", help="JSON list, JSON file (strings or {id,text}), or a text file with one line per row")
    ap.add_argument("--out", required=True, help="output folder: <id>.wav per line, plus timing.json")
    ap.add_argument("--voice", default=os.environ.get("KIT_VOICE", ""), help="voice folder, or a name under voices/ (default $KIT_VOICE)")
    ap.add_argument("--seed", type=int, default=None, help="line i uses seed+i (default: the voice's, usually 0)")
    ap.add_argument("--tempo", type=float, default=None, help="ffmpeg atempo factor, pitch unchanged (default: the voice's, 1)")
    ap.add_argument("--said", default="", help="JSON object or file mapping written words to the spelling the voice should say")
    ap.add_argument("--ref-wav", default="", help="reference clip (default: the voice's)")
    ap.add_argument("--ref-text", default=None, help="what the reference clip says (default: the voice's)")
    ap.add_argument("--lora", default=None, help="LoRA folder (lora_weights.safetensors + lora_config.json); 'none' = zero-shot (default: the voice's)")
    ap.add_argument("--model-dir", default="", help="VoxCPM2 weights folder (default $KIT_VOICE_MODELS/VoxCPM2)")
    ap.add_argument("--mode", choices=["ultimate", "reference"], default="ultimate",
                    help="ultimate = prompt audio+text continuation AND isolated reference (best similarity); reference = isolated reference only")
    ap.add_argument("--trim-head", type=int, default=None, metavar="MS",
                    help="cut the quiet lead-in off each line, keeping MS (e.g. 120) of it, faded in; off by default (the untrimmed take is kept as <id>.untrimmed.wav)")
    ap.add_argument("--device", default="mps")
    ap.add_argument("--cfg", type=float, default=2.0)
    ap.add_argument("--steps", type=int, default=10, help="diffusion timesteps")
    ap.add_argument("--max-len", type=int, default=1200)
    ap.add_argument("--compile", action="store_true", help="torch.compile (optimize=True); off by default")
    a = ap.parse_args(argv)

    voice = load_voice(a.voice)
    vdir = voice["_dir"]
    seed = a.seed if a.seed is not None else int(voice.get("seed", 0))
    tempo = a.tempo if a.tempo is not None else float(voice.get("tempo", 1))
    ref_wav = a.ref_wav or str(vdir / voice["ref_wav"])
    if a.ref_text is not None:
        ref_text = a.ref_text
    elif "ref_text_file" in voice:
        ref_text = (vdir / voice["ref_text_file"]).read_text().strip()
    else:
        ref_text = voice.get("ref_text", "")
    lora = a.lora if a.lora is not None else (str(vdir / voice["lora"]) if voice.get("lora") else "")
    if lora.lower() == "none":
        lora = ""
    said = {}
    if a.said:
        said = json.loads(Path(a.said).read_text() if not a.said.lstrip().startswith("{") else a.said)
    model = Path(a.model_dir) if a.model_dir else MODELS / "VoxCPM2"

    if not Path(ref_wav).is_file():
        die(f"the reference clip {ref_wav} isn't there")
    if not (model / "model.safetensors").is_file():
        die(f"VoxCPM2 isn't at {model}. Run ./setup.sh (it fetches openbmb/VoxCPM2 at the pinned revision), or set KIT_VOICE_MODELS.")
    if lora and not (Path(lora) / "lora_weights.safetensors").is_file():
        die(f"no lora_weights.safetensors in {lora}")
    if tempo != 1 and not shutil.which("ffmpeg", path="/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")):
        die("--tempo needs ffmpeg (brew install ffmpeg)")

    lines = read_lines(a.lines, a.text)

    def spoken(t):
        for w, x in said.items():
            t = t.replace(w, x)
        return t

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    import numpy as np, soundfile as sf, torch
    from voxcpm import VoxCPM

    kw = {}
    if lora:
        info = json.load(open(Path(lora) / "lora_config.json"))
        from voxcpm.model.voxcpm2 import LoRAConfig
        kw = dict(lora_config=LoRAConfig(**info["lora_config"]), lora_weights_path=str(lora))
    t = time.time()
    m = VoxCPM.from_pretrained(str(model), load_denoiser=False, optimize=a.compile, device=a.device, local_files_only=True, **kw)
    load_s = time.time() - t
    sr = m.tts_model.sample_rate
    print(f"loaded in {load_s:.1f}s, out sr {sr}, dtype {m.tts_model.config.dtype}", file=sys.stderr)
    gen = dict(reference_wav_path=ref_wav, cfg_value=a.cfg, inference_timesteps=a.steps, max_len=a.max_len)
    if a.mode == "ultimate" and ref_text:
        gen.update(prompt_wav_path=ref_wav, prompt_text=ref_text)
    rows = []
    for i, (lid, text, own_seed) in enumerate(lines):
        line_seed = int(own_seed) if own_seed is not None else seed + i
        torch.manual_seed(line_seed)
        t = time.time()
        said_text = spoken(text)
        wav = m.generate(text=said_text, **gen)
        if a.device == "mps":
            torch.mps.synchronize()
        dt = time.time() - t
        dur = len(wav) / sr
        dest = out / f"{lid}.wav"
        if a.trim_head is not None:
            sf.write(out / f"{lid}.untrimmed.wav", np.asarray(wav, dtype=np.float32), sr, subtype="PCM_16")
            wav = trim_head(wav, sr, a.trim_head)
        sf.write(dest, np.asarray(wav, dtype=np.float32), sr, subtype="PCM_16")
        if tempo != 1:
            raw = out / f"{lid}.raw.wav"
            shutil.copyfile(dest, raw)
            ff = shutil.which("ffmpeg", path="/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", ""))
            if subprocess.run([ff, "-v", "error", "-y", "-i", str(raw), "-filter:a", f"atempo={tempo}", str(dest)]).returncode != 0:
                die(f"tempo {tempo} failed on {lid}")
            dur = sf.info(dest).duration
        rows.append(dict(id=lid, text=text, seed=line_seed, said=said_text if said_text != text else None, duration_s=round(dur, 3), synth_s=round(dt, 2), rtf=round(dt / max(len(wav) / sr, 1e-6), 3)))
        print(f"{lid}: {dur:.2f}s audio in {dt:.1f}s (RTF {dt/max(len(wav)/sr,1e-6):.2f})", file=sys.stderr)
    peak = torch.mps.driver_allocated_memory() / 2**30 if a.device == "mps" else 0
    summary = dict(sr=sr, load_s=round(load_s, 1), dtype=m.tts_model.config.dtype, voice=voice.get("name"), voice_version=voice.get("version"),
                   lora=lora or None, seed=seed, tempo=tempo, mode=a.mode, mps_driver_gib=round(peak, 2), lines=rows)
    json.dump(summary, open(out / "timing.json", "w"), indent=2)


if __name__ == "__main__":
    main()
