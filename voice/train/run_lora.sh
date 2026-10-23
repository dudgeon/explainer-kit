#!/bin/bash
# Detached-friendly VoxCPM2 LoRA runner (MPS). Needs a Mac with 32 GB or more. Resumes automatically from runs/<name>/ckpt/latest.
#   nohup train/run_lora.sh NAME [--manifest runs/NAME/data/train.jsonl] [--val F] [--iters N]
#         [--stop-at HH:MM] [--steps-this-run N] [--save-interval N] [--yaml train/lora.yaml] [--no-gpu-lock] &
# Log: runs/NAME/train.log (append). Stop politely: kill -TERM <pid of python> (checkpoint is saved) or --stop-at.
# GPU lock: the kit has one lock, scripts/gpu-lock.sh. If the caller already holds it (scripts/run-heavy.sh exports
# GPU_LOCK_HELD=1), or with --no-gpu-lock, this runs as is; otherwise it re-runs itself under an exclusive hold for the whole
# run. Base weights come from $KIT_VOICE_MODELS/VoxCPM2 (./setup.sh). The make-my-voice skill says when and how to train.
set -u
ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS="${KIT_VOICE_MODELS:-${KIT_MODELS:-$HOME/Library/Caches/explainer-kit/models}}"
cd "$ROOT" || exit 1
NAME=${1:?run name}; shift
ALL_ARGS=("$@")
RUN=$ROOT/runs/$NAME; mkdir -p "$RUN"
MANIFEST=$RUN/data/train.jsonl; VAL=""; ITERS=""; STOP=""; STEPS=""; SAVE=""; LOCK=1; YAML=$ROOT/train/lora.yaml
while [ $# -gt 0 ]; do case $1 in
  --manifest) MANIFEST=$2; shift 2;; --val) VAL=$2; shift 2;; --iters) ITERS=$2; shift 2;;
  --stop-at) STOP=$2; shift 2;; --steps-this-run) STEPS=$2; shift 2;; --save-interval) SAVE=$2; shift 2;;
  --yaml) YAML=$2; shift 2;; --no-gpu-lock) LOCK=0; shift;; *) echo "unknown $1"; exit 2;; esac; done
[ "${GPU_LOCK_HELD:-}" = 1 ] && LOCK=0
[ -f "$MANIFEST" ] || { echo "no manifest $MANIFEST (run train/build_manifest.py)"; exit 2; }
[ -f "$MODELS/VoxCPM2/model.safetensors" ] || { echo "no VoxCPM2 in $MODELS (run ./setup.sh)"; exit 2; }
[ -x "$ROOT/.venv/bin/python" ] || { echo "no $ROOT/.venv (run ./setup.sh)"; exit 2; }
if [ "$LOCK" = 1 ]; then
  LOCKSH="$ROOT/../scripts/gpu-lock.sh"
  [ -f "$LOCKSH" ] || { echo "no $LOCKSH: run this inside the kit, or pass --no-gpu-lock if you hold the GPU lock yourself"; exit 2; }
  exec bash "$LOCKSH" --exclusive kit-voice-train env GPU_LOCK_HELD=1 "$ROOT/train/run_lora.sh" "$NAME" ${ALL_ARGS[@]+"${ALL_ARGS[@]}"}
fi
CFG=$RUN/config.yaml
"$ROOT/.venv/bin/python" -I - "$YAML" "$CFG" "$MANIFEST" "$VAL" "$RUN" "$ITERS" "$STOP" "$STEPS" "$SAVE" "$MODELS/VoxCPM2" <<'PY'
import sys, yaml
src, dst, man, val, run, iters, stop, steps, save, base = sys.argv[1:11]
c = yaml.safe_load(open(src))
c.update(pretrained_path=base, train_manifest=man, val_manifest=val or None, save_path=run + "/ckpt", tensorboard=run + "/tb")
if iters: c.update(num_iters=int(iters), max_steps=int(iters))
if stop: c["stop_at"] = stop
if steps: c["stop_after_steps"] = int(steps)
if save: c["save_interval"] = int(save)
yaml.safe_dump(c, open(dst, "w"))
PY
ARGS=(--config_path "$CFG")
echo "=== $(date) start $NAME resume_from=$( [ -d "$RUN/ckpt/latest" ] && cat "$RUN/ckpt/latest/training_state.json" || echo none ) args=${ARGS[*]}" >> "$RUN/train.log"
PYTORCH_ENABLE_MPS_FALLBACK=1 caffeinate -i "$ROOT/.venv/bin/python" -I "$ROOT/train/train_voxcpm_finetune.py" "${ARGS[@]}" >> "$RUN/train.log" 2>&1
RC=$?
echo "=== $(date) exit $RC" >> "$RUN/train.log"
exit $RC
