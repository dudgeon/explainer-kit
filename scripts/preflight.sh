#!/usr/bin/env bash
# Memory preflight: can this Mac run <task> right now?
#   scripts/preflight.sh <task>
# Tasks: voice-house   narrate with the house voice (Qwen3-TTS, the light path)
#        voice-quick   narrate with a quick clone of your own voice (same engine, your reference clip)
#        voice-voxcpm  narrate with a fine-tuned VoxCPM2 voice
#        train-full    fine-tune your voice (LoRA on VoxCPM2)
#        score         generate a music bed (ACE-Step; only after ./setup.sh --music)
#        render        render the film (Remotion)
# Prints what it measured, then one verdict. Exit codes:
#   0  go                                        2  this Mac is too small for the task: the message names the tier that fits
#   3  not enough free memory right now: the message lists what to quit, then run it again
#   64 usage
# Test hooks (GiB, whole numbers allowed with decimals): KIT_FAKE_MEMSIZE, KIT_FAKE_AVAILABLE, KIT_FAKE_SWAP_USED.
# KIT_ALLOW_UNPROVEN=1 lets a 24 GB Mac attempt train-full anyway (the 24 GB numbers are an estimate, see below).
set -u

task="${1:-}"

# ---- The need table. ESTIMATES: placeholders, "estimate, WP8 replaces" -------------------------------------------
# need_gib: free memory wanted before the task starts (about: peak driver memory + 2 GiB headroom).
# min_gib:  the smallest Mac (hw.memsize, GiB) the task is offered on.
# Measured on a 32 GB Mac so far (not on 16 or 24 GB): VoxCPM2 speaking peaks at 12.9 GiB of GPU memory in fp32;
# a LoRA fine-tune logs 13.4 to 15.5 GiB (and 17.5 GB for the whole process). Everything else below is a guess.
NEED_NOTE="estimate, WP8 replaces"
case "$task" in
  voice-house)  need=6;  min=16; what="narrate with the house voice" ;;
  voice-quick)  need=6;  min=16; what="narrate with a quick clone of your voice" ;;
  voice-voxcpm) need=15; min=24; what="narrate with a fine-tuned voice (VoxCPM2)" ;;
  train-full)   need=20; min=32; what="fine-tune your voice (LoRA)" ;;
  score)        need=12; min=16; what="generate a music bed (ACE-Step)" ;;
  render)       need=4;  min=16; what="render the film" ;;
  ""|-h|--help) sed -n 2,16p "$0" | sed 's/^# \{0,1\}//'; [ -z "$task" ] && exit 64; exit 0 ;;
  train-16gb)   echo "preflight: there is no 16 GB training profile. Fine-tuning needs a 32 GB or larger Mac; a 16 GB Mac gets the quick clone (task voice-quick)." >&2; exit 64 ;;
  *)            echo "preflight: unknown task '$task' (voice-house, voice-quick, voice-voxcpm, train-full, score, render)" >&2; exit 64 ;;
esac

gib() { awk -v b="$1" 'BEGIN{printf "%.1f", b/1073741824}'; }
num() { awk -v v="$1" 'BEGIN{printf "%.1f", v}'; }
lt()  { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0 < b+0)}'; }

# ---- Measurements --------------------------------------------------------------------------------------------------
mem_bytes=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
if [ -n "${KIT_FAKE_MEMSIZE:-}" ]; then
  mem_gib=$(num "$KIT_FAKE_MEMSIZE"); fake_note=" (simulated by KIT_FAKE_MEMSIZE; this Mac really has $(gib "$mem_bytes") GiB)"
else
  mem_gib=$(gib "$mem_bytes"); fake_note=""
fi
# Marketing sizes are a little under the nominal figure (16 GB reads 16.0 GiB here, but be tolerant of rounding).
tier=$(awk -v g="$mem_gib" 'BEGIN{ if (g>=31.5) print 32; else if (g>=23.5) print 24; else print 16 }')

pagesize=$(vm_stat 2>/dev/null | awk '/page size of/ {for(i=1;i<=NF;i++) if($i ~ /^[0-9]+$/){print $i; exit}}')
pagesize=${pagesize:-16384}
pages=$(vm_stat 2>/dev/null | awk '/^Pages (free|inactive|speculative|purgeable)/ {gsub("\\.","",$NF); s+=$NF} END{print s+0}')
avail_bytes=$((pages * pagesize))
if [ -n "${KIT_FAKE_AVAILABLE:-}" ]; then avail_gib=$(num "$KIT_FAKE_AVAILABLE"); else avail_gib=$(gib "$avail_bytes"); fi

swap_line=$(sysctl -n vm.swapusage 2>/dev/null || echo "")
swap_used_gib=$(printf '%s' "$swap_line" | awk '{for(i=1;i<=NF;i++) if($i=="used"){v=$(i+2); u=substr(v,length(v)); n=v+0; if(u=="M") n=n/1024; else if(u=="K") n=n/1048576; printf "%.2f", n; exit}} END{}')
swap_used_gib=${swap_used_gib:-0.00}
[ -n "${KIT_FAKE_SWAP_USED:-}" ] && swap_used_gib=$(num "$KIT_FAKE_SWAP_USED")

free_pct=$(memory_pressure -Q 2>/dev/null | awk -F: '/free percentage/ {gsub(/[ %]/,"",$2); print $2}')
level=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)
case "$level" in 1) pressure=normal ;; 2) pressure=warn ;; 4) pressure=critical ;; *) pressure="level $level" ;; esac

echo "preflight: $task ($what)"
echo "  memory installed   : $mem_gib GiB$fake_note"
echo "  free + reclaimable : $avail_gib GiB (vm_stat free + inactive + speculative + purgeable)"
echo "  swap in use        : $swap_used_gib GiB"
echo "  memory pressure    : $pressure${free_pct:+, $free_pct% of memory free}"
echo "  top processes by memory (RSS, apps grouped with their helpers):"
ps -axo rss=,comm= 2>/dev/null | awk '
  { rss=$1; $1=""; sub(/^ /,""); p=$0
    if (match(p, /[^\/]+\.app/)) name=substr(p, RSTART, RLENGTH-4); else { n=split(p, a, "/"); name=a[n] }
    sum[name]+=rss }
  END { for (k in sum) printf "%d\t%s\n", sum[k], k }' | sort -rn | head -12 |
  awk -F'\t' '{ printf "    %6.2f GiB  %s\n", $1/1048576, $2 }'
echo "  need for this task : about $need GiB free, a $min GB or larger Mac ($NEED_NOTE)"

# ---- Verdict --------------------------------------------------------------------------------------------------------
QUICK_WARNING="About the quick clone: it is a zero-shot likeness made from one short reading. It is recognisable, not exact:
  it scored 0.747 speaker similarity against 0.800 for a fine-tune on the harder test set, and it may drift in tone,
  pace or the way it says names. A fine-tune would add a closer, steadier match to your voice across a whole film."

refuse() { echo; echo "preflight: NO. $1"; [ -n "${2:-}" ] && printf '%s\n' "$2"; exit 2; }

if [ "$task" = voice-quick ]; then echo; printf '%s\n' "$QUICK_WARNING"; fi

if lt "$mem_gib" "$min"; then
  case "$task:$tier" in
    train-full:16) refuse "Fine-tuning needs a 32 GB or larger Mac, and this one has 16 GB." \
"  What a 16 GB Mac gets is the quick clone (task voice-quick): one short reading of your voice, ready in minutes.
  $QUICK_WARNING
  The house voice (voice-house) always works too." ;;
    train-full:24) : ;; # handled below
    voice-voxcpm:16) refuse "A fine-tuned VoxCPM2 voice needs about 13 GiB of GPU memory just to speak, more than a 16 GB Mac can spare." \
"  Use the quick clone (task voice-quick) or the house voice (voice-house) on this Mac.
  $QUICK_WARNING" ;;
    *) refuse "This task needs a $min GB or larger Mac; this one has $mem_gib GiB." "  Try the house voice (voice-house) or the quick clone (voice-quick), which fit a 16 GB Mac." ;;
  esac
fi

if [ "$task" = train-full ] && [ "$tier" = 24 ]; then
  msg="24 GB Mac: fine-tuning is not offered by default. The numbers are an estimate, not yet measured on a 24 GB Mac (WP8 replaces them):
  a fine-tune used 13.4 to 15.5 GiB of GPU memory and 17.5 GB for the whole process on a 32 GB Mac, which leaves a 24 GB
  Mac little room for macOS, the browser and the render, and it may start swapping (training then slows more than 3x).
  What works well on 24 GB: the house voice and the quick clone, and rendering.
  $QUICK_WARNING
  To try the fine-tune anyway, quit everything else and run again with KIT_ALLOW_UNPROVEN=1."
  if [ "${KIT_ALLOW_UNPROVEN:-}" = 1 ]; then echo; echo "preflight: warning. $msg"; else refuse "$msg" ""; fi
fi

# Enough memory installed; is enough of it free right now?
short=""
lt "$avail_gib" "$need" && short="only $avail_gib GiB is free or reclaimable and this task wants about $need GiB"
lt 2.0 "$swap_used_gib" && short="${short:+$short; }$swap_used_gib GiB of swap is already in use (over 2 GiB)"
[ "$level" -ge 2 ] 2>/dev/null && short="${short:+$short; }memory pressure is $pressure"
if [ -n "$short" ]; then
  echo; echo "preflight: WAIT. $short."
  echo "  Quit the biggest apps above, usually: Chrome or Safari (and their helpers), Slack, Teams, Docker, Xcode,"
  echo "  the Simulator, VS Code and other Electron apps, Photos (while it analyses). Then run this again."
  if [ "$tier" = 16 ] && [ "$task" != voice-house ] && [ "$task" != voice-quick ] && [ "$task" != render ]; then
    echo "  Or use a lighter tier: voice-quick (quick clone) or voice-house."
  fi
  exit 3
fi
echo; echo "preflight: ok. $tier GB tier, $avail_gib GiB free for a task that wants about $need GiB."
exit 0
