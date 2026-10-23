#!/usr/bin/env python3
"""Score TTS systems on eval/lines.json. Usage:
  .venv-eval/bin/python -I eval/score.py [--systems a,b,c]    (GPU: run it through scripts/run-heavy.sh)
SIM = cosine(ECAPA speaker embedding of clip, centroid of your real reference clips); WER via Parakeet.
Writes eval/scores.json (or --out FILE: use it for a new version, so earlier numbers are not overwritten). Everything local."""
import argparse, json, os, sys, time
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from check_take import norm, spoken_numbers, MODEL as ASR_MODEL, best_window   # text normalisation shared with take checks
SEG = ROOT / "takes" / "seg"
ECAPA = Path(os.environ.get("KIT_VOICE_MODELS") or os.environ.get("KIT_MODELS") or Path.home() / "Library/Caches/explainer-kit/models") / "spkrec-ecapa-voxceleb"   # ./setup.sh --eval fetches it

_emb_model = None
def load_ecapa():
    global _emb_model
    if _emb_model is None:
        import torch
        from speechbrain.lobes.features import Fbank
        from speechbrain.lobes.models.ECAPA_TDNN import ECAPA_TDNN
        from speechbrain.processing.features import InputNormalization
        fb = Fbank(n_mels=80); nm = InputNormalization(norm_type="sentence", std_norm=False)
        m = ECAPA_TDNN(80, channels=[1024]*4+[3072], kernel_sizes=[5,3,3,3,1], dilations=[1,2,3,4,1],
                       attention_channels=128, lin_neurons=192)
        m.load_state_dict(torch.load(ECAPA / "embedding_model.ckpt", map_location="cpu", weights_only=True))
        m.eval(); _emb_model = (fb, nm, m)
    return _emb_model

def read16k(path):
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    if sr != 16000:
        from math import gcd
        g = gcd(sr, 16000); x = resample_poly(x, 16000 // g, sr // g).astype("float32")
    return x

def embed(path):
    import torch
    fb, nm, m = load_ecapa()
    x = torch.from_numpy(read16k(path))[None]
    with torch.no_grad():
        f = fb(x); f = nm(f, torch.ones(1))
        e = m(f).squeeze()
    e = e.numpy().astype("float64")
    return e / np.linalg.norm(e)

def cos(a, b): return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
def centroid(es): c = np.mean(es, axis=0); return c / np.linalg.norm(c)

_asr = None
def transcribe(path):
    global _asr
    if _asr is None:
        from parakeet_mlx import from_pretrained
        _asr = from_pretrained(str(ASR_MODEL))
    return _asr.transcribe(str(path)).text

def wer(ref, hyp):
    r, h = spoken_numbers(norm(ref)), spoken_numbers(norm(hyp))
    if not r: return None
    n, m = len(r), len(h)
    d = list(range(m + 1))
    for i in range(1, n + 1):
        prev, d[0] = d[0], i
        for j in range(1, m + 1):
            cur = min(d[j] + 1, d[j-1] + 1, prev + (r[i-1] != h[j-1]))
            prev, d[j] = d[j], cur
    return d[m] / n

def clip_stats(path, text):
    info = sf.info(str(path)); dur = info.frames / info.samplerate
    return dur, (len(norm(text)) / dur if dur else None)

def mean(v):
    v = [x for x in v if x is not None]
    return float(np.mean(v)) if v else None

def real_clips(lines):
    """Held-out real recordings if present, else T01-T03 training clips. -> (clips, source)
    clip = dict(id, path, text, line_id|None)."""
    H = []
    for ln in lines:
        if ln["set"] != "heldout": continue
        grp, n = ln["id"].split("-")   # H1-3
        p = SEG / grp / f"{grp}_{int(n):02d}.wav"
        if p.exists():
            H.append(dict(id=ln["id"], path=p, text=ln["text"], line_id=ln["id"]))
    if H: return H, "heldout"
    T = []
    for t in ("T01", "T02", "T03"):
        for p in sorted((SEG / t).glob(f"{t}_*.wav")):
            j = p.with_suffix(".json")
            text = json.loads(j.read_text()).get("text", "") if j.exists() else ""
            T.append(dict(id=p.stem, path=p, text=text, line_id=None))
    return T, "training"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--systems", default=""); ap.add_argument("--out", default="eval/scores.json")
    a = ap.parse_args()
    lines = json.loads((ROOT / "eval/lines.json").read_text())
    out = ROOT / "eval/out"
    systems = [s for s in a.systems.split(",") if s] or sorted(d.name for d in out.iterdir() if d.is_dir())
    t0 = time.time()
    real, source = real_clips(lines)
    print(f"real reference: {len(real)} {source} clips", file=sys.stderr)
    if len(real) < 2: sys.exit("need >=2 real reference clips")
    for c in real: c["emb"] = embed(c["path"])
    cent = centroid([c["emb"] for c in real])

    # real row: leave-one-out ceiling
    rrow = []
    for i, c in enumerate(real):
        others = centroid([o["emb"] for j, o in enumerate(real) if j != i])
        hyp = transcribe(c["path"]); dur, wps = clip_stats(c["path"], c["text"])
        rrow.append(dict(id=c["id"], sim=cos(c["emb"], others), wer=wer(c["text"], hyp) if c["text"] else None, dur=dur, wps=wps))
        print(f"real {c['id']}: sim {rrow[-1]['sim']:.3f}", file=sys.stderr)
    realmap = {c["line_id"]: c for c in real if c["line_id"]}

    res = {"reference": {"source": source, "n": len(real)}, "real": {
        "sim_heldout": mean(r["sim"] for r in rrow), "sim_video": None, "wer": mean(r["wer"] for r in rrow),
        "wps": mean(r["wps"] for r in rrow), "clips": rrow}, "systems": {}}
    for s in systems:
        rows = []
        for ln in lines:
            p = out / s / f"{ln['id']}.wav"
            if not p.exists(): continue
            e = embed(p); hyp = transcribe(p); dur, wps = clip_stats(p, ln["text"])
            row = dict(id=ln["id"], set=ln["set"], sim=cos(e, cent), wer=wer(ln["text"], hyp), dur=dur, wps=wps, asr=hyp)
            if ln["id"] in realmap and source == "heldout":
                row["sim_same_line"] = cos(e, realmap[ln["id"]]["emb"])
            rows.append(row)
        sel = lambda st, k: mean(r[k] for r in rows if r["set"] == st)
        res["systems"][s] = {"sim_heldout": sel("heldout", "sim"), "sim_video": sel("video", "sim"),
                             "sim_same_line": mean(r.get("sim_same_line") for r in rows),
                             "wer": mean(r["wer"] for r in rows), "wps": mean(r["wps"] for r in rows),
                             "n": len(rows), "lines": rows}
        print(f"scored {s}: {len(rows)} lines", file=sys.stderr)
    (ROOT / a.out).write_text(json.dumps(res, indent=1))

    f = lambda v, d=3: "-" if v is None else f"{v:.{d}f}"
    print(f"\nreference: {source} ({len(real)} clips)\n")
    print(f"{'system':24} {'SIM held':>9} {'SIM video':>10} {'WER':>7} {'wps':>5}  n")
    r = res["real"]; print(f"{'real (ceiling)':24} {f(r['sim_heldout']):>9} {'-':>10} {f(r['wer']):>7} {f(r['wps'],2):>5}  {len(rrow)}")
    for s, v in res["systems"].items():
        print(f"{s:24} {f(v['sim_heldout']):>9} {f(v['sim_video']):>10} {f(v['wer']):>7} {f(v['wps'],2):>5}  {v['n']}")
    print(f"({time.time()-t0:.0f}s)", file=sys.stderr)

if __name__ == "__main__": main()
