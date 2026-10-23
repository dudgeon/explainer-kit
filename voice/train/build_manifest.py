#!/usr/bin/env python3
"""Build a VoxCPM2 training manifest (jsonl: {"audio": abs path, "text", "duration"[, "ref_audio"]}).
Segments: <seg-root>/<TAKE>/<TAKE>_<nn>.wav + .json {"text","flag"}. Flagged clips are skipped
(also clips with "wer" > --max-wer if that key is present and the flag is absent).
Takes: --takes T01,T02 or default = every take with split "train" in script/takes.json.
Hold out --val-frac (deterministic by clip name) into a val manifest.
Run: .venv/bin/python -I train/build_manifest.py --out runs/NAME/data [--ref-wav R.wav]"""
import argparse, hashlib, json
from pathlib import Path
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seg-root", default=str(ROOT / "takes/seg"))
    ap.add_argument("--takes", default="", help="comma list; default = split 'train' in --takes-json")
    ap.add_argument("--takes-json", default=str(ROOT / "script/takes.json"))
    ap.add_argument("--out", required=True, help="dir for train.jsonl / val.jsonl")
    ap.add_argument("--val-frac", type=float, default=0.0)
    ap.add_argument("--max-wer", type=float, default=None)
    ap.add_argument("--min-s", type=float, default=0.8)
    ap.add_argument("--max-s", type=float, default=20.0)
    ap.add_argument("--ref-wav", default="", help="optional ref_audio (voice reference) added to every row")
    a = ap.parse_args()
    takes = [t for t in a.takes.split(",") if t] or [k for k, v in json.load(open(a.takes_json)).items() if v.get("split") == "train"]
    seg = Path(a.seg_root); rows = []; skipped = []
    for t in sorted(takes):
        for wav in sorted((seg / t).glob(f"{t}_*.wav")):
            meta = json.load(open(wav.with_suffix(".json")))
            if meta.get("flag"): skipped.append((wav.name, "flag")); continue
            if a.max_wer is not None and meta.get("wer", 0) > a.max_wer: skipped.append((wav.name, "wer")); continue
            info = sf.info(wav); dur = info.frames / info.samplerate
            if not (a.min_s <= dur <= a.max_s): skipped.append((wav.name, f"dur {dur:.1f}")); continue
            r = {"audio": str(wav.resolve()), "text": meta["text"].strip(), "duration": round(dur, 3)}
            if a.ref_wav: r["ref_audio"] = str(Path(a.ref_wav).resolve())
            rows.append(r)
    def is_val(r): return int(hashlib.md5(Path(r["audio"]).name.encode()).hexdigest(), 16) % 1000 < a.val_frac * 1000
    val = [r for r in rows if is_val(r)]; train = [r for r in rows if not is_val(r)]
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for name, rs in (("train", train), ("val", val)):
        if rs or name == "train":
            with open(out / f"{name}.jsonl", "w") as f:
                for r in rs: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"takes {takes}: train {len(train)} clips {sum(r['duration'] for r in train)/60:.1f} min, val {len(val)}, skipped {skipped}")

if __name__ == "__main__":
    main()
