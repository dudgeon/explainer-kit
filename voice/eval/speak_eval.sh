#!/bin/bash
# Voice every eval line with one system, ready for score.py:
#   eval/speak_eval.sh <system name> [bin/speak options, e.g. --lora runs/v2/ckpt/step_0000100]
# Writes eval/raw/<name>/L01.wav… and maps them to eval/out/<name>/<line id>.wav (the order of eval/lines.json).
# EVAL_N=2 voices only the first 2 lines (a smoke run). GPU: run it through the kit's lock wrapper:
#   scripts/run-heavy.sh voice/eval/speak_eval.sh <name> …
set -eu
root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="${1:?usage: eval/speak_eval.sh <system name> [speak options]}"; shift
lines="$root/eval/lines-text.json"
if [ -n "${EVAL_N:-}" ]; then lines="$(mktemp -t evallines).json"; "$root/.venv/bin/python" -I -c "import json,sys;json.dump(json.load(open(sys.argv[1]))[:int(sys.argv[2])],open(sys.argv[3],'w'))" "$root/eval/lines-text.json" "$EVAL_N" "$lines"; fi
"$root/bin/speak" --lines "$lines" --out "$root/eval/raw/$name" "$@"
"$root/.venv-eval/bin/python" -I "$root/eval/map_raw.py" "$root/eval/raw/$name" "$root/eval/out/$name" 'L{:02d}.wav'
