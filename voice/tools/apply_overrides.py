"""Apply script/overrides.json to the segment JSONs in takes/seg (text as spoken, or flag a dropped line)."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
for key, fix in json.load(open(root / "script/overrides.json")).items():
    if key.startswith("_"): continue
    take = key.split("_")[0]
    p = root / "takes/seg" / take / f"{key}.json"
    if not p.exists(): continue
    seg = json.load(open(p))
    if "text" in fix: seg["text"], seg["flag"], seg["override"] = fix["text"], False, True
    if fix.get("drop"): seg["flag"], seg["override"] = True, "drop"
    json.dump(seg, open(p, "w"), indent=1)
    print(key, "->", "dropped" if fix.get("drop") else seg["text"])
