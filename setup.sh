#!/usr/bin/env bash
# Explainer Kit setup: one command, safe to run again.
#   ./setup.sh                 base: checks your tools, makes the narration Python environment, installs the video
#                              packages, gets Chrome for the renderer, and fetches the house-voice and
#                              speech-check models (about 6.5 GB)
#   ./setup.sh --voice-quick   also what the quick clone of your own voice needs (any Mac, 16 GB is fine): the
#                              take checker's environment (voice/.venv-eval) and the Parakeet and ECAPA models.
#                              Does not fetch VoxCPM2 or its training environment.
#   ./setup.sh --voice-train   also fine-tuning your voice: adds the VoxCPM2 model (about 5 GB) and its training
#                              environment (about 2.6 GB of venvs in all). 32 GB or larger Macs only; setup
#                              refuses on a smaller one (scripts/preflight.sh train-full says why). Includes --voice-quick.
#   ./setup.sh --music         also set up making your own music beds (ACE-Step; about 9.4 GB of models)
#   ./setup.sh --from DIR      clone models you already have on this Mac from DIR (APFS `cp -c`: instant, no extra
#                              disk) instead of downloading them
#   ./setup.sh --check         change nothing: print what is installed, what is missing and what would be done
#   ./setup.sh --only a,b      run only these steps: deps, venv, npm, chrome, models (for repairs and tests)
# Models go to $KIT_MODELS (default ~/Library/Caches/explainer-kit/models). Every download is pinned: Python
# packages by the requirements files, models by the commit in each models.lock.json. Setup is the only step that
# uses the network; once it has finished, nothing in the kit does (the tools run with HF_HUB_OFFLINE=1).
# Needs an Apple-silicon Mac with Homebrew tools: uv, ffmpeg, node 22 or newer.
set -u
root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KIT_MODELS="${KIT_MODELS:-$HOME/Library/Caches/explainer-kit/models}"
vquick=0; vtrain=0; music=0; check=0; from="${KIT_MODELS_FROM:-}"; only=""
while [ $# -gt 0 ]; do case "$1" in
  --voice-quick) vquick=1; shift ;;
  --voice-train) vtrain=1; vquick=1; shift ;;
  --voice) echo "setup: --voice is now two options: --voice-quick (quick clone, any Mac) and --voice-train (fine-tuning, 32 GB or larger)" >&2; exit 2 ;;
  --music) music=1; shift ;;
  --check|--dry-run) check=1; shift ;;
  --from) from="${2:?--from needs a folder}"; shift 2 ;;
  --only) only="${2:?--only needs a list of steps}"; shift 2 ;;
  -h|--help) sed -n 2,22p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "setup: unknown option $1 (see ./setup.sh --help)" >&2; exit 2 ;; esac; done
[ -z "$from" ] || from="$(cd -P "$from" 2>/dev/null && pwd)" || { echo "setup: --from folder not found" >&2; exit 2; }

want() { [ -z "$only" ] || case ",$only," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
say()  { printf '%s\n' "$*"; }
todo=0   # things --check found missing
act()  { # act <description> <command...>: run it, or in --check mode say it would be done
  local d="$1"; shift
  if [ $check = 1 ]; then say "  would: $d"; todo=$((todo + 1)); else say "  $d"; "$@"; fi
}

# ---- 1. Tools --------------------------------------------------------------------------------------------------------
missing=0
if want deps; then
  say "tools"
  [ "$(uname -m)" = arm64 ] || { say "  note: this is not Apple silicon; the voice engines use the Mac's GPU and won't work here"; }
  command -v uv >/dev/null && say "  uv: $(uv --version 2>/dev/null)" || { say "  uv: MISSING (brew install uv)"; missing=1; }
  if command -v ffmpeg >/dev/null || [ -x /opt/homebrew/bin/ffmpeg ]; then say "  ffmpeg: ok"; else say "  ffmpeg: MISSING (brew install ffmpeg)"; missing=1; fi
  if command -v node >/dev/null; then
    nv="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$nv" -ge 22 ] 2>/dev/null; then say "  node: v$(node -v | tr -d v) ok"; else say "  node: v$(node -v | tr -d v) is too old, need 22 or newer (brew install node)"; missing=1; fi
  else say "  node: MISSING (brew install node)"; missing=1; fi
  command -v npm >/dev/null || { say "  npm: MISSING (it comes with node)"; missing=1; }
  if [ $missing = 1 ]; then
    say "setup: install the tools marked MISSING (Homebrew: https://brew.sh), then run ./setup.sh again."
    [ $check = 1 ] || exit 2
  fi
fi

# ---- 2. Python environments ------------------------------------------------------------------------------------------
venv() {  # venv <dir> <requirements file>: make or refresh a venv only when its pinned requirements changed
  local dir="$root/$1" req="$root/$2" have="" w
  [ -f "$req" ] || { say "  $1: no $2 yet (skipped)"; return 0; }
  w="$(shasum -a 256 "$req" | cut -d' ' -f1)"
  [ -f "$dir/.requirements.sha256" ] && have="$(cat "$dir/.requirements.sha256")"
  if [ "$w" = "$have" ] && [ -x "$dir/bin/python" ]; then say "  $1: up to date"; return 0; fi
  act "$1: create from $2 (Python 3.12, pinned)" _mkvenv "$dir" "$req" "$w"
}
_mkvenv() {
  [ -x "$1/bin/python" ] || uv venv --python 3.12 "$1" || return 1
  uv pip install --python "$1/bin/python" -r "$2" || return 1
  echo "$3" > "$1/.requirements.sha256"
}
if want venv; then
  say "python environments"
  venv video/voice/.venv video/voice/requirements.txt
  [ $vquick = 1 ] && venv voice/.venv-eval voice/requirements/eval.txt
  [ $music = 1 ] && venv video/score/.venv video/score/requirements.txt
fi

# ---- 3. Video packages and the renderer's Chrome ---------------------------------------------------------------------
if want npm; then
  say "video packages"
  if [ -d "$root/video/node_modules/remotion" ] && [ "$root/video/package-lock.json" -ot "$root/video/node_modules/.package-lock.json" ]; then
    say "  video/node_modules: up to date"
  else
    act "video: npm ci (pinned by package-lock.json)" bash -c "cd '$root/video' && npm ci --no-audit --no-fund"
  fi
fi
if want chrome; then
  say "chrome for the renderer"
  ch="$(ls -d "$root"/video/node_modules/.remotion/chrome-headless-shell* 2>/dev/null | head -1)"
  if [ -n "$ch" ]; then say "  Remotion's own headless Chrome: ok"
  elif [ -d "/Applications/Google Chrome.app" ]; then say "  Google Chrome is installed; Remotion will use it"
  else act "download Remotion's headless Chrome (about 150 MB): npx remotion browser ensure" bash -c "cd '$root/video' && npx remotion browser ensure"; fi
fi

# ---- 4. Models -------------------------------------------------------------------------------------------------------
# lock_models <lock file> <name...>: print "<repo>|<dir name>|<commit>" for the named models in the lock (voice lock is
# repo -> commit; score lock is repo -> {commit, dir}).
lock_models() {
  node -e '
    const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const want=process.argv.slice(2);
    for (const [repo,v] of Object.entries(j.models||{})) {
      const dir=(v&&v.dir)||repo.split("/").pop(); const commit=typeof v==="string"?v:v.commit||v.revision;
      if (!want.length || want.some(w=>dir.includes(w))) console.log(repo+"|"+dir+"|"+commit);
    }' "$@"
}
get_model() {  # get_model <repo> <dir> <commit>
  local repo="$1" dir="$2" commit="$3" dest="$KIT_MODELS/$2" have=""
  [ -f "$dest/.kit-revision" ] && have="$(cat "$dest/.kit-revision")"
  if [ "$have" = "$commit" ]; then say "  $dir: present ($commit)"; return 0; fi
  if [ -n "$from" ] && [ -d "$from/$dir" ]; then
    act "$dir: clone from $from/$dir (cp -c, no extra disk)" _clone "$from/$dir" "$dest" "$commit"
  elif [ -n "$from" ] && [ ! -d "$from/$dir" ] && [ $check = 1 ]; then
    say "  $dir: not in --from folder; would download $repo@${commit:0:10}"; todo=$((todo + 1))
  else
    act "$dir: download $repo at ${commit:0:10}" _download "$repo" "$dest" "$commit"
  fi
}
_clone() {  # APFS clone; falls back to a plain copy on another volume
  mkdir -p "$(dirname "$2")" && rm -rf "$2.partial" || return 1
  { cp -c -R "$1" "$2.partial" 2>/dev/null || cp -R "$1" "$2.partial"; } || return 1
  rm -rf "$2"; mv "$2.partial" "$2" && echo "$3" > "$2/.kit-revision"
}
_download() {  # uses the narration venv's huggingface_hub; the only network use in the kit
  local py="$root/video/voice/.venv/bin/python"
  [ -x "$py" ] || { echo "setup: the narration environment is missing; run ./setup.sh first" >&2; return 1; }
  mkdir -p "$2" && "$py" -I -c '
import sys; from huggingface_hub import snapshot_download
snapshot_download(sys.argv[1], revision=sys.argv[3], local_dir=sys.argv[2])' "$1" "$2" "$3" && echo "$3" > "$2/.kit-revision"
}
if want models; then
  say "models in $KIT_MODELS"
  [ -z "$from" ] || say "  cloning from $from where a model is there; downloading the rest"
  [ $check = 1 ] || mkdir -p "$KIT_MODELS"
  # Base: the house voice (Qwen3-TTS Base) and the speech check (Parakeet). VoiceDesign and CustomVoice are not needed.
  while IFS='|' read -r repo dir commit; do [ -n "$repo" ] && get_model "$repo" "$dir" "$commit"
  done < <(lock_models "$root/video/voice/models.lock.json" Qwen3-TTS-12Hz-1.7B-Base parakeet)
  if [ $music = 1 ]; then
    while IFS='|' read -r repo dir commit; do [ -n "$repo" ] && get_model "$repo" "$dir" "$commit"
    done < <(lock_models "$root/video/score/models.lock.json")
  fi
fi

# ---- 5. Your own voice ------------------------------------------------------------------------------------------------
# Quick clone: the take checker (voice/.venv-eval, made above) and the models it uses. voice/setup.sh cannot do this
# alone: it always builds the VoxCPM2 environment too, so the quick path runs voice/tools/fetch_models.py itself.
_voice_eval_models() {
  local a=(--models "$KIT_MODELS" --set eval); [ -n "$from" ] && a+=(--from "$from")
  "$root/voice/.venv-eval/bin/python" -I "$root/voice/tools/fetch_models.py" "${a[@]}"
}
if [ $vquick = 1 ] && [ -z "$only" ]; then
  say "your own voice: quick clone (Parakeet and ECAPA for the take checker)"
  if [ ! -f "$root/voice/tools/fetch_models.py" ]; then say "  voice/ is not in this copy of the kit; nothing to do."
  elif [ -f "$KIT_MODELS/spkrec-ecapa-voxceleb/.kit-revision" ] && [ -f "$KIT_MODELS/parakeet-tdt-0.6b-v3/.kit-revision" ]; then
    say "  spkrec-ecapa-voxceleb, parakeet-tdt-0.6b-v3: present"
  else act "fetch spkrec-ecapa-voxceleb and parakeet-tdt-0.6b-v3 (checked against voice/models.lock.json)" _voice_eval_models || exit $?; fi
fi
# Fine-tuning: VoxCPM2 and the training environment, through voice/setup.sh. 32 GB or larger only.
if [ $vtrain = 1 ] && [ -z "$only" ]; then
  say "your own voice: fine-tuning (VoxCPM2)"
  if ! KIT_PREFLIGHT_SIZE_ONLY=1 "$root/scripts/preflight.sh" train-full > "${TMPDIR:-/tmp}/kit-preflight.$$" 2>&1; then
    sed 's/^/  /' "${TMPDIR:-/tmp}/kit-preflight.$$" | sed -n '/preflight: NO/,$p'; rm -f "${TMPDIR:-/tmp}/kit-preflight.$$"
    say "  setup: skipping --voice-train on this Mac. The quick clone (--voice-quick) works here."
    [ $check = 1 ] || exit 2
  else
    rm -f "${TMPDIR:-/tmp}/kit-preflight.$$"
    if [ ! -x "$root/voice/setup.sh" ]; then say "  voice/setup.sh is not in this copy of the kit; nothing to do."
    else
      vargs=(--eval); [ -n "$from" ] && vargs+=(--from "$from")
      vreq="$(shasum -a 256 "$root/voice/requirements/voxcpm.txt" | cut -d' ' -f1)"
      if [ -x "$root/voice/.venv/bin/python" ] && [ "$(cat "$root/voice/.venv/.requirements.sha256" 2>/dev/null)" = "$vreq" ] \
         && [ -f "$KIT_MODELS/VoxCPM2/.kit-revision" ]; then
        say "  voice/.venv: up to date; VoxCPM2: present ($(cat "$KIT_MODELS/VoxCPM2/.kit-revision"))"
      elif [ $check = 1 ]; then say "  would:voice/setup.sh ${vargs[*]}  (VoxCPM2 and the training venv; models to $KIT_MODELS)"; todo=$((todo + 1))
      else KIT_MODELS="$KIT_MODELS" "$root/voice/setup.sh" "${vargs[@]}" || exit $?; fi
    fi
  fi
fi

# ---- Done ------------------------------------------------------------------------------------------------------------
if [ $check = 1 ]; then
  [ $todo = 0 ] && [ $missing = 0 ] && say "setup --check: everything is in place." || say "setup --check: $todo step(s) would run; nothing was changed."
  [ $missing = 0 ] || exit 2
  exit 0
fi
say "setup: done. From now on the kit works offline. Next: ask Claude to make an explainer."
