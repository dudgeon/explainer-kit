#!/usr/bin/env bash
# Explainer Kit setup: one command, safe to run again.
#   ./setup.sh                 base: checks your tools, makes the narration Python environment, installs the video
#                              packages, gets Chrome for the renderer, and fetches the house-voice and
#                              speech-check models (about 6.5 GB)
#   ./setup.sh --no-house-voice  skip the house voice's model (Qwen3-TTS, about 4 GB) and narrate only with a fine-tuned
#                              voice of your own. The choice is remembered in .no-house-voice; --house-voice undoes it.
#   ./setup.sh --voice-quick   also what the quick clone of your own voice needs (any Mac, 16 GB is fine): the
#                              take checker's environment (voice/.venv-eval) and the Parakeet and ECAPA models.
#                              Does not fetch VoxCPM2 or its training environment.
#   ./setup.sh --voice-speak   also narrating with a fine-tuned voice you already have (made on another Mac, say):
#                              the VoxCPM2 model (about 5 GB) and its environment, without the training extras.
#                              24 GB or larger Macs; setup refuses on a smaller one.
#   ./setup.sh --voice-train   also fine-tuning your voice: adds the VoxCPM2 model (about 5 GB) and its training
#                              environment (about 2.6 GB of venvs in all). 32 GB or larger Macs only; setup
#                              refuses on a smaller one (scripts/preflight.sh train-full says why). Includes --voice-quick.
#   ./setup.sh --music         also set up making your own music beds (ACE-Step; about 9.4 GB of models)
#   ./setup.sh --from DIR      clone models you already have on this Mac from DIR (APFS `cp -c`: instant, no extra
#                              disk) instead of downloading them
#   ./setup.sh --from-release [TAG|URL]  get the models from the kit's GitHub release (default models-1) instead of
#                              Hugging Face, for networks that block it. Downloads only what the other options need,
#                              checks every part and file, then installs as --from does. KIT_MODELS_RELEASE_URL: a
#                              mirror of the release's files (it turns this on). --keep-downloads keeps the parts.
#   ./setup.sh --check         change nothing: print what is installed, what is missing and what would be done, and
#                              which of your voices (voice/voices/ or $KIT_VOICE_DIR) can narrate now
#   ./setup.sh --only a,b      run only these steps: deps, venv, npm, chrome, models (for repairs and tests)
# Models go to $KIT_MODELS (default ~/Library/Caches/explainer-kit/models). Every download is pinned: Python
# packages by the requirements files, models by the commit in each models.lock.json. Setup is the only step that
# uses the network; once it has finished, nothing in the kit does (the tools run with HF_HUB_OFFLINE=1).
# Needs an Apple-silicon Mac with Homebrew tools: uv, ffmpeg, node 22 or newer.
set -u
root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Homebrew's folders, in case this shell doesn't have them on its PATH (a non-login shell, or an agent's).
for d in /opt/homebrew/bin /usr/local/bin; do [ -d "$d" ] && case ":$PATH:" in *":$d:"*) ;; *) PATH="$PATH:$d" ;; esac; done
export PATH
export KIT_MODELS="${KIT_MODELS:-$HOME/Library/Caches/explainer-kit/models}"
nohouse=0; [ -f "$root/.no-house-voice" ] && nohouse=1
vquick=0; vspeak=0; vtrain=0; music=0; check=0; from="${KIT_MODELS_FROM:-}"; only=""
while [ $# -gt 0 ]; do case "$1" in
  --voice-quick) vquick=1; shift ;;
  --voice-speak) vspeak=1; shift ;;
  --no-house-voice) nohouse=1; housechoice=1; shift ;;
  --house-voice) nohouse=0; housechoice=1; shift ;;
  --voice-train) vtrain=1; vquick=1; shift ;;
  --voice) echo "setup: --voice is now three options: --voice-quick (quick clone, any Mac), --voice-speak (narrate with a fine-tuned voice you have, 24 GB or larger) and --voice-train (fine-tuning, 32 GB or larger)" >&2; exit 2 ;;
  --music) music=1; shift ;;
  --check|--dry-run) check=1; shift ;;
  --from) from="${2:?--from needs a folder}"; shift 2 ;;
  --from-release) userel=1; case "${2:-}" in ""|-*) shift ;; *) relsrc="$2"; shift 2 ;; esac ;;
  --keep-downloads) keepdl=1; shift ;;
  --only) only="${2:?--only needs a list of steps}"; shift 2 ;;
  -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
  *) echo "setup: unknown option $1 (see ./setup.sh --help)" >&2; exit 2 ;; esac; done
if [ "${housechoice:-0}" = 1 ] && [ $check = 0 ]; then
  if [ $nohouse = 1 ]; then : > "$root/.no-house-voice"; else rm -f "$root/.no-house-voice"; fi
fi
[ -z "$from" ] || from="$(cd -P "$from" 2>/dev/null && pwd)" || { echo "setup: --from folder not found" >&2; exit 2; }
# --from-release: where the release's files are. A tag means this kit's GitHub release; a URL (or
# KIT_MODELS_RELEASE_URL) is a folder holding the same files, such as a company mirror of them.
relurl=""
if [ "${userel:-0}" = 1 ] || [ -n "${KIT_MODELS_RELEASE_URL:-}" ]; then
  [ -z "$from" ] || { echo "setup: use --from or --from-release, not both" >&2; exit 2; }
  reltag="$(node -p 'require(process.argv[1]).tag' "$root/models-manifest.json" 2>/dev/null || echo models-1)"
  case "${relsrc:-}" in
    http://*|https://*) relurl="$relsrc" ;;
    "") relurl="${KIT_MODELS_RELEASE_URL:-https://github.com/dudgeon/explainer-kit/releases/download/$reltag}" ;;
    *) relurl="https://github.com/dudgeon/explainer-kit/releases/download/$relsrc" ;;
  esac
  relurl="${relurl%/}"
fi

want() { [ -z "$only" ] || case ",$only," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
say()  { printf '%s\n' "$*"; }
todo=0   # things --check found missing
act()  { # act <description> <command...>: run it, or in --check mode say it would be done. A step that fails stops
        # setup there, so a later step can't fail on its account and hide the real cause.
  local d="$1" s; shift
  if [ $check = 1 ]; then say "  would: $d"; todo=$((todo + 1)); return 0; fi
  say "  $d"
  "$@" && return 0
  s=$?
  say ""; say "setup: stopped. This step failed: $d"
  say "  The lines above say why. Fix that, then run ./setup.sh again: it skips what is already done."
  exit "$s"
}

# ---- 0. Can setup write where it needs to? ----------------------------------------------------------------------------
# Setup writes outside the kit folder (models to $KIT_MODELS, Python and package caches under ~/.cache and ~/Library).
# An agent's sandbox (Claude Code's, for one) blocks those writes and certificate checks, and the failures that follow
# are confusing. Say so plainly instead.
if [ $check = 0 ] && [ -z "$only" ]; then
  probe="$KIT_MODELS/.setup-probe.$$"
  if ! { mkdir -p "$KIT_MODELS" 2>/dev/null && : > "$probe" 2>/dev/null; }; then
    say "setup: can't write to $KIT_MODELS, where the models go."
    say "  If Claude Code (or another agent) is running this, its sandbox blocks writing outside the kit folder and"
    say "  the certificate checks downloads need. Run ./setup.sh in Terminal instead (it is the only step that needs to)."
    say "  To keep the models somewhere else, set KIT_MODELS to a folder you can write to."
    exit 2
  fi
  rm -f "$probe"
fi

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
  # Remotion renders with its own headless Chrome, never the installed Google Chrome: without it, the first render
  # would download it mid-build (from Google's storage servers). So setup fetches it now, and checks for the program
  # itself, since an interrupted download leaves the folder behind.
  ch="$(ls "$root"/video/node_modules/.remotion/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | head -1)"
  if [ -n "$ch" ] && [ -x "$ch" ]; then say "  Remotion's own headless Chrome: ok"
  else act "download Remotion's headless Chrome (about 190 MB): npx remotion browser ensure" bash -c "cd '$root/video' && npx remotion browser ensure"; fi
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
  if [ -n "$relurl" ] && [ $check = 1 ] && case " $relhave " in *" $dir "*) true ;; *) false ;; esac; then
    say "  $dir: would install from the release (downloaded above)"
  elif [ -n "$from" ] && [ -d "$from/$dir" ]; then
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
_download() {  # uses the narration venv's huggingface_hub; the only network use in the kit. HF_ENDPOINT picks a mirror.
  local py="$root/video/voice/.venv/bin/python"
  [ -x "$py" ] || { echo "setup: the narration environment is missing; run ./setup.sh first" >&2; return 1; }
  mkdir -p "$2" && "$py" -I "$root/scripts/download_model.py" "$1" "$3" "$2" && echo "$3" > "$2/.kit-revision"
}

# ---- 4a. Models from the kit's release (--from-release) ---------------------------------------------------------------
# Downloads, from GitHub (or the mirror in KIT_MODELS_RELEASE_URL), only the models the chosen steps need and doesn't
# have yet; checks each part's sha256, the joined tar's and then every file's against the kit (lock files and its copy
# of the manifest); unpacks into $KIT_MODELS/.from-release/models; and then installs from there exactly as --from
# does. Nothing in this path talks to Hugging Face. Parts are kept until setup finishes, so a broken download resumes.
relhave=""
relstage="$KIT_MODELS/.from-release"
_rel_curl() {  # _rel_curl <url> <file> [curl args...]
  local u="$1" f="$2"; shift 2
  curl -fL --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 30 "$@" -o "$f" "$u"
}
_rel_fail() {  # explain a refused download in plain words
  say "setup: couldn't download $1"
  say "  The release's files come from github.com (and, after a redirect, from release-assets.githubusercontent.com"
  say "  or objects.githubusercontent.com). If your network blocks those, ask IT to allow them, or put the release's"
  say "  files on a server you can reach and set KIT_MODELS_RELEASE_URL to that folder. Run ./setup.sh again to resume."
}
_rel_get() {  # _rel_get <model folder name>: download, check and unpack one model from the release
  local d="$1" name size sha f have tsha="" n=0 parts=()
  mkdir -p "$relstage/parts" "$relstage/models" || return 1
  while read -r name size sha; do
    if [ "$name" = tar ]; then tsha="$size"; continue; fi
    f="$relstage/parts/$name"; parts+=("$f"); n=$((n + 1))
    have="$(stat -f %z "$f" 2>/dev/null || echo 0)"
    [ "$have" -gt "$size" ] && { rm -f "$f"; have=0; }
    if [ "$have" = "$size" ] && [ "$(shasum -a 256 "$f" | cut -d' ' -f1)" = "$sha" ]; then
      say "    $name: already downloaded"; continue
    fi
    say "    $name ($(awk -v b="$size" 'BEGIN{printf "%.2f GB", b/1e9}'))"
    if [ "$have" = "$size" ]; then rm -f "$f"; fi        # complete but wrong: start that part again
    _rel_curl "$relurl/$name" "$f" -C - || { _rel_fail "$relurl/$name"; return 1; }
    if [ "$(shasum -a 256 "$f" | cut -d' ' -f1)" != "$sha" ]; then
      say "    $name: the download doesn't match its sha256; fetching it again"
      rm -f "$f"; _rel_curl "$relurl/$name" "$f" || { _rel_fail "$relurl/$name"; return 1; }
      [ "$(shasum -a 256 "$f" | cut -d' ' -f1)" = "$sha" ] || { say "setup: $name still doesn't match its sha256; the release or a mirror of it is damaged"; return 1; }
    fi
  done < <(node "$root/scripts/model-release.mjs" parts "$relstage/models-manifest.json" "$d")
  [ $n -gt 0 ] && [ -n "$tsha" ] || return 1
  [ "$(cat "${parts[@]}" | shasum -a 256 | cut -d' ' -f1)" = "$tsha" ] || { say "setup: $d: the joined parts don't match the tar's sha256"; return 1; }
  rm -rf "$relstage/models/$d" "$relstage/models/$d.unpack" && mkdir -p "$relstage/models/$d.unpack" || return 1
  cat "${parts[@]}" | tar -x -f - -C "$relstage/models/$d.unpack" --no-same-owner || { say "setup: $d: unpacking failed"; return 1; }
  [ -d "$relstage/models/$d.unpack/$d" ] && [ "$(ls -A "$relstage/models/$d.unpack")" = "$d" ] || { say "setup: $d: the archive holds something else"; return 1; }
  mv "$relstage/models/$d.unpack/$d" "$relstage/models/$d" && rmdir "$relstage/models/$d.unpack" || return 1
  node "$root/scripts/model-release.mjs" verify "$relstage/models-manifest.json" "$d" "$relstage/models/$d" | sed 's/^/    /'
  [ "${PIPESTATUS[0]}" = 0 ]
}
if [ -n "$relurl" ] && { want models || { [ -z "$only" ] && [ $((vquick + vspeak + vtrain)) -gt 0 ]; }; }; then
  say "models from the release: $relurl"
  # What the chosen steps need, as setup's later steps would fetch it.
  need=()
  if want models; then
    pat=(Qwen3-TTS-12Hz-1.7B-Base parakeet); [ "${nohouse:-0}" = 1 ] && pat=(parakeet)
    while IFS='|' read -r _ dir _; do [ -n "$dir" ] && need+=("$dir"); done < <(lock_models "$root/video/voice/models.lock.json" "${pat[@]}")
  fi
  if [ -z "$only" ] && [ $vquick = 1 ]; then need+=(spkrec-ecapa-voxceleb parakeet-tdt-0.6b-v3); fi
  if [ -z "$only" ] && [ $((vspeak + vtrain)) -gt 0 ]; then
    task=voice-voxcpm; [ $vtrain = 1 ] && task=train-full
    if KIT_PREFLIGHT_SIZE_ONLY=1 "$root/scripts/preflight.sh" "$task" >/dev/null 2>&1; then need+=(VoxCPM2)
    else say "  VoxCPM2: not fetched; this Mac is too small for it (the own-voice step below says why)"; fi
  fi
  [ $music = 1 ] && say "  ACE-Step (--music) is not in the release; setup downloads it from Hugging Face as usual"
  get=(); seen=" "
  for dir in ${need[@]+"${need[@]}"}; do
    case "$seen" in *" $dir "*) continue ;; esac; seen="$seen$dir "
    rev="$(node "$root/scripts/model-release.mjs" lock "$dir" | cut -d'|' -f2)"
    if [ "$(cat "$KIT_MODELS/$dir/.kit-revision" 2>/dev/null)" = "$rev" ]; then say "  $dir: present"; else get+=("$dir"); fi
  done
  if [ ${#get[@]} = 0 ]; then
    say "  nothing to download"
  else
    man="$relstage/models-manifest.json"
    if [ $check = 1 ]; then man="$(mktemp "${TMPDIR:-/tmp}/kit-manifest.XXXXXX")"; else mkdir -p "$relstage" || exit 1; fi
    if _rel_curl "$relurl/models-manifest.json" "$man.new" -sS --retry 2 --max-time 60; then mv "$man.new" "$man"
    else
      rm -f "$man.new"; _rel_fail "$relurl/models-manifest.json"
      if [ $check = 1 ] && [ -f "$root/models-manifest.json" ]; then say "  (sizes below are from the kit's own copy of the manifest)"; cp "$root/models-manifest.json" "$man"
      else exit 2; fi
    fi
    total=0
    while IFS='|' read -r dir bytes nparts; do
      if [ "$dir" = fail ]; then relbad=1; continue; fi
      if [ "$dir" = missing ]; then say "  $bytes: not in this release; setup will try Hugging Face for it"; continue; fi
      total=$((total + bytes)); relhave="$relhave $dir"
      gbs="$(awk -v b="$bytes" 'BEGIN{printf "%.2f GB", b/1e9}')"
      if [ $check = 1 ]; then say "  would: download $dir from the release ($gbs in $nparts part(s))"; todo=$((todo + 1))
      else
        free=$(( $(df -k "$KIT_MODELS" | awk 'NR==2{print $4}') * 1024 ))
        [ "$free" -gt $((bytes * 2 + 1000000000)) ] || { say "setup: not enough free disk for $dir: it needs about $(awk -v b="$((bytes * 2))" 'BEGIN{printf "%.0f GB", b/1e9}') while it unpacks."; exit 2; }
        act "$dir: download from the release ($gbs) and check it" _rel_get "$dir"
      fi
    done < <(node "$root/scripts/model-release.mjs" plan "$man" "${get[@]}" || echo "fail|")
    [ "${relbad:-0}" = 0 ] || { say "setup: the release's manifest doesn't match this kit (above); nothing was installed from it"; exit 2; }
    say "  $(awk -v b="$total" 'BEGIN{printf "%.2f GB", b/1e9}') from the release in all"
    [ $check = 1 ] && rm -f "$man"
    # From here on, install exactly as --from <folder> does (clones, revision stamps, the own-voice checks).
    [ $check = 1 ] || from="$relstage/models"
  fi
fi
if want models; then
  say "models in $KIT_MODELS"
  [ -z "$from" ] || say "  cloning from $from where a model is there; downloading the rest"
  [ $check = 1 ] || mkdir -p "$KIT_MODELS"
  # Base: the house voice (Qwen3-TTS Base) and the speech check (Parakeet). VoiceDesign and CustomVoice are not needed.
  base=(Qwen3-TTS-12Hz-1.7B-Base parakeet)
  if [ $nohouse = 1 ]; then base=(parakeet); say "  house voice: skipped (--no-house-voice); only a fine-tuned voice of your own can narrate"; fi
  while IFS='|' read -r repo dir commit; do [ -n "$repo" ] && get_model "$repo" "$dir" "$commit"
  done < <(lock_models "$root/video/voice/models.lock.json" "${base[@]}")
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
# VoxCPM2 and its environment, through voice/setup.sh. Fine-tuning (32 GB or larger) adds the take checker and scorer;
# narrating with a fine-tuned voice you already have needs only the model and voice/.venv (24 GB or larger).
_voxcpm() {  # _voxcpm <preflight task> <what> <smaller-Mac advice> [voice/setup.sh args...]
  local task="$1" what="$2" advice="$3"; shift 3
  say "your own voice: $what (VoxCPM2)"
  if ! KIT_PREFLIGHT_SIZE_ONLY=1 "$root/scripts/preflight.sh" "$task" > "${TMPDIR:-/tmp}/kit-preflight.$$" 2>&1; then
    sed 's/^/  /' "${TMPDIR:-/tmp}/kit-preflight.$$" | sed -n '/preflight: NO/,$p'; rm -f "${TMPDIR:-/tmp}/kit-preflight.$$"
    say "  setup: skipping $what on this Mac. $advice"
    [ $check = 1 ] || exit 2
    return 0
  fi
  rm -f "${TMPDIR:-/tmp}/kit-preflight.$$"
  if [ ! -x "$root/voice/setup.sh" ]; then say "  voice/setup.sh is not in this copy of the kit; nothing to do."; return 0; fi
  local vargs=("$@"); [ -n "$from" ] && vargs+=(--from "$from")
  local vreq; vreq="$(shasum -a 256 "$root/voice/requirements/voxcpm.txt" | cut -d' ' -f1)"
  if [ -x "$root/voice/.venv/bin/python" ] && [ "$(cat "$root/voice/.venv/.requirements.sha256" 2>/dev/null)" = "$vreq" ] \
     && [ -f "$KIT_MODELS/VoxCPM2/.kit-revision" ]; then
    say "  voice/.venv: up to date; VoxCPM2: present ($(cat "$KIT_MODELS/VoxCPM2/.kit-revision"))"
  elif [ $check = 1 ]; then say "  would: voice/setup.sh ${vargs[*]+${vargs[*]}}  (VoxCPM2 and its venv; models to $KIT_MODELS)"; todo=$((todo + 1))
  else KIT_MODELS="$KIT_MODELS" "$root/voice/setup.sh" "${vargs[@]+"${vargs[@]}"}" || exit $?; fi
}
if [ $vtrain = 1 ] && [ -z "$only" ]; then
  _voxcpm train-full "fine-tuning" "The quick clone (--voice-quick) works here; on 24 GB, --voice-speak narrates with a voice fine-tuned elsewhere." --eval
elif [ $vspeak = 1 ] && [ -z "$only" ]; then
  _voxcpm voice-voxcpm "narrating with a fine-tuned voice" "Make a quick clone from the voice's reference clip instead (the make-my-voice skill does it)."
fi

# ---- Your voices -----------------------------------------------------------------------------------------------------
# Which voices are here and whether each can narrate now (light: reads files only). Needs node, checked above.
if [ -z "$only" ] && command -v node >/dev/null; then
  node "$root/video/pipeline/voices.mjs" || true
fi

# ---- Done ------------------------------------------------------------------------------------------------------------
if [ $check = 1 ]; then
  [ $todo = 0 ] && [ $missing = 0 ] && say "setup --check: everything is in place." || say "setup --check: $todo step(s) would run; nothing was changed."
  [ $missing = 0 ] || exit 2
  exit 0
fi
if [ -n "$relurl" ] && [ -d "$relstage" ]; then  # the models are installed; the download folder is no longer needed
  if [ "${keepdl:-0}" = 1 ]; then rm -rf "$relstage/models"; say "kept the downloaded parts in $relstage/parts (--keep-downloads)"
  else rm -rf "$relstage"; fi
fi
say "setup: done. From now on the kit works offline. Next: ask Claude to make an explainer."
