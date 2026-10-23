#!/bin/bash
# check-gpu-lock.sh: proof for gpu-lock.sh's ticket queue, on a scratch lock (never the real one):
#  - a bare-mkdir holder D has the lock first;
#  - a dead ticket (a pid that's gone) sits at the front of the queue;
#  - A, B, C queue through gpu-lock.sh 0.5 s apart, each `sleep 2`;
#  - E, a bare-mkdir contender, retries every 0.5 s from the start and holds for 1 s when it wins.
#  - F queues and is stopped while waiting; G meets a lock that never got an owner (GPU_LOCK_ORPHAN=2).
#  - H waits behind an owner it can't signal (pid 1: kill -0 says "not permitted"), which must be waited on, not cleared;
#  - I: a bare holder releases and re-takes in a tight loop while J and K are queued at the front: never two at once;
#  - a bare script that releases twice (an unlock plus the same unlock again from an EXIT trap) deletes Q's lock while Q's job
#    runs; Q must warn, and Q's release must leave the next holder's lock alone.
# Shared and exclusive holds, with GPU_LOCK_SHARED_SLOTS=2:
#  - S1, S2, S3 shared: S1 and S2 run together, S3 waits for a slot;
#  - X exclusive queues behind a running shared job, then A2 shared queues behind X: X waits for the shared job, A2
#    waits for X although a slot is free, and X runs alone;
#  - a mix of 12 shared and exclusive jobs: an exclusive job never overlaps another job, and never more than 2 shared;
#  - dead holders in both shared slots are cleared, for an exclusive job and for a shared one.
# Expect: the dead ticket cleared, A then B then C in ticket order, no two holders ever overlapping, F's ticket gone,
# and G running once the ownerless lock is cleared.
# Also: the default lock path (no GPU_LOCK) is the kit's own .gpu.lock; a nested call under GPU_LOCK_HELD=1 runs
# straight through; run-heavy.sh runs a command inside the lock and exports GPU_LOCK and GPU_LOCK_HELD=1 to it.
#   scripts/check-gpu-lock.sh   (about 45 s, in a scratch folder under $TMPDIR)
# This only ever uses a scratch lock: GPU_LOCK is forced into the scratch folder, and the script refuses to start if
# it would not be.
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d "${TMPDIR:-/tmp}/lockq.XXXX")"; L="$T/gpu.lock"; LOG="$T/events.log"
export GPU_LOCK="$L" GPU_LOCK_POLL=0.2
unset GPU_LOCK_HELD
case "$GPU_LOCK" in "$T"/*) ;; *) echo "check-gpu-lock: the lock is not in the scratch folder; refusing" >&2; exit 2;; esac
trap 'rm -rf "$T"' EXIT
exec > >(tee "$T/all.log") 2>&1   # everything printed is also checked for failures at the end
limit() { perl -e 'alarm shift; exec @ARGV or exit 127' "$@"; }
ev() { echo "$(perl -MTime::HiRes=time -e 'printf "%.2f", time') $*" >> "$LOG"; }
export -f ev; export LOG

# D: bare mkdir holder, 2 s.
mkdir "$L"; echo "D $$" > "$L/owner"; ev "D start"
# A dead ticket at the front.
mkdir -p "$L.queue"; sleep 0 & dead=$!; wait $dead; echo "ghost $dead" > "$L.queue/0000000000"
( sleep 2; ev "D end"; rm -f "$L/owner"; rmdir "$L" ) &

# E: bare-mkdir contender.
( for i in $(seq 1 60); do
    if mkdir "$L" 2>/dev/null; then echo "E $(sh -c 'echo $PPID')" > "$L/owner"; ev "E start"; sleep 1; ev "E end"; rm -f "$L/owner"; rmdir "$L"; break; fi
    sleep 0.5
  done ) &

# F queues and is stopped while waiting: its ticket must go.
"$R/scripts/gpu-lock.sh" "test F" sleep 1 2> "$T/F.err" & fpid=$!
sleep 0.3
for j in A B C; do
  "$R/scripts/gpu-lock.sh" "test $j" bash -c "ev '$j start'; sleep 2; ev '$j end'" 2> "$T/$j.err" &
  sleep 0.5
done
sleep 0.5; kill -TERM $fpid; sleep 0.5; [ -e "$L.queue/0000000001" ] && echo "F's ticket is still there!" || echo "F stopped while queued: its ticket is gone"
wait
echo "--- events"; sort -n "$LOG"
echo "--- what A, B and C printed"; for j in F A B C; do echo "[$j]"; cat "$T/$j.err"; done
echo "--- checks"
sort -n "$LOG" | awk '
  / start$/ { if (held != "") { print "OVERLAP: " $2 " started while " held " held it"; bad=1 } held=$2; order = order $2 }
  / end$/   { if (held != $2) { print "MISMATCH end " $2 }; held="" }
  END { print "order: " order; if (!bad) print "no overlap" }'
ls -A "$L.queue" | grep -vE '^\.(next)$' | sed 's/^/left in queue: /'
[ -d "$L" ] && echo "lock still held!" || echo "lock free"
# An ownerless lock (a holder that died between mkdir and writing owner) is cleared after GPU_LOCK_ORPHAN seconds.
mkdir "$L"; start=$(date +%s)
GPU_LOCK_ORPHAN=2 "$R/scripts/gpu-lock.sh" "test G" true 2> "$T/G.err"
echo "ownerless lock: G ran after $(( $(date +%s) - start )) s:"; cat "$T/G.err"

echo "--- H: an owner that can't be signalled (pid 1)"
mkdir "$L"; echo "launchd 1" > "$L/owner"
"$R/scripts/gpu-lock.sh" "test H" true 2> "$T/H.err" & h=$!
sleep 3
if [ "$(cat "$L/owner" 2>/dev/null)" = "launchd 1" ] && kill -0 $h 2>/dev/null; then echo "H waits behind pid 1: ok"; else echo "H FAILED: pid 1's lock was cleared"; fi
rm -f "$L/owner"; rmdir "$L"; wait $h; grep -q "taken by test H" "$T/H.err" && echo "H ran once it was released: ok"

echo "--- I: a bare holder in a tight loop, J and K queued"
: > "$LOG"
( for i in $(seq 1 40); do
    until mkdir "$L" 2>/dev/null; do sleep 0.05; done
    echo "bare $(sh -c 'echo $PPID')" > "$L/owner"; ev "I start"; sleep 0.05; ev "I end"; rm -f "$L/owner"; rmdir "$L"
  done ) &
sleep 0.2
for j in J K; do "$R/scripts/gpu-lock.sh" "test $j" bash -c "ev '$j start'; sleep 0.5; ev '$j end'" 2> "$T/$j.err" & sleep 0.1; done
wait
sort -n "$LOG" | awk '
  / start$/ { if (held != "") { print "OVERLAP: " $2 " started while " held " held it"; bad=1 } held=$2; n[$2]++ }
  / end$/   { held="" }
  END { printf "I held it %d times, J %d, K %d: %s\n", n["I"], n["J"], n["K"], bad ? "OVERLAP" : "no overlap" }'

echo "--- a double release takes the lock from Q"
GPU_LOCK_WATCH=0.3 "$R/scripts/gpu-lock.sh" "test Q" sleep 2 2> "$T/Q.err" & q=$!
sleep 0.5
# The double release (as a script's EXIT trap does it), then a bare contender takes the lock.
rm -f "$L/owner"; rmdir "$L" 2>/dev/null
mkdir "$L"; echo "contender $$" > "$L/owner"
wait $q
grep -q "WARNING: the lock was taken from test Q" "$T/Q.err" && echo "Q warned that its lock was taken: ok"
grep -q "not releasing" "$T/Q.err" && [ "$(cat "$L/owner" 2>/dev/null)" = "contender $$" ] && echo "Q's release left the contender's lock alone: ok"
rm -f "$L/owner"; rmdir "$L"

# Shared and exclusive. Events are "<time> <job> <s|x> start|end"; holds() checks them.
export GPU_LOCK_SHARED_SLOTS=2
job() {  # job <shared|exclusive> <name> <seconds>
  "$R/scripts/gpu-lock.sh" --$1 "test $2" bash -c "ev '$2 ${1:0:1} start'; sleep $3; ev '$2 ${1:0:1} end'" 2> "$T/$2.err"
}
holds() {
  sort -n "$LOG" | awk '
    $4 == "start" && $3 == "e" { if (nx + ns) { print "OVERLAP: exclusive " $2 " started while " nx + ns " held it"; bad=1 } nx++ }
    $4 == "start" && $3 == "s" { if (nx) { print "OVERLAP: shared " $2 " started during an exclusive job"; bad=1 } if (++ns > max) max = ns }
    $4 == "start" { order = order " " $2 }
    $4 == "end" { if ($3 == "e") nx--; else ns-- }
    END { printf "order:%s; at most %d shared at once; %s\n", order, max, (bad || max > 2) ? "FAILED" : "no exclusive overlap" }'
}

echo "--- S: three shared jobs, two slots"
: > "$LOG"
for j in S1 S2 S3; do job shared $j 1.5 & sleep 0.1; done
wait; holds
sort -n "$LOG" | awk '$2 == "S3" && $4 == "start" { s3 = $1 } $4 == "end" && !first { first = $1 }
  END { print (s3 >= first) ? "S3 waited for a slot: ok" : "S3 FAILED: it started before a slot was free" }'
grep -q "waiting for a free slot" "$T/S3.err" && echo "S3 said it was waiting for a slot: ok"

echo "--- X: an exclusive waiter keeps new shared jobs out, then runs alone"
: > "$LOG"
job shared A1 2 & sleep 0.3
job exclusive X 1 & sleep 0.3
job shared A2 0.5 &
wait; holds
sort -n "$LOG" | awk '{ t[$2 " " $4] = $1 }
  END { print (t["X start"] >= t["A1 end"] && t["A2 start"] >= t["X end"]) ? "X waited for A1, and A2 waited for X: ok" : "X FAILED: the order is wrong" }'
grep -q "waiting for 1 shared job" "$T/X.err" && echo "X held the lock while A1 finished: ok"

echo "--- M: a mix of 12 jobs"
: > "$LOG"
for i in $(seq 1 12); do
  if [ $((i % 3)) -eq 0 ]; then job exclusive M$i 0.3 & else job shared M$i 0.4 & fi
  sleep 0.05
done
wait; holds
ls -A "$L.queue" | grep -vE '^\.(next)$' | sed 's/^/left in queue: /'
[ -z "$(ls -A "$L.shared")" ] && [ ! -d "$L" ] && echo "every hold released: ok"

echo "--- dead shared holders"
mkdir -p "$L.shared"
for i in 1 2; do sleep 0 & d=$!; wait $d; mkdir "$L.shared/$i"; echo "ghost $d" > "$L.shared/$i/owner"; done
"$R/scripts/gpu-lock.sh" "test W" true 2> "$T/W.err"
[ "$(grep -c "clearing a stale lock" "$T/W.err")" = 2 ] && grep -q "taken by test W" "$T/W.err" && echo "W (exclusive) cleared both dead shared holders and ran: ok"
for i in 1 2; do sleep 0 & d=$!; wait $d; mkdir "$L.shared/$i"; echo "ghost $d" > "$L.shared/$i/owner"; done
"$R/scripts/gpu-lock.sh" --shared "test Z" true 2> "$T/Z.err"
grep -q "clearing a stale lock" "$T/Z.err" && grep -q "taken by test Z" "$T/Z.err" && echo "Z (shared) cleared a dead shared holder and ran: ok"

echo "--- run-heavy.sh and re-entrancy"
export KIT_SKIP_PREFLIGHT=1
out=$("$R/scripts/run-heavy.sh" bash -c 'echo "lock=$GPU_LOCK held=$GPU_LOCK_HELD owner=$(cat "$GPU_LOCK/owner")"' 2> "$T/RH.err")
[ "${out%% owner=*}" = "lock=$L held=1" ] && echo "run-heavy.sh exported GPU_LOCK and GPU_LOCK_HELD=1 and held the lock while the command ran: ok" || echo "run-heavy FAILED: $out"
[ ! -d "$L" ] && echo "run-heavy.sh released the lock: ok"
# A nested gpu-lock.sh under GPU_LOCK_HELD=1 must return, not wait on itself.
r=$(GPU_LOCK_HELD=1 limit 10 "$R/scripts/gpu-lock.sh" "nested" echo nested-ran 2>&1) && [ "$r" = nested-ran ] && echo "nested gpu-lock.sh under GPU_LOCK_HELD=1 ran at once: ok" || echo "nested FAILED: $r"
# run-heavy.sh running a command that calls gpu-lock.sh itself must not deadlock.
r=$(limit 20 "$R/scripts/run-heavy.sh" "$R/scripts/gpu-lock.sh" "inner" echo inner-ran 2>/dev/null) && [ "$r" = inner-ran ] && echo "run-heavy.sh -> gpu-lock.sh does not deadlock: ok" || echo "nested-in-run-heavy FAILED: $r"
# The default lock path, with GPU_LOCK unset, is .gpu.lock in the kit folder. Show it without taking it.
d=$(env -u GPU_LOCK GPU_LOCK_POLL=0.2 bash -c 'kit="$(cd -P "$1/.." && pwd)"; echo "${GPU_LOCK:-$kit/.gpu.lock}"' _ "$R/scripts")
[ "$d" = "$R/.gpu.lock" ] && grep -q 'lock="${GPU_LOCK:-$kit/.gpu.lock}"' "$R/scripts/gpu-lock.sh" && echo "default lock path is the kit's own .gpu.lock: ok"

# Verdict: any line that says a check failed makes the script fail.
sleep 0.5
if grep -q -E 'FAILED|OVERLAP|MISMATCH|still there|still held|left in queue|command not found' "$T/all.log"; then
  echo "check-gpu-lock: FAILED"; exit 1
fi
echo "check-gpu-lock: ok"
