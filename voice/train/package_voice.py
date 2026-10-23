#!/usr/bin/env python3
"""Package a trained LoRA checkpoint as a voice folder bin/speak can use.
  .venv/bin/python -I train/package_voice.py runs/NAME/ckpt/step_0000100 --name my-voice [--version 2]
Copies lora_weights.safetensors and lora_config.json (not the optimizer), and the reference clip and its text: by default
the cleanest T00 reading that tools/check_take.py kept (takes/seg/T00/T00_pick.wav + .txt), or those of another voice
folder with --from-voice. Writes voice.json; fill in its "description" and "eval" blocks afterwards. The base_model path the
trainer wrote into lora_config.json is replaced: it is machine-local. The folder lands in voices/, which git ignores: a voice
made from a real person's recording is personal data and stays on this Mac."""
import argparse, json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / "models.lock.json").read_text())["models"]["VoxCPM2"]

ap = argparse.ArgumentParser()
ap.add_argument("ckpt")
ap.add_argument("--name", required=True)
ap.add_argument("--version", type=int, default=1)
ap.add_argument("--from-voice", default="", help="voice folder to take the reference clip from (default: the T00 pick in takes/seg/T00)")
a = ap.parse_args()
ckpt = Path(a.ckpt)
if a.from_voice:
    src = Path(a.from_voice)
    old = json.loads((src / "voice.json").read_text())
    ref_wav, ref_txt = src / old["ref_wav"], src / old["ref_text_file"]
    seed, tempo = old.get("seed", 0), old.get("tempo", 1)
else:
    ref_wav, ref_txt = ROOT / "takes/seg/T00/T00_pick.wav", ROOT / "takes/seg/T00/T00_pick.txt"
    seed, tempo = 0, 1
for f in (ref_wav, ref_txt, ckpt / "lora_weights.safetensors", ckpt / "lora_config.json"):
    if not f.is_file():
        sys.exit(f"package_voice: {f} isn't there")
dst = ROOT / "voices" / a.name
dst.mkdir(parents=True, exist_ok=False)
shutil.copy(ckpt / "lora_weights.safetensors", dst)
cfg = json.loads((ckpt / "lora_config.json").read_text())
cfg["base_model"] = f"{LOCK['hf_repo']}@{LOCK['revision']}"
cfg["_note"] = "base_model is informational: the base weights are found at run time in $KIT_VOICE_MODELS/VoxCPM2"
(dst / "lora_config.json").write_text(json.dumps(cfg, indent=2) + "\n")
shutil.copy(ref_wav, dst / "reference.wav")
shutil.copy(ref_txt, dst / "reference.txt")
card = {"name": a.name, "version": a.version, "engine": "voxcpm2", "description": "", "base": f"{LOCK['hf_repo']}@{LOCK['revision']}",
        "lora": ".", "ref_wav": "reference.wav", "ref_text_file": "reference.txt", "seed": seed, "tempo": tempo,
        "trained": {"step": int(ckpt.name.split("_")[-1]) if "step_" in ckpt.name else None}, "eval": {}}
(dst / "voice.json").write_text(json.dumps(card, indent=2) + "\n")
print(f"wrote {dst}. Fill in voice.json's description and eval (eval/score.py's numbers for this step).")
