#!/usr/bin/env bash
# Run a heavy command (voicing, voice training, the score, a render) the safe way: memory preflight first, then the
# compute lock, so only one heavy job runs at a time.
#   scripts/run-heavy.sh [--task <task>] [--shared] <command...>
# The task is what scripts/preflight.sh checks. If you don't give one it is guessed from the command: train/lora ->
# train-full, score -> score, voice/speak/build -> voice-house, anything else -> render.
# The command runs with GPU_LOCK (the lock directory) and GPU_LOCK_HELD=1 exported, so any tool it starts that also
# wants the lock sees it is already held and carries on instead of waiting on itself. Models are used offline.
# The lock is $GPU_LOCK if set, else .gpu.lock in the kit's folder. KIT_SKIP_PREFLIGHT=1 skips the preflight (tests).
set -u
here="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; kit="$(dirname "$here")"
task=""; kind="--exclusive"
while [ $# -gt 0 ]; do case "$1" in
  --task) task="${2:?--task needs a task name}"; shift 2 ;;
  --shared) kind="--shared"; shift ;;
  -h|--help) sed -n 2,10p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  --) shift; break ;;
  *) break ;; esac; done
[ $# -gt 0 ] || { echo "usage: scripts/run-heavy.sh [--task <task>] [--shared] <command...>" >&2; exit 64; }

if [ -z "$task" ]; then
  case "$*" in
    *run_lora*|*train_voxcpm*|*train/*) task=train-full ;;
    *score*) task=score ;;
    *voice*|*speak*|*build.mjs*) task=voice-house ;;
    *) task=render ;;
  esac
fi

if [ "${KIT_SKIP_PREFLIGHT:-}" != 1 ]; then
  "$here/preflight.sh" "$task" || { s=$?; echo "run-heavy: not starting: preflight said no for '$task' (exit $s)" >&2; exit "$s"; }
fi

export GPU_LOCK="${GPU_LOCK:-$kit/.gpu.lock}"
export KIT_MODELS="${KIT_MODELS:-$HOME/Library/Caches/explainer-kit/models}"
export KIT_VIDEO_MODELS="${KIT_VIDEO_MODELS:-$KIT_MODELS}"
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
# gpu-lock.sh takes the lock (waiting its turn), then runs `env GPU_LOCK_HELD=1 <command>`; the marker is set for the
# command only, never for gpu-lock.sh itself, which would then skip the lock.
exec "$here/gpu-lock.sh" $kind "explainer-kit $task" env GPU_LOCK_HELD=1 "$@"
