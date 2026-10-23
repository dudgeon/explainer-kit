#!/usr/bin/env python3
"""Local background score: job JSON -> one stereo WAV per clip + <out>.json (ACE-Step 1.5 turbo, MLX/MPS).

Job: {"clips":[{"prompt":"...", "duration":30, "seed":7, "out":"/path/clip.wav",
                "bpm":90, "key":"C Major", "fade_in":1.0, "fade_out":2.0}], "steps":8, "thinking":true}
thinking=true runs the 1.7B planner LM first (better structure, slower); it keeps your prompt as written unless
a clip sets "rewrite_caption": true.
(or one clip's fields at the top level). bpm / key / fade_* / steps / thinking are optional.
Every clip is generated after seeding, so a clip's audio depends only on (prompt, duration, seed, bpm, key,
model, package): the same job gives the same file on the same machine and package versions.
Instrumental only: the lyrics are always "[Instrumental]". Weights are read from KIT_MODELS
(default ~/Library/Caches/explainer-kit/models/ACE-Step-1.5) and never fetched here (see fetch.py).
The checkpoint ships Python files that transformers runs (trust_remote_code); they are refused unless their
sha256 is one models.lock.json lists (code_sha256).
Run: .venv/bin/python -I score.py job.json   (from video/score/)
"""
import hashlib, json, os, shutil, sys, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = Path(os.environ.get("KIT_MODELS", Path.home() / "Library/Caches/explainer-kit/models"))
LOCK = json.load(open(HERE / "models.lock.json"))
MODEL_DIR = MODELS / LOCK["models"]["ACE-Step/Ace-Step1.5"]["dir"]
DIT, LM = "acestep-v15-turbo", "acestep-5Hz-lm-1.7B"

# Never fetch anything at run time; keep the package's caches out of the repo.
os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", ACESTEP_CHECKPOINTS_DIR=str(MODEL_DIR),
                  ACESTEP_LM_BACKEND="mlx", TOKENIZERS_PARALLELISM="false", HF_HUB_DISABLE_TELEMETRY="1")


def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def check_code():
    want = LOCK["models"]["ACE-Step/Ace-Step1.5"]["code_sha256"]
    found = {str(p.relative_to(MODEL_DIR)): sha256(p) for p in sorted(MODEL_DIR.rglob("*.py"))}
    if found.keys() != want.keys() or any(found[k] not in want[k] for k in found):
        sys.exit(f"score: the checkpoint's Python files differ from models.lock.json code_sha256; refusing to load.\n"
                 f"  found {json.dumps(found, indent=1)}")


def load(device):
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    dit, llm = AceStepHandler(), LLMHandler()
    status, ok = dit.initialize_service(project_root=str(HERE), config_path=DIT, device=device)
    if not ok:
        sys.exit(f"score: DiT failed to load: {status}")
    return dit, llm


def load_lm(llm, device):
    status, ok = llm.initialize(checkpoint_dir=str(MODEL_DIR), lm_model_path=LM, backend="mlx", device=device)
    if not ok:
        sys.exit(f"score: LM failed to load: {status}")


def seed_all(seed):
    import random
    import numpy as np
    import torch
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    try:
        import mlx.core as mx
        mx.random.seed(seed)
    except Exception:
        pass


def gen(dit, llm, clip, steps, thinking):
    import soundfile as sf
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    seed = int(clip.get("seed", 0))
    seed_all(seed)
    p = GenerationParams(caption=clip["prompt"], lyrics="[Instrumental]", instrumental=True,
                         duration=float(clip["duration"]), bpm=clip.get("bpm"), keyscale=clip.get("key", ""),
                         timesignature=str(clip.get("timesignature", "")), vocal_language="unknown",
                         inference_steps=steps, seed=seed, thinking=thinking, use_cot_caption=bool(clip.get("rewrite_caption", False)),
                         enable_normalization=False, fade_in_duration=float(clip.get("fade_in", 0)),
                         fade_out_duration=float(clip.get("fade_out", 0)))
    cfg = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[seed], audio_format="wav32")
    with tempfile.TemporaryDirectory(prefix="score-") as tmp:
        t = time.time()
        r = generate_music(dit, llm if thinking else None, p, cfg, save_dir=tmp)
        gen_s = time.time() - t
        if not r.success or not r.audios:
            sys.exit(f"score: generation failed: {r.error}")
        out = Path(clip["out"]); out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(r.audios[0]["path"], out)
    data, sr = sf.read(out, always_2d=True)
    meta = dict(prompt=clip["prompt"], seed=seed, bpm=clip.get("bpm"), key=clip.get("key", ""), steps=steps,
                thinking=thinking, duration_s=round(len(data) / sr, 3), sample_rate=sr, gen_s=round(gen_s, 2),
                rtf=round(gen_s / (len(data) / sr), 3), peak=round(float(abs(data).max()), 4))
    json.dump(meta, open(out.with_suffix(".json"), "w"), indent=2)
    print(f"{out.name}: {meta['duration_s']}s audio in {gen_s:.1f}s (RTF {meta['rtf']}), peak {meta['peak']}", file=sys.stderr)


def main(job_path):
    job = json.load(open(job_path))
    clips = job.get("clips") or [job]
    steps, thinking = int(job.get("steps", 8)), bool(job.get("thinking", True))
    check_code()
    import torch
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    t = time.time()
    dit, llm = load(device)
    if thinking:
        load_lm(llm, device)
    print(f"model load {time.time() - t:.1f}s on {device}", file=sys.stderr)
    for clip in clips:
        gen(dit, llm, clip, steps, thinking)


if __name__ == "__main__":
    main(sys.argv[1])
