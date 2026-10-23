#!/bin/bash
# Poll the takes folder ($TAKES_INBOX, default the iCloud Drive folder explainer-kit-takes) every 20 s; run check_take.py on
# each new/changed, fully-downloaded, size-stable audio file. Reports go to takes/report/watch.log; seen files in takes/report/seen.txt.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # ffmpeg (Homebrew), also when started from a bare shell
# Checking is light (Parakeet ASR): check_take.py takes a *shared* hold on the kit's GPU lock (scripts/gpu-lock.sh) by itself.
# GPU_LOCK_RUN, if set, is a command prefix that already holds the lock; the check then skips its own hold.
RUN=(); [ -n "${GPU_LOCK_RUN:-}" ] && read -r -a RUN <<< "$GPU_LOCK_RUN env GPU_LOCK_HELD=1"
DIR="${TAKES_INBOX:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/explainer-kit-takes}"   # the iCloud folder the Voice Memos are shared to
REP=takes/report; mkdir -p "$REP"; SEEN=$REP/seen.txt; LOG=$REP/watch.log; touch "$SEEN"
PREV=$(mktemp); CUR=$(mktemp); trap 'rm -f "$PREV" "$CUR"' EXIT
sig() { stat -f '%N|%z|%m' "$1"; }   # name|size|mtime
while true; do
  : > "$CUR"
  # ask iCloud to fetch placeholders (.name.ext.icloud)
  find "$DIR" -maxdepth 1 -name '.*.icloud' 2>/dev/null | while read -r ph; do
    base=$(basename "$ph" .icloud); real="$DIR/${base#.}"
    case "${real##*.}" in m4a|wav|caf|aiff|aif|mp3) brctl download "$real" ;; esac
  done
  find "$DIR" -maxdepth 1 -type f \( -iname '*.m4a' -o -iname '*.wav' -o -iname '*.caf' -o -iname '*.aiff' -o -iname '*.mp3' \) \
      ! -name '.*' 2>/dev/null | while read -r f; do
    s=$(sig "$f"); echo "$s" >> "$CUR"
    grep -qxF "$s" "$SEEN" && continue            # already processed
    grep -qxF "$s" "$PREV" || continue            # size/mtime must be unchanged for 2 polls
    echo "$s" >> "$SEEN"
    { echo "---- $(date '+%F %T') $f"; ${RUN[@]+"${RUN[@]}"} .venv-eval/bin/python -I tools/check_take.py "$f" 2>&1 | grep -v -i "userwarning\|warnings.warn"; } | tee -a "$LOG"
  done
  cp "$CUR" "$PREV"; sleep 20
done
