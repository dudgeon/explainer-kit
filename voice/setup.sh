#!/bin/bash
# Set up the own-voice tools on this Mac: a Python 3.12 venv from pinned requirements, and VoxCPM2 at the pinned revision.
#   ./setup.sh                 speak + train: .venv, and VoxCPM2 in $KIT_VOICE_MODELS
#   ./setup.sh --eval          also the take checker and the scorer: .venv-eval, Parakeet ASR, the ECAPA speaker model
#   ./setup.sh --from DIR      clone models already on this Mac (DIR/VoxCPM2, ...) with `cp -c` instead of downloading
# Idempotent: a finished step is skipped, and a finished setup never touches the network.
# Models go to ${KIT_VOICE_MODELS:-${KIT_MODELS:-~/Library/Caches/explainer-kit/models}} (5 GB for VoxCPM2). Needs Apple silicon and uv.
set -eu
root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
models="${KIT_VOICE_MODELS:-${KIT_MODELS:-$HOME/Library/Caches/explainer-kit/models}}"
eval_too=0; from="${KIT_VOICE_MODELS_FROM:-}"
while [ $# -gt 0 ]; do case $1 in
  --eval) eval_too=1; shift;;
  --from) from="${2:?--from needs a folder}"; shift 2;;
  -h|--help) sed -n 2,8p "$0" | sed 's/^# \{0,1\}//'; exit 0;;
  *) echo "setup: unknown option $1 (see ./setup.sh --help)" >&2; exit 2;; esac; done

[ "$(uname -m)" = arm64 ] || echo "setup: warning: this is not Apple silicon; speak uses the MPS GPU and won't work here" >&2
command -v uv >/dev/null || { echo "setup: uv isn't installed (brew install uv)" >&2; exit 2; }
command -v ffmpeg >/dev/null || [ -x /opt/homebrew/bin/ffmpeg ] || echo "setup: note: ffmpeg is missing (brew install ffmpeg); --tempo and the take checker need it" >&2

venv() {  # venv <dir> <requirements file>: make or refresh a venv only when its pinned requirements changed
  local dir="$root/$1" req="$root/$2" want have=""
  want="$(shasum -a 256 "$req" | cut -d' ' -f1)"
  [ -f "$dir/.requirements.sha256" ] && have="$(cat "$dir/.requirements.sha256")"
  if [ "$want" = "$have" ] && [ -x "$dir/bin/python" ]; then echo "$1: up to date"; return; fi
  [ -x "$dir/bin/python" ] || uv venv --python 3.12 "$dir"
  uv pip install --python "$dir/bin/python" -r "$req"
  echo "$want" > "$dir/.requirements.sha256"
  echo "$1: ready"
}

venv .venv requirements/voxcpm.txt
args=(--models "$models"); [ -n "$from" ] && args+=(--from "$from")
"$root/.venv/bin/python" -I "$root/tools/fetch_models.py" "${args[@]}" --set voxcpm2
if [ "$eval_too" = 1 ]; then
  venv .venv-eval requirements/eval.txt
  "$root/.venv/bin/python" -I "$root/tools/fetch_models.py" "${args[@]}" --set eval
fi
echo "setup: done. Try: $root/bin/speak --voice <your voice> --text \"Hello, this is a test.\" --out /tmp/voice-test"
