#!/usr/bin/env python3
"""Download the pinned score model(s) from models.lock.json into the models cache. Weights never enter the repo.
Run: .venv/bin/python -I fetch.py   (from video/score/)"""
import json, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = Path(os.environ.get("KIT_MODELS", Path.home() / "Library/Caches/explainer-kit/models"))


def main():
    from huggingface_hub import snapshot_download
    lock = json.load(open(HERE / "models.lock.json"))
    for repo, m in lock["models"].items():
        dest = MODELS / m["dir"]
        dest.mkdir(parents=True, exist_ok=True)
        snapshot_download(repo, revision=m["commit"], local_dir=str(dest))
        print(f"{repo}@{m['commit'][:10]} -> {dest}")


if __name__ == "__main__":
    main()
