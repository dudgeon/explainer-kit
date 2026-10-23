"""Print the Parakeet transcript of each audio file given (identify takes). GPU: run it through scripts/run-heavy.sh."""
import os, sys, subprocess, tempfile
from pathlib import Path
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")
from parakeet_mlx import from_pretrained
m = from_pretrained(str(Path(os.environ.get("KIT_VOICE_MODELS") or os.environ.get("KIT_MODELS") or Path.home() / "Library/Caches/explainer-kit/models") / "parakeet-tdt-0.6b-v3"))
for f in sys.argv[1:]:
    with tempfile.TemporaryDirectory() as d:
        w = Path(d) / "a.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", "16000", str(w)], check=True)
        r = m.transcribe(str(w))
        print("==", Path(f).name, "\n", r.text.strip(), "\n", flush=True)
