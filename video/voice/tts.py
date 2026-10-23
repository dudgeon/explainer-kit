#!/usr/bin/env python3
"""Local TTS: job JSON -> one mono WAV + <id>.json per line (Qwen3-TTS via mlx-audio).

Job: {"lines":[{"id":"S1-1","text":"..."}], "voice": {...}, "out_dir": "..."}
voice: {"mode":"design","description":"...","seed":N}
       {"mode":"clone","ref_wav":"...","ref_text":"...","seed":N}
Every line is synthesised after mx.random.seed(seed), so a line's audio depends only on
(voice, text, seed), not on its position in the job.
Run: .venv/bin/python -I tts.py job.json   (from video/voice/). Weights: $KIT_MODELS (default ~/Library/Caches/explainer-kit/models).
"""
import json, sys, time, os
from pathlib import Path

MODELS = Path(os.environ.get("KIT_MODELS", Path.home() / "Library/Caches/explainer-kit/models"))
MODEL_FOR = {"design": "Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16", "clone": "Qwen3-TTS-12Hz-1.7B-Base-bf16"}


def load(mode):
    from mlx_audio.tts.utils import load_model
    return load_model(str(MODELS / MODEL_FOR[mode]))


def synth(model, voice, text, seed):
    import mlx.core as mx
    import numpy as np
    mx.random.seed(int(seed))
    if voice["mode"] == "design":
        kw = dict(instruct=voice["description"])
    else:
        kw = dict(ref_audio=str(voice["ref_wav"]), ref_text=voice["ref_text"])
    parts = [np.array(r.audio, dtype=np.float32) for r in
             model.generate(text=text, lang_code="english", **kw)]
    return np.concatenate(parts), model.sample_rate


def main(job_path):
    import soundfile as sf
    job = json.load(open(job_path))
    voice, out = job["voice"], Path(job["out_dir"])
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    model = load(voice["mode"])
    load_s = time.time() - t0
    print(f"model load {load_s:.1f}s", file=sys.stderr)
    for line in job["lines"]:
        t = time.time()
        seed = int(line.get("seed", voice.get("seed", 0)))
        audio, sr = synth(model, voice, line["text"], seed)
        synth_s = time.time() - t
        sf.write(out / f"{line['id']}.wav", audio, sr, subtype="PCM_16")
        dur = len(audio) / sr
        meta = dict(id=line["id"], text=line["text"], expect=line.get("expect", line["text"]),
                    duration_s=round(dur, 3), sample_rate=sr, seed=seed, mode=voice["mode"],
                    synth_s=round(synth_s, 2), rtf=round(synth_s / dur, 3), load_s=round(load_s, 2))
        json.dump(meta, open(out / f"{line['id']}.json", "w"), indent=2)
        print(f"{line['id']}: {dur:.2f}s audio in {synth_s:.1f}s (RTF {synth_s/dur:.2f})", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
