#!/usr/bin/env bash
# Privacy and licence gate. Run before every commit and before publishing. Exit 1 with the reasons if anything is wrong.
# Checks tracked files plus untracked files git would add; in a ZIP download with no git it scans the folder instead.
# Needs: bash, git (optional), node (for JSON checks), shasum.
cd "$(dirname "$0")/.." || exit 1
bad=0
fail() { echo "check-repo: $*"; bad=1; }

ALLOW_BINARY='^(video/voice/house/reference\.wav|video/score/beds/house-ambient\.m4a|demo/explainer-kit\.mp4)$'
BINARY_EXT='\.(wav|mp3|m4a|aac|flac|ogg|caf|aiff?|safetensors|pt|pth|bin|ckpt|npz)$'
LIMIT=$((12 * 1024 * 1024))
# Names and paths that must never appear in shipped files (case-insensitive).
NAMES='/Users/[^/ ]+/|~/repos/|claude-home|(^|[^a-z])geoff|geoff[-_]|(^|[^a-z])duo|DL-[0-9]+|T00_best|/private/tmp/claude-|session_01'
SECRETS='(hf_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,}|BEGIN (RSA|OPENSSH) PRIVATE KEY)'
# Files that legitimately mention the patterns, or are build notes that are not shipped.
SKIP='^(scripts/check-repo\.sh|PLAN\.md|REQUIREMENTS\.md|RESEARCH\.md|REVIEW\.md|DECISIONS\.md|WP1a-couplings\.txt)$'

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  have_git=1
  files=$(git ls-files -co --exclude-standard)
else
  have_git=0
  files=$(find . -type f -not -path './.git/*' -not -path '*/node_modules/*' | sed 's|^\./||')
fi
files=$(printf '%s\n' "$files" | grep -v -E "$SKIP" | sort -u)
present=()
while IFS= read -r f; do [ -n "$f" ] && [ -f "$f" ] && present+=("$f"); done <<< "$files"

# 1. Audio and weights: only the allowlist.
for f in "${present[@]}"; do
  if printf '%s' "$f" | grep -q -E -i "$BINARY_EXT" && ! printf '%s' "$f" | grep -q -E "$ALLOW_BINARY"; then
    fail "$f is audio or model weights and not on the allowlist"
  fi
done

# 2. Provenance of the house clip.
ref=video/voice/house/reference.wav; vj=video/voice/house/voice.json
if [ -f "$ref" ] && [ -f "$vj" ]; then
  want=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sha256||""))}catch(e){}' "$vj")
  got=$(shasum -a 256 "$ref" | cut -d' ' -f1)
  [ -z "$want" ] && fail "$vj has no sha256 for $ref"
  [ -n "$want" ] && [ "$want" != "$got" ] && fail "$ref sha256 $got does not match voice.json ($want)"
fi
# The demo must be narrated by the house voice: its PROVENANCE.json names the reference sha and the mp4's own sha.
if [ -f demo/explainer-kit.mp4 ]; then
  if [ ! -f demo/PROVENANCE.json ]; then
    fail "demo/explainer-kit.mp4 has no demo/PROVENANCE.json"
  else
    node -e '
      const fs=require("fs"),cp=require("child_process");
      const sha=(f)=>cp.execSync("shasum -a 256 "+JSON.stringify(f)).toString().split(" ")[0];
      const p=JSON.parse(fs.readFileSync("demo/PROVENANCE.json","utf8")); let e=[];
      const house=fs.existsSync("video/voice/house/reference.wav")?sha("video/voice/house/reference.wav"):null;
      if(!p.voice||p.voice.reference_sha256!==house) e.push("demo voice reference sha is not the house clip");
      if(p.mp4_sha256!==sha("demo/explainer-kit.mp4")) e.push("demo mp4 sha does not match PROVENANCE.json");
      if(e.length){console.log(e.join("\n"));process.exit(1)}' || fail "demo provenance check failed"
  fi
  s=$(stat -f %z demo/explainer-kit.mp4 2>/dev/null || stat -c %s demo/explainer-kit.mp4)
  echo "check-repo: demo/explainer-kit.mp4 is $s bytes"
fi

# 3. Personal paths and names in file contents.
for f in "${present[@]}"; do
  case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.mp4|*.wav|*.m4a|*.ico|*.woff|*.woff2|*.ttf|*.otf) continue;; esac
  hits=$(grep -n -I -i -E "$NAMES" "$f" 2>/dev/null | grep -v -i 'github\.com/dudgeon/explainer-kit' | head -5)
  [ -n "$hits" ] && fail "personal name or path in $f:
$(printf '%s\n' "$hits" | sed 's/^/    /')"
done

# 4. Size.
for f in "${present[@]}"; do
  s=$(stat -f %z "$f" 2>/dev/null || stat -c %s "$f")
  [ "$s" -gt "$LIMIT" ] && fail "$f is $((s / 1048576)) MB (limit 12)"
done

# 5. Secrets.
for f in "${present[@]}"; do
  grep -q -I -E "$SECRETS" "$f" 2>/dev/null && fail "a token-looking string is in $f"
done

# 6. Voices, takes, runs and caches are never tracked.
if [ $have_git = 1 ]; then
  bad_tracked=$(git ls-files | grep -E '^(voice/voices/|voice/takes/|voice/runs/|video/\.cache/|video/out/|video/build/)' | grep -v -x 'voice/voices/README.md')
else
  bad_tracked=$(printf '%s\n' "${present[@]}" | grep -E '^(voice/voices/|voice/takes/|voice/runs/|video/\.cache/|video/out/|video/build/)' | grep -v -x 'voice/voices/README.md')
fi
[ -n "$bad_tracked" ] && fail "voices, takes, runs or caches present in the repo:
$(printf '%s\n' "$bad_tracked" | head -5 | sed 's/^/    /')"

# 7. Licence files, and NOTICES.md names every model in the lock files.
[ -f LICENSE ] || fail "LICENSE is missing"
[ -f NOTICES.md ] || fail "NOTICES.md is missing"
if [ -f NOTICES.md ]; then
  for lock in video/voice/models.lock.json video/score/models.lock.json voice/models.lock.json; do
    [ -f "$lock" ] || continue
    names=$(node -e '
      const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const out=[];
      for(const [k,v] of Object.entries(j.models||{})) out.push(v&&v.hf_repo?v.hf_repo:k);
      console.log(out.join("\n"))' "$lock")
    while IFS= read -r m; do
      [ -n "$m" ] && ! grep -q -F "$m" NOTICES.md && fail "NOTICES.md does not name $m (from $lock)"
    done <<< "$names"
  done
fi

# 8. History: no audio or weights or big blobs ever committed, no personal names in old content or messages.
if [ $have_git = 1 ] && git rev-parse --verify -q HEAD >/dev/null; then
  while read -r type sha size path; do
    [ "$type" = blob ] || continue
    if printf '%s' "$path" | grep -q -E -i "$BINARY_EXT" && ! printf '%s' "$path" | grep -q -E "$ALLOW_BINARY"; then
      fail "history contains audio or weights: $path"
    fi
    [ "$size" -gt "$LIMIT" ] && fail "history contains a blob over 12 MB: $path ($((size / 1048576)) MB)"
  done < <(git rev-list --objects --branches --tags --remotes | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)')
  revs=$(git rev-list --branches --tags --remotes)
  # shellcheck disable=SC2086
  old=$(git grep -n -I -i -E "$NAMES" $revs -- . ':!scripts/check-repo.sh' ':!PLAN.md' ':!REQUIREMENTS.md' ':!RESEARCH.md' ':!REVIEW.md' ':!DECISIONS.md' 2>/dev/null | grep -v -i 'github\.com/dudgeon/explainer-kit' | head -5)
  [ -n "$old" ] && fail "personal name or path in history:
$(printf '%s\n' "$old" | sed 's/^/    /')"
  msgs=$(git log --branches --tags --remotes --format='%an%n%ae%n%B' | grep -i -E "$NAMES" | head -3)
  [ -n "$msgs" ] && fail "personal name or path in commit metadata: $msgs"
fi

if [ $bad = 0 ]; then echo "check-repo: ok (${#present[@]} files)"; else echo "check-repo: FAILED"; fi
exit $bad
