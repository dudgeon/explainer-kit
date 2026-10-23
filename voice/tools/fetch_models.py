#!/usr/bin/env python3
"""Fetch the base models the own-voice tools need, at the revisions pinned in models.lock.json, and check every file's sha256.
Called by setup.sh (run it with the repo's .venv python); idempotent, and silent on the network once a model is in place.

  fetch_models.py --models DIR [--set voxcpm2|eval] [--from DIR]

--from DIR: a folder that already holds the models (DIR/VoxCPM2, ...); they are cloned with `cp -c` (APFS copy-on-write, no
extra disk) instead of downloaded. A clone is still checked against the lock, so a stale copy is refused, not trusted."""
import argparse, hashlib, json, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETS = {"voxcpm2": ["VoxCPM2"], "eval": ["spkrec-ecapa-voxceleb", "parakeet-tdt-0.6b-v3"]}


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(d, spec):
    bad = [n for n, want in spec["files"].items() if not (d / n).is_file() or sha256(d / n) != want]
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--set", choices=list(SETS), default="voxcpm2")
    ap.add_argument("--from", dest="src", default="")
    a = ap.parse_args()
    lock = json.loads((ROOT / "models.lock.json").read_text())["models"]
    models = Path(a.models).expanduser()
    models.mkdir(parents=True, exist_ok=True)
    for name in SETS[a.set]:
        spec, d = lock[name], models / name
        stamp = d / ".kit-revision"
        if stamp.is_file() and stamp.read_text().strip() == spec["revision"]:
            print(f"{name}: in place at {spec['revision'][:8]}")
            continue
        if a.src and (Path(a.src).expanduser() / name).is_dir():
            if d.exists():
                shutil.rmtree(d)
            print(f"{name}: cloning from {a.src} (cp -c, no extra disk)")
            subprocess.run(["cp", "-cR", str(Path(a.src).expanduser() / name), str(d)], check=True)
        else:
            from huggingface_hub import snapshot_download
            print(f"{name}: downloading {spec['hf_repo']} @ {spec['revision'][:8]}")
            snapshot_download(spec["hf_repo"], revision=spec["revision"], local_dir=str(d), allow_patterns=list(spec["files"]))
        print(f"{name}: checking sha256 ...")
        bad = verify(d, spec)
        if bad:
            sys.exit(f"{name}: {', '.join(bad)} do not match models.lock.json; delete {d} and run setup.sh again")
        stamp.write_text(spec["revision"] + "\n")
        print(f"{name}: ok")


if __name__ == "__main__":
    main()
