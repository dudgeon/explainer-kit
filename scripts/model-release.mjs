#!/usr/bin/env node
// The offline model bundle: one GitHub release (models-1, ...) holding the models setup needs, so a network that blocks
// Hugging Face can still install the kit. Used by scripts/make-model-release.sh (to build it) and setup.sh
// --from-release (to install from it). Light: reads JSON and hashes files, never touches the network.
//
//   model-release.mjs lock <dir>                         repo|revision|lock file for a model folder name
//   model-release.mjs verify-cache <model dir> <tree.json>... --out <files.json>
//        check a set-up model folder against the Hugging Face file list at its pinned revision (sizes, git blob ids,
//        LFS sha256) and against the lock file's sha256s; write {path: {size, sha256}} for the files to ship
//   model-release.mjs manifest <stage dir> <tag> <dir>...  write <stage>/models-manifest.json from the staged pieces
//   model-release.mjs notes <manifest>                   print the release notes
//   model-release.mjs plan <manifest> <dir>...           check a downloaded manifest against the kit, print
//                                                        "dir|bytes|parts" for each model in it, "missing|dir" if not
//   model-release.mjs parts <manifest> <dir>             print "name size sha256" per part, then "tar <sha256>"
//   model-release.mjs verify <manifest> <dir> <folder>   check an extracted model folder file by file
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCKS = ["voice/models.lock.json", "video/voice/models.lock.json", "video/score/models.lock.json"];
const PINNED = path.join(ROOT, "models-manifest.json"); // the kit's own copy of the release manifest
const SKIP = (rel) => rel === ".kit-revision" || rel === ".DS_Store" || rel.startsWith(".cache/") || rel.split("/").some((p) => p.startsWith("._"));

const die = (msg) => { console.error(`model-release: ${msg}`); process.exit(1); };
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// The pin for a model folder: from voice/models.lock.json (which also has per-file sha256s) or the other locks.
function lockFor(dir) {
  let hit = null;
  for (const rel of LOCKS) {
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) continue;
    for (const [key, v] of Object.entries(readJSON(f).models || {})) {
      const repo = (v && v.hf_repo) || key;
      const d = (v && v.dir) || (v && v.hf_repo ? key : key.split("/").pop());
      if (d !== dir) continue;
      const revision = typeof v === "string" ? v : v.revision || v.commit;
      const files = (v && v.files) || null;
      if (hit && hit.revision !== revision) die(`${dir} is pinned to two revisions (${hit.lock}, ${rel})`);
      if (!hit || (files && !hit.files)) hit = { repo, revision, lock: rel, files };
    }
  }
  if (!hit) die(`${dir} is not in any lock file`);
  return hit;
}

function walk(top) {
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), rel = path.relative(top, p).split(path.sep).join("/");
      if (SKIP(rel)) continue;
      if (e.isDirectory()) rec(p);
      else out.push({ rel, p, kind: e.isFile() ? "file" : e.isSymbolicLink() ? "symlink" : "other" });
    }
  };
  rec(top);
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

function hashFile(p, size) { // sha256, and the git blob id (sha1 of "blob <size>\0" + bytes)
  const s = crypto.createHash("sha256"), g = crypto.createHash("sha1");
  g.update(`blob ${size}\0`);
  const fd = fs.openSync(p, "r"), buf = Buffer.allocUnsafe(1 << 24);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) { s.update(buf.subarray(0, n)); g.update(buf.subarray(0, n)); } }
  finally { fs.closeSync(fd); }
  return { sha256: s.digest("hex"), blob: g.digest("hex") };
}

// A Hugging Face file list: either the API's tree (an array) or huggingface_hub's cached trees/<commit>.json.
function treeOf(f) {
  const j = readJSON(f), t = {};
  if (Array.isArray(j)) for (const e of j) { if (e.type === "file") t[e.path] = { size: e.size, blob: e.oid, lfs: e.lfs && e.lfs.oid }; }
  else for (const [p, e] of Object.entries(j.files || {})) t[p] = { size: e.size, blob: e.blob_id, lfs: e.lfs_sha256 };
  if (!Object.keys(t).length) die(`${f} lists no files`);
  return t;
}

const cmd = process.argv[2], args = process.argv.slice(3);

if (cmd === "lock") {
  const l = lockFor(args[0]);
  console.log(`${l.repo}|${l.revision}|${l.lock}`);
} else if (cmd === "verify-cache") {
  const oi = args.indexOf("--out"); if (oi < 0) die("verify-cache needs --out");
  const out = args[oi + 1], [mdir, ...trees] = args.slice(0, oi);
  const dir = path.basename(mdir), l = lockFor(dir), problems = [], files = {};
  const stamp = path.join(mdir, ".kit-revision");
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8").trim() !== l.revision) problems.push(`.kit-revision is not ${l.revision} (${l.lock})`);
  const tlist = trees.map(treeOf);
  if (!tlist.length) die("verify-cache needs at least one Hugging Face file list");
  for (const e of walk(mdir)) {
    if (e.kind !== "file") { problems.push(`${e.rel} is a ${e.kind}, not a file`); continue; }
    const size = fs.statSync(e.p).size, h = hashFile(e.p, size);
    for (const [i, t] of tlist.entries()) {
      const want = t[e.rel];
      if (!want) { problems.push(`${e.rel} is not in the file list ${trees[i]}`); continue; }
      if (want.size !== size) problems.push(`${e.rel}: size ${size}, the revision has ${want.size}`);
      else if (want.lfs ? want.lfs !== h.sha256 : want.blob !== h.blob) problems.push(`${e.rel}: content differs from the revision`);
    }
    if (l.files && l.files[e.rel] && l.files[e.rel] !== h.sha256) problems.push(`${e.rel}: sha256 differs from ${l.lock}`);
    files[e.rel] = { size, sha256: h.sha256 };
  }
  for (const n of Object.keys(l.files || {})) if (!files[n]) problems.push(`${n} (in ${l.lock}) is missing`);
  if (problems.length) die(`${dir} does not verify:\n  ${problems.join("\n  ")}`);
  fs.writeFileSync(out, JSON.stringify(files, null, 1) + "\n");
  const total = Object.values(files).reduce((a, f) => a + f.size, 0);
  console.log(`${dir}: ${Object.keys(files).length} files, ${total} bytes, all match ${l.repo}@${l.revision.slice(0, 10)}` +
    (l.files ? ` and the sha256s in ${l.lock}` : ""));
} else if (cmd === "manifest") {
  const [stage, tag, ...dirs] = args;
  const origin = readJSON(path.join(ROOT, "models-origin.json")).models;
  const m = {
    format: 1, tag,
    note: "Unmodified copies of these models' files at the pinned revisions, for setup.sh --from-release. Each model is one " +
      "uncompressed tar of its folder, split into parts; join the parts in order (cat), check tar_sha256, then extract.",
    models: {}, extras: [],
  };
  for (const dir of dirs) {
    const l = lockFor(dir), o = origin.find((x) => x.repo === l.repo) || die(`${l.repo} is not in models-origin.json`);
    const t = readJSON(path.join(stage, `${dir}.tar.json`));
    m.models[dir] = {
      repo: l.repo, revision: l.revision, lock: l.lock, licence: o.licence, made_by: o.made_by,
      source: `https://huggingface.co/${l.repo}/tree/${l.revision}`,
      archive: `${dir}.tar`, tar_size: t.size, tar_sha256: t.sha256, parts: t.parts,
      files: readJSON(path.join(stage, `${dir}.files.json`)),
    };
  }
  for (const f of fs.readdirSync(stage).filter((f) => f.startsWith("LICENSE-")))
    m.extras.push({ name: f, size: fs.statSync(path.join(stage, f)).size, sha256: hashFile(path.join(stage, f), 0).sha256 });
  fs.writeFileSync(path.join(stage, "models-manifest.json"), JSON.stringify(m, null, 1) + "\n");
} else if (cmd === "notes") {
  const m = readJSON(args[0]), gb = (b) => (b / 1e9).toFixed(2) + " GB";
  const L = [];
  L.push("The models Explainer Kit needs, for networks that block Hugging Face. With this release, setup downloads " +
    "everything it needs for the models from GitHub instead:", "", "```", "./setup.sh --from-release", "```", "",
    "Add `--voice-quick` for the quick clone of your own voice, or `--voice-speak` / `--voice-train` for a fine-tuned voice. " +
    "Setup downloads only the models those steps need, checks every part and every file against the fingerprints pinned " +
    "in the kit, and then works offline. A company mirror of these files works too: set `KIT_MODELS_RELEASE_URL` to the " +
    "folder that holds them. Python packages and Python itself still come from PyPI and uv's usual hosts; see the README.", "",
    "## What is in it", "",
    "These are unmodified copies of the models' files at the pinned revisions (the files the kit uses; nothing is changed, " +
    "converted or retrained). Each model is one uncompressed tar of its folder, split into parts under GitHub's 2 GiB limit. " +
    "`models-manifest.json` lists every part, the tar's sha256 and every file's sha256; `SHA256SUMS` covers all assets.", "",
    "| Model | Made by | Licence | Source (pinned revision) | Size | Used for |", "|---|---|---|---|---|---|");
  const origin = readJSON(path.join(ROOT, "models-origin.json")).models;
  for (const [dir, e] of Object.entries(m.models)) {
    const o = origin.find((x) => x.repo === e.repo) || {};
    L.push(`| \`${dir}\` | ${e.made_by} | ${e.licence} | [${e.repo}@${e.revision.slice(0, 10)}](${e.source}) | ${gb(e.tar_size)} | ${o.role || ""} |`);
  }
  L.push("", "## Licences and attribution", "",
    "**Parakeet (CC-BY-4.0).** \"parakeet-tdt-0.6b-v3\" by NVIDIA (https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3), " +
    "licensed under the Creative Commons Attribution 4.0 International licence " +
    "(https://creativecommons.org/licenses/by/4.0/). Converted to MLX format by mlx-community " +
    "(https://huggingface.co/mlx-community/parakeet-tdt-0.6b-v3); redistributed here unmodified from that conversion. " +
    "NVIDIA does not endorse this kit.", "",
    "**Qwen3-TTS-12Hz-1.7B-Base (Apache-2.0).** Made by the Qwen team, Alibaba Cloud (https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base); " +
    "MLX conversion by mlx-community (https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16).", "",
    "**VoxCPM2 (Apache-2.0).** Made by OpenBMB (https://huggingface.co/openbmb/VoxCPM2, code at https://github.com/OpenBMB/VoxCPM).", "",
    "**ECAPA speaker model (Apache-2.0).** speechbrain/spkrec-ecapa-voxceleb by the SpeechBrain project " +
    "(https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb). The release carries the three files the kit uses and the model card, not the whole repository.", "",
    "The Apache-2.0 models are redistributed under the Apache License 2.0; a copy is attached as `LICENSE-Apache-2.0.txt`. " +
    "None of their repositories at the pinned revisions has a NOTICE file. Each archive keeps the model's own card " +
    "(`README.md`), which states its licence. These files were not modified. The kit's own code is MIT; these licences " +
    "apply to the models only. What the model makers say about generated audio is listed as unconfirmed in the kit's NOTICES.md.", "",
    "Who made each model and where is also in the kit's `models-origin.json`.");
  console.log(L.join("\n"));
} else if (cmd === "plan" || cmd === "parts" || cmd === "verify") {
  const m = readJSON(args[0]);
  if (m.format !== 1 || !m.models) die(`${args[0]} is not a models manifest this kit understands`);
  const pinned = fs.existsSync(PINNED) ? readJSON(PINNED).models || {} : {};
  // A downloaded manifest is only trusted where it agrees with the kit: the lock's revision and sha256s, and the
  // kit's own copy of the manifest, if it has this model.
  const check = (dir) => {
    const e = m.models[dir]; if (!e) return null;
    const l = lockFor(dir);
    if (e.revision !== l.revision) die(`the release has ${dir} at ${e.revision}, but the kit pins ${l.revision} (${l.lock})`);
    for (const [n, s] of Object.entries(l.files || {}))
      if (!e.files[n] || e.files[n].sha256 !== s) die(`the release's ${dir}/${n} does not match ${l.lock}`);
    const p = pinned[dir];
    if (p && p.revision === e.revision && JSON.stringify(p.files) !== JSON.stringify(e.files))
      die(`the release's file list for ${dir} differs from the kit's copy (models-manifest.json)`);
    for (const n of Object.keys(e.files)) if (n.startsWith("/") || n.split("/").includes("..")) die(`bad path ${n} in ${dir}`);
    return e;
  };
  if (cmd === "plan") {
    for (const dir of args.slice(1)) {
      const e = check(dir);
      console.log(e ? `${dir}|${e.parts.reduce((a, p) => a + p.size, 0)}|${e.parts.length}` : `missing|${dir}`);
    }
  } else if (cmd === "parts") {
    const e = check(args[1]) || die(`the release has no ${args[1]}`);
    for (const p of e.parts) { if (!/^[A-Za-z0-9._-]+$/.test(p.name)) die(`bad part name ${p.name}`); console.log(`${p.name} ${p.size} ${p.sha256}`); }
    console.log(`tar ${e.tar_sha256}`);
  } else {
    const [, dir, folder] = args, e = check(dir) || die(`the release has no ${dir}`), bad = [], seen = new Set();
    for (const f of walk(folder)) {
      if (f.kind !== "file") { bad.push(`${f.rel} is a ${f.kind}`); continue; }
      const want = e.files[f.rel]; seen.add(f.rel);
      if (!want) { bad.push(`${f.rel} is not in the manifest`); continue; }
      const size = fs.statSync(f.p).size;
      if (size !== want.size || hashFile(f.p, size).sha256 !== want.sha256) bad.push(`${f.rel} does not match its sha256`);
    }
    for (const n of Object.keys(e.files)) if (!seen.has(n)) bad.push(`${n} is missing`);
    if (bad.length) die(`${dir} from the release does not verify:\n  ${bad.join("\n  ")}`);
    console.log(`${dir}: ${seen.size} files, every sha256 matches`);
  }
} else {
  die("usage: see the top of scripts/model-release.mjs");
}
