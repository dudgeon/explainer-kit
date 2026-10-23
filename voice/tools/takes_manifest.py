#!/usr/bin/env python3
"""Write takes/manifest.json: every recorded take, its sha256 and duration, its role (ref / train / heldout), and what the
checker made of it (clips kept, flagged, dropped). Re-run after tools/check_take.py on a new take.
  .venv-eval/bin/python -I tools/takes_manifest.py"""
import hashlib, json
from pathlib import Path
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
script = json.loads((ROOT / "script/takes.json").read_text())
out = {"_note": "Your own recordings (Voice Memos, .m4a, 48 kHz). Cut into one clip per script line under takes/seg/<take>/. T00 is the voice's reference clip; T01-T12 are training takes; H1-H2 are held out for scoring. Personal data: never commit takes/.", "takes": {}}
for take, spec in script.items():
    raw = ROOT / "takes/raw" / f"{take}.m4a"
    seg = ROOT / "takes/seg" / take
    clips = sorted(seg.glob(f"{take}_*.json")) if seg.is_dir() else []
    meta = [json.loads(p.read_text()) for p in clips]
    rep = ROOT / "takes/report" / f"{take}.json"
    entry = {"split": spec.get("split"), "script_lines": len(spec.get("lines", [])),
             "raw": raw.name if raw.is_file() else None,
             "sha256": hashlib.sha256(raw.read_bytes()).hexdigest() if raw.is_file() else None,
             "clips": len(meta), "clips_flagged_or_dropped": sum(1 for m in meta if m.get("flag")),
             "clip_minutes": round(sum(sf.info(p.with_suffix(".wav")).duration for p in clips if p.with_suffix(".wav").is_file()) / 60, 2)}
    if rep.is_file():
        r = json.loads(rep.read_text())
        entry.update(duration_s=r.get("duration_s"), verdict=r.get("verdict"), snr_db=r.get("snr_db"), wer=r.get("wer"))
    out["takes"][take] = entry
(ROOT / "takes/manifest.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps(out["takes"], indent=1))
