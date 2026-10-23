#!/usr/bin/env python3
"""script/reading-script.md -> script/takes.json  ({"T01": {"split","lines"}, ...})."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = re.compile(r"^Read this one as\b")  # instruction paragraph under the T03 header


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.?!])\s+", text.strip()) if s.strip()]


def split_of(tid):
    return "ref" if tid == "T00" else "heldout" if tid.startswith("H") else "train"


def parse(md):
    takes, cur, in_t00 = {}, None, False
    for block in re.split(r"\n\s*\n", md):
        b = block.strip()
        m = re.match(r"\*\*([TH]\d+)\b[^*]*\*\*$", b)
        if m:
            cur = m.group(1); takes[cur] = {"split": split_of(cur), "lines": []}; continue
        if b.startswith("## T00"):
            cur, in_t00 = "T00", True; takes[cur] = {"split": "ref", "lines": []}; continue
        if b.startswith("## "):
            cur = None; in_t00 = False; continue
        if cur is None:
            continue
        if b.startswith(">"):  # T00 blockquote
            takes[cur]["lines"] += sentences(" ".join(l.lstrip("> ").strip() for l in b.splitlines()))
        elif re.match(r"\d+\.\s", b):
            takes[cur]["lines"] += [re.sub(r"^\d+\.\s+", "", l).strip() for l in b.splitlines()]
        elif cur != "T00" and not SKIP.match(b):  # prose take
            takes[cur]["lines"] += sentences(b.replace("\n", " "))
    return {k: v for k, v in takes.items() if v["lines"]}


if __name__ == "__main__":
    t = parse((ROOT / "script/reading-script.md").read_text())
    (ROOT / "script/takes.json").write_text(json.dumps(t, indent=1, ensure_ascii=False))
    for k, v in t.items():
        print(k, v["split"], len(v["lines"]))
