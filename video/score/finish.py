#!/usr/bin/env python3
"""Make a generated bed sit under speech: clear the low end and the harsh top, carve a little speech room,
set a target loudness, keep the peaks under -1 dBFS, and write a 24-bit WAV (+ an m4a when asked).

Job: {"in":"raw.wav", "out":"bed.wav", "m4a":"bed.m4a", "lufs":-18, "peak_db":-1}
Chain: highpass 110 Hz, lowpass 9 kHz, -2.5 dB at 2.2 kHz (broad), then a linear gain to `lufs` (ebur128) and a
true limiter at peak_db. The kick/bass a model likes to add is what fights narration, so the highpass is
deliberate. Run: .venv/bin/python -I finish.py job.json   (from video/score/)
"""
import json, subprocess, sys

CHAIN = "highpass=f=110:poles=2,lowpass=f=9000:poles=2,equalizer=f=2200:width_type=q:width=0.7:g=-2.5"


def run(args):
    p = subprocess.run(["ffmpeg", "-nostats", "-v", "info", "-y", *args], capture_output=True, text=True)
    if p.returncode:
        sys.exit(p.stderr[-800:])
    return p.stderr


def measure(path, chain):
    err = run(["-i", path, "-af", f"{chain},ebur128", "-f", "null", "-"])
    return float([l for l in err.splitlines() if l.strip().startswith("I:")][-1].split()[1])


def main(job_path):
    j = json.load(open(job_path))
    target, peak = float(j.get("lufs", -18)), float(j.get("peak_db", -1))
    gain = target - measure(j["in"], CHAIN)
    chain = f"{CHAIN},volume={gain:.2f}dB,alimiter=limit={10 ** (peak / 20):.4f}:level=disabled:attack=5:release=80"
    run(["-i", j["in"], "-af", chain, "-c:a", "pcm_s24le", "-ar", "48000", j["out"]])
    if j.get("m4a"):
        run(["-i", j["out"], "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", j["m4a"]])
    print(json.dumps(dict(out=j["out"], gain_db=round(gain, 2), lufs=round(measure(j["out"], "anull"), 1))))


if __name__ == "__main__":
    main(sys.argv[1])
