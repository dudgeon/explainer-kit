"""Copy numbered raw outputs to eval/out/<system>/<line id>.wav in eval/lines.json order.
map_raw.py RAW_DIR OUT_DIR PATTERN   (PATTERN like 'L{:02d}.wav' or '{:02d}.wav')"""
import json, shutil, sys
from pathlib import Path
raw, out, pat = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
root = Path(__file__).resolve().parents[1]
out.mkdir(parents=True, exist_ok=True)
for i, ln in enumerate(json.load(open(root / "eval/lines.json")), 1):
    if (raw / pat.format(i)).is_file():   # a partial run (EVAL_N) voices only the first lines
        shutil.copy(raw / pat.format(i), out / f"{ln['id']}.wav")
