#!/usr/bin/env bash
# Build the offline model bundle on this Mac and publish it as a GitHub release (no CI), for networks that block
# Hugging Face. Users install from it with ./setup.sh --from-release.
#   scripts/make-model-release.sh [--dry-run] [--tag models-1] [--stage DIR] [--keep-stage]
# The bytes come from this Mac's set-up models ($KIT_MODELS, default ~/Library/Caches/explainer-kit/models). Each model
# folder is first checked against Hugging Face's file list at its pinned revision (sizes, git blob ids, LFS sha256)
# and against the lock files' sha256s; a folder that doesn't verify stops the script. Then each folder becomes one
# uncompressed tar (folder name kept; no .kit-revision stamp, no .cache), split into parts of at most 1900 MiB
# (<dir>.tar.part-aa, -ab, ...), plus models-manifest.json, SHA256SUMS and LICENSE-Apache-2.0.txt.
# Re-runnable: a staged model is reused, and an asset already on the release with the same size is skipped.
# --dry-run verifies and prints the plan; it writes no archives and changes nothing on GitHub.
# Needs: gh (logged in, repo scope), node, curl, shasum, tar, split. Uploads about 11 GB.
set -euo pipefail
root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
models="${KIT_MODELS:-$HOME/Library/Caches/explainer-kit/models}"
repo="dudgeon/explainer-kit"
tag=models-1; dry=0; keep=0; stage=""
# The bundle: the base models (house voice, speech check) and the own-voice models. Not ACE-Step, not VoiceDesign.
DIRS=(Qwen3-TTS-12Hz-1.7B-Base-bf16 parakeet-tdt-0.6b-v3 VoxCPM2 spkrec-ecapa-voxceleb)
PART=$((1900 * 1024 * 1024))
APACHE_URL=https://www.apache.org/licenses/LICENSE-2.0.txt
APACHE_SHA=cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) dry=1; shift ;;
  --tag) tag="${2:?}"; shift 2 ;;
  --stage) stage="${2:?}"; shift 2 ;;
  --keep-stage) keep=1; shift ;;
  -h|--help) sed -n 2,13p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "make-model-release: unknown option $1" >&2; exit 2 ;; esac; done
stage="${stage:-${TMPDIR:-/tmp}/explainer-kit-model-release/$tag}"
helper=(node "$root/scripts/model-release.mjs")
say() { printf '%s\n' "$*"; }
gb() { awk -v b="$1" 'BEGIN{printf "%.2f GB", b/1e9}'; }
fsize() { stat -f %z "$1"; }

say "make-model-release: $tag from $models; staging in $stage"
[ $dry = 1 ] && say "  (dry run: verify and plan only)"
command -v gh >/dev/null || { say "gh is not installed"; exit 2; }
gh auth status >/dev/null 2>&1 || { say "gh is not logged in"; exit 2; }
mkdir -p "$stage/trees"

# ---- 1. Verify every model folder, and that its licence allows public redistribution ----------------------------------
for d in "${DIRS[@]}"; do
  src="$models/$d"
  [ -d "$src" ] || { say "$d: not in $models. Set it up first (./setup.sh --voice-quick --voice-speak)."; exit 1; }
  IFS='|' read -r hfrepo rev lock < <("${helper[@]}" lock "$d")
  trees=()
  local_tree="$src/.cache/huggingface/trees/$rev.json"
  [ -f "$local_tree" ] && trees+=("$local_tree")
  api="$stage/trees/$d.json"
  if [ -s "$api" ] || curl -fsSL --retry 3 "https://huggingface.co/api/models/$hfrepo/tree/$rev?recursive=true" -o "$api"; then
    trees+=("$api")
  else rm -f "$api"; fi
  [ ${#trees[@]} -gt 0 ] || { say "$d: no file list for $hfrepo@$rev (Hugging Face unreachable and none cached); can't verify"; exit 1; }
  if [ -f "$stage/$d.files.json" ] && [ -f "$stage/$d.done" ] && [ "$(cat "$stage/$d.done")" = "$rev" ]; then
    say "$d: verified and staged earlier"
  else
    "${helper[@]}" verify-cache "$src" "${trees[@]}" --out "$stage/$d.files.json"
  fi
  # Licence: the model card's licence must be the one models-origin.json gives, and a permissive one.
  card="$(sed -n '1,/^---$/{/^license:/p;}' "$src/README.md" 2>/dev/null | head -1 | sed 's/^license: *//; s/"//g' | tr 'A-Z' 'a-z')"
  want="$(node -e 'const m=require(process.argv[1]).models.find(x=>x.repo===process.argv[2]);process.stdout.write(m?m.licence:"")' "$root/models-origin.json" "$hfrepo" | tr 'A-Z' 'a-z')"
  case "$want" in apache-2.0|cc-by-4.0|mit) ;; *) say "$d: licence '$want' is not one this script redistributes; stopping"; exit 1 ;; esac
  [ "$card" = "$want" ] || { say "$d: the model card says licence '$card', models-origin.json says '$want'; stopping"; exit 1; }
  say "$d: licence $want (model card agrees)"
done

if [ $dry = 1 ]; then
  say ""; say "would stage and upload:"
  tot=0
  for d in "${DIRS[@]}"; do
    b="$(node -e 'let t=0;for(const f of Object.values(require(process.argv[1])))t+=f.size;console.log(t)' "$stage/$d.files.json")"
    tot=$((tot + b)); say "  $d.tar: about $(gb "$b") in $(( (b + PART - 1) / PART )) part(s)"
  done
  say "  models-manifest.json, SHA256SUMS, LICENSE-Apache-2.0.txt"
  say "  total about $(gb $tot)"
  if gh release view "$tag" -R "$repo" >/dev/null 2>&1; then say "release $tag exists; missing or different assets would be uploaded"
  else say "would create release $tag on $repo (target main)"; fi
  exit 0
fi

# ---- 2. Stage: one tar per model, split into parts ---------------------------------------------------------------------
for d in "${DIRS[@]}"; do
  rev="$("${helper[@]}" lock "$d" | cut -d'|' -f2)"
  if [ -f "$stage/$d.done" ] && [ "$(cat "$stage/$d.done")" = "$rev" ]; then say "$d: staged earlier"; continue; fi
  say "$d: archiving"
  rm -f "$stage/$d.tar.part-"* "$stage/$d.tar.json"
  # Only the verified files, in a fixed order, without macOS metadata or owners.
  node -e 'for (const f of Object.keys(require(process.argv[1]))) console.log(process.argv[2] + "/" + f)' "$stage/$d.files.json" "$d" > "$stage/$d.list"
  COPYFILE_DISABLE=1 tar -c -f - -C "$models" --no-recursion --no-mac-metadata --no-xattrs --no-acls --no-fflags \
    --uid 0 --gid 0 --uname root --gname root -T "$stage/$d.list" | split -b "$PART" -a 2 - "$stage/$d.tar.part-"
  tsha="$(cat "$stage/$d.tar.part-"* | shasum -a 256 | cut -d' ' -f1)"
  tsize=0; parts=""
  for p in "$stage/$d.tar.part-"*; do
    s="$(fsize "$p")"; tsize=$((tsize + s))
    parts="$parts{\"name\":\"$(basename "$p")\",\"size\":$s,\"sha256\":\"$(shasum -a 256 "$p" | cut -d' ' -f1)\"},"
  done
  printf '{"size":%s,"sha256":"%s","parts":[%s]}\n' "$tsize" "$tsha" "${parts%,}" > "$stage/$d.tar.json"
  # The tar must hold exactly the verified files: extract-free check by listing.
  listed="$(cat "$stage/$d.tar.part-"* | tar -t -f - | grep -v '/$' | sort)"
  [ "$listed" = "$(sort "$stage/$d.list")" ] || { say "$d: the archive's contents differ from the verified list"; exit 1; }
  echo "$rev" > "$stage/$d.done"
  say "$d: $(gb "$tsize") in $(ls "$stage/$d.tar.part-"* | wc -l | tr -d ' ') part(s), tar sha256 ${tsha:0:16}"
done
if [ ! -f "$stage/LICENSE-Apache-2.0.txt" ]; then
  curl -fsSL --retry 3 "$APACHE_URL" -o "$stage/LICENSE-Apache-2.0.txt"
fi
[ "$(shasum -a 256 "$stage/LICENSE-Apache-2.0.txt" | cut -d' ' -f1)" = "$APACHE_SHA" ] || { say "LICENSE-Apache-2.0.txt is not the canonical text"; exit 1; }
"${helper[@]}" manifest "$stage" "$tag" "${DIRS[@]}"
"${helper[@]}" notes "$stage/models-manifest.json" > "$stage/NOTES.md"
assets=()
for d in "${DIRS[@]}"; do for p in "$stage/$d.tar.part-"*; do assets+=("$(basename "$p")"); done; done
assets+=(models-manifest.json LICENSE-Apache-2.0.txt)
(cd "$stage" && shasum -a 256 "${assets[@]}" > SHA256SUMS)
assets+=(SHA256SUMS)
cp "$stage/models-manifest.json" "$root/models-manifest.json"   # the kit's pinned copy, committed with the code
say "staged ${#assets[@]} assets; the kit's copy of the manifest is in models-manifest.json"

# ---- 3. Release and upload ---------------------------------------------------------------------------------------------
if ! gh release view "$tag" -R "$repo" >/dev/null 2>&1; then
  # A draft until every asset is up, so nobody downloads a half-made release.
  gh release create "$tag" -R "$repo" --draft --target main --title "Models 1: offline model bundle" --notes-file "$stage/NOTES.md"
  say "created draft release $tag"
else
  gh release edit "$tag" -R "$repo" --notes-file "$stage/NOTES.md" >/dev/null
fi
remote_size() { gh release view "$tag" -R "$repo" --json assets -q ".assets[] | select(.name==\"$1\") | .size" 2>/dev/null; }
for a in "${assets[@]}"; do
  want="$(fsize "$stage/$a")"
  if [ "$(remote_size "$a")" = "$want" ]; then say "  $a: already uploaded"; continue; fi
  ok=0
  for try in 1 2 3 4 5; do
    say "  $a: uploading ($(gb "$want"), try $try)"
    if gh release upload "$tag" "$stage/$a" -R "$repo" --clobber && [ "$(remote_size "$a")" = "$want" ]; then ok=1; break; fi
    sleep $((try * 15))
  done
  [ $ok = 1 ] || { say "  $a: upload failed 5 times; run the script again to resume"; exit 1; }
done
if [ "$(gh release view "$tag" -R "$repo" --json isDraft -q .isDraft)" = true ]; then
  gh release edit "$tag" -R "$repo" --draft=false --latest=false >/dev/null && say "published $tag"
fi
say "all ${#assets[@]} assets are on https://github.com/$repo/releases/tag/$tag"
if [ $keep = 0 ]; then rm -rf "$stage"; say "deleted the staging folder"; fi
