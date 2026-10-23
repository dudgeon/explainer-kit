#!/usr/bin/env python3
"""Check one recorded take. Usage: .venv-eval/bin/python -I tools/check_take.py <file> [--take T05]
Converts to takes/wav/<ID>.wav, measures audio quality, runs parakeet ASR, aligns it to the
script (script/takes.json), cuts per-line segments into takes/seg/<ID>/, writes takes/report/<ID>.json
and prints PASS / REDO / REDO LINES. Everything is local.
The reference take T00 is read three times; the cleanest reading is kept as takes/seg/T00/T00_pick.wav (+ .txt, .json).
Parakeet runs on the GPU, so the check takes a shared hold on the kit's lock (scripts/gpu-lock.sh) unless the caller already
holds it and says so with GPU_LOCK_HELD=1 (scripts/run-heavy.sh does)."""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path
import numpy as np, soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
TAKES = ROOT / "takes"
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")
MODEL = Path(os.environ.get("KIT_VOICE_MODELS") or os.environ.get("KIT_MODELS") or Path.home() / "Library/Caches/explainer-kit/models") / "parakeet-tdt-0.6b-v3"   # ./setup.sh --eval fetches it
PAD, LINE_WER_FLAG, TAKE_WER_REDO = 0.15, 0.15, 0.15

# ---- text normalisation (the same ideas as the kit's video/voice/asr_check.py) ----
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()

def num_words(n):
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + num_words(n % 100))
    if n < 10000 and n % 1000 == 0: return ONES[n // 1000] + " thousand"
    return " ".join(ONES[int(c)] for c in str(n))

ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}

def ordinal(n):
    w = num_words(n).split()
    w[-1] = ORD.get(w[-1], w[-1][:-1] + "ieth" if w[-1].endswith("y") else w[-1] + "th")
    return " ".join(w)

def number(n):
    """How a number in a script is usually read aloud. Four-digit numbers from 1100 to 2099 read as years ('nineteen
    eighty two', 'nineteen hundred', 'two thousand five'): the speech recogniser writes a spoken year as digits."""
    if 1100 <= n <= 2099 and n % 1000:
        hi, lo = divmod(n, 100)
        if 2000 <= n < 2010: return "two thousand " + ONES[n - 2000]
        return num_words(hi) + (" hundred" if lo == 0 else (" oh " + ONES[lo] if lo < 10 else " " + num_words(lo)))
    return num_words(n)

def norm(text):
    t = text.lower().replace("&", " and ").replace("%", " percent").replace("’", "'")
    # The recogniser writes what was said as digits: "2.5 cups", "BA271", "the 4th", "100", "206". Spell them the way a
    # reader says them, so a well-read line is not flagged.
    t = re.sub(r"\b(\d+)\.5\b", r"\1 and a half", t)
    t = re.sub(r"(?<=\d)\.(?=\d)", " point ", t)
    t = re.sub(r"(?<=[a-z0-9])\.(?=[a-z0-9])", " dot ", t)
    t = re.sub(r"\b([a-z]+)(\d+)\b", lambda m: " ".join(m.group(1)) + " " + " ".join(ONES[int(c)] for c in m.group(2)), t)  # flight BA271
    t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: " " + ordinal(int(m.group(1))) + " ", t)
    t = re.sub(r"(\d+)", lambda m: " " + number(int(m.group(1))) + " ", t)
    return re.sub(r"[^a-z' ]", " ", t.replace("-", " ")).replace("'", "").split()

def spoken_numbers(toks):
    """On a token stream (the recogniser's words are normalised one at a time, so this cannot live in norm()):
    "a hundred" is heard as "100" (one hundred), and "two hundred and six" as "206" (two hundred six).
    toks: a list of tokens, or of (token, payload) pairs."""
    tok = lambda i: toks[i][0] if isinstance(toks[i], tuple) else toks[i]
    out = []
    for i in range(len(toks)):
        t = tok(i)
        if t == "and" and i and tok(i - 1) in ("hundred", "thousand"): continue
        if t == "a" and i + 1 < len(toks) and tok(i + 1) in ("hundred", "thousand"):
            out.append(("one",) + toks[i][1:] if isinstance(toks[i], tuple) else "one"); continue
        out.append(toks[i])
    return out

def merge_letters(toks):
    """Runs of >=2 single letters ('p r d') become one token ('prd'); returns [(tok, first_i, last_i)]."""
    out, i = [], 0
    while i < len(toks):
        j = i
        while j < len(toks) and len(toks[j]) == 1: j += 1
        if j - i >= 2:
            out.append(("".join(toks[i:j]), i, j - 1)); i = j
        else:
            out.append((toks[i], i, i)); i += 1
    return out

# ---- alignment ----
def best_window(ref, hyp, lo=0, hi=None):
    """Semi-global edit distance: ref fully matched against the best stretch hyp[s:e]. -> (cost, s, e)."""
    hi = len(hyp) if hi is None else hi
    n, m = len(ref), hi - lo
    prev = [(0, j) for j in range(m + 1)]            # (cost, start)
    for i in range(1, n + 1):
        cur = [(i, 0)]
        for j in range(1, m + 1):
            sub = prev[j-1][0] + (ref[i-1] != hyp[lo+j-1])
            c = min((sub, prev[j-1][1]), (prev[j][0] + 1, prev[j][1]), (cur[j-1][0] + 1, cur[j-1][1]))
            cur.append(c)
        prev = cur
    cost, e = min((prev[j][0], j) for j in range(m + 1))
    return cost, lo + prev[e][1], lo + e

def match_lines(lines, hyp, start=0, retakes=True):
    """Sequentially find each script line in hyp tokens. lines: list of token lists.
    Returns per-line dict(cost, s, e, tries) or None (missing), and the cursor after the last match."""
    cur, out = start, []
    for ref in lines:
        n = len(ref)
        if not n or cur >= len(hyp): out.append(None); continue
        cost, s, e = best_window(ref, hyp, cur)
        if cost / n > 0.5: out.append(None); continue
        tries = [(cost, s, e)]
        while retakes:  # a later, equally good statement of the same line wins
            hi = min(len(hyp), e + 2 * n + 8)
            c2, s2, e2 = best_window(ref, hyp, e, hi) if e < hi else (n, 0, 0)
            if c2 / n <= 0.3 and c2 <= cost + 0.1 * n and e2 > e:
                cost, s, e = c2, s2, e2; tries.append((cost, s, e))
            else: break
        out.append(dict(cost=cost, s=s, e=e, tries=tries)); cur = e
    return out, cur

# ---- audio ----
def db(x): return 20 * np.log10(max(float(x), 1e-10))
def rms(x): return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0

def probe(src):
    j = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_streams",
                                            "-show_format", "-of", "json", str(src)]))
    s = j["streams"][0]
    bits = int(s.get("bits_per_raw_sample") or s.get("bits_per_sample") or 0)
    return dict(codec=s["codec_name"], sample_rate=int(s["sample_rate"]), bit_depth=bits or None,
                channels=int(s["channels"]), duration=float(j["format"]["duration"]))

def convert(src, dst, src_rate):
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-ac", "1"] + (["-ar", "48000"] if src_rate >= 48000 else []) \
          + ["-c:a", "pcm_s24le", str(dst)]
    subprocess.run(cmd, check=True)

def lufs(wav):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(wav), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"\n\s+I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else None

def hum(x, sr):
    seg = x[: int(3 * sr)]
    if len(seg) < sr: return None
    from scipy.signal import welch
    f, p = welch(seg, sr, nperseg=sr)  # 1 Hz bins
    best = None
    for f0 in (50, 60):
        peaks = []
        for k in range(1, 5):
            c = int(f0 * k); a = p[c - 1:c + 2].max()
            nb = np.r_[p[c - 15:c - 4], p[c + 5:c + 16]]
            peaks.append(10 * np.log10(a / max(np.median(nb), 1e-20)))
        if sum(v > 10 for v in peaks) >= 2 or peaks[0] > 15:
            if best is None or max(peaks) > best[1]: best = (f0, max(peaks))
    return dict(hz=best[0], peak_over_floor_db=round(best[1], 1)) if best else None

def levels(x, sr, words):
    frames = x[: len(x) // int(.05 * sr) * int(.05 * sr)].reshape(-1, int(.05 * sr))
    fr = np.sqrt(np.mean(frames ** 2, axis=1))
    # Quietest 0.5 s anywhere (the pauses between sentences), not just the first 3 s: takes may start talking at once.
    w, step = int(.5 * sr), int(.05 * sr)
    quiet = min((rms(x[i:i + w]) for i in range(0, max(1, len(x) - w + 1), step)), default=rms(x))
    spans = [x[int(a * sr):int(b * sr)] for a, b in words]
    speech = rms(np.concatenate(spans)) if spans else rms(x)
    return dict(noise_floor_dbfs=db(quiet), p10_frame_dbfs=db(np.percentile(fr, 10)), speech_rms_dbfs=db(speech),
                snr_db=db(speech) - db(quiet))

# ---- ASR ----
GPU_LOCK_SH = ROOT.parent / "scripts" / "gpu-lock.sh"   # the kit's one lock implementation

def hold_gpu_lock():
    """Re-run this check under a shared hold on the kit's GPU lock, unless the caller already holds it (GPU_LOCK_HELD=1).
    One lock implementation for the whole kit: a second, private lock would let two heavy jobs run at once, and a nested
    take of the same lock would wait forever on its own holder."""
    if os.environ.get("GPU_LOCK_HELD") == "1":
        return
    if not GPU_LOCK_SH.is_file():
        sys.exit(f"check_take: {GPU_LOCK_SH} isn't there; run this from inside the kit, or set GPU_LOCK_HELD=1 if you hold the GPU lock yourself")
    os.execv("/bin/bash", ["/bin/bash", str(GPU_LOCK_SH), "--shared", "kit-voice-check",
                           "env", "GPU_LOCK_HELD=1", sys.executable, "-I", str(Path(__file__).resolve()), *sys.argv[1:]])

_asr = None
def transcribe(wav):
    global _asr
    if _asr is None:
        from parakeet_mlx import from_pretrained
        _asr = from_pretrained(str(MODEL))
    res = _asr.transcribe(str(wav), chunk_duration=120.0, overlap_duration=10.0)
    return words_of(res)

def tokens(words):
    """ASR words -> (hyp tokens, token -> (first word, last word), header text, words in the header).
    The header is the take number said at the start: "Take five", "Take H one" (heard as "Take H1", or "Takes seven")."""
    raw_t = spoken_numbers([(t, i) for i, w in enumerate(words) for t in norm(w["word"])])
    hyp_m = merge_letters([t for t, _ in raw_t])
    hyp = [t for t, _, _ in hyp_m]
    hyp_w = [(raw_t[f][1], raw_t[l][1]) for _, f, l in hyp_m]
    isnum = lambda s: s in ONES or s in TENS or s.isdigit()
    header, n = "", 0
    if len(hyp) > 1 and hyp[0] in ("take", "takes"):
        if isnum(hyp[1]): n = 2
        elif len(hyp) > 2 and hyp[1] in ("h", "t") and isnum(hyp[2]): n = 3
    if n:
        header = " ".join(hyp[:n])
        last_word = hyp_w[n - 1][1]
        return hyp, hyp_w, header, last_word + 1
    return hyp, hyp_w, "", 0

def rescue(x, sr, words, hyp_w, matches, dur):
    """Transcribe again, on its own, the stretch of audio where each missing line should be (between the lines found
    either side of it). Returns the new words, with times in the take, that do not overlap words already heard."""
    import tempfile
    found = [(k, m) for k, m in enumerate(matches) if m]
    new = []
    for k, m in enumerate(matches):
        if m: continue
        before = [mm for kk, mm in found if kk < k]; after = [mm for kk, mm in found if kk > k]
        a = words[hyp_w[before[-1]["e"] - 1][1]]["end"] if before else 0.0
        b = words[hyp_w[after[0]["s"]][0]]["start"] if after else dur
        if b - a < 1.0: continue
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            sf.write(f.name, x[int(a * sr):int(b * sr)], sr, subtype="PCM_24")
            got = transcribe(f.name)
        for w in got:
            w = dict(w, start=w["start"] + a, end=w["end"] + a)
            if not any(o["start"] < w["end"] and w["start"] < o["end"] for o in words + new): new.append(w)
    return new

def words_of(res):
    words = []
    for s in res.sentences:
        for tk in s.tokens:
            if tk.text.startswith(" ") or not words: words.append({"word": tk.text.strip(), "start": tk.start, "end": tk.end})
            else: words[-1]["word"] += tk.text; words[-1]["end"] = tk.end
    return [w for w in words if w["word"]]

# ---- segmentation ----
def snap(x, sr, lo, hi, want_min=True):
    """Lowest-energy point in [lo, hi] seconds (10 ms frames)."""
    lo, hi = max(0.0, lo), min(len(x) / sr, hi)
    if hi - lo < 0.02: return (lo + hi) / 2
    h = int(.01 * sr); a, b = int(lo * sr), int(hi * sr)
    pos = list(range(a, max(a + 1, b - h), h // 2 or 1))
    e = [rms(x[p:p + h]) for p in pos]
    return (pos[int(np.argmin(e))] + h / 2) / sr

def cut_span(x, sr, words, i0, i1, dur):
    prev_end = words[i0 - 1]["end"] if i0 > 0 else 0.0
    next_start = words[i1 + 1]["start"] if i1 + 1 < len(words) else dur
    s0, e0 = words[i0]["start"], words[i1]["end"]
    a = snap(x, sr, max(prev_end, s0 - PAD), s0)
    b = snap(x, sr, e0, min(next_start, e0 + PAD))
    return a, max(b, e0)

def take_id(path, forced):
    if forced: return forced.upper()
    m = re.match(r"^\W*(?:take[\s_-]*)?([TtHh])\s*0*(\d{1,2})", Path(path).stem)
    if not m: sys.exit(f"cannot get a take id from {Path(path).name}; use --take")
    k, n = m.group(1).upper(), int(m.group(2))
    return f"T{n:02d}" if k == "T" else f"H{n}"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("file"); ap.add_argument("--take")
    a = ap.parse_args(); src = Path(a.file).expanduser()
    hold_gpu_lock()
    script = json.load(open(ROOT / "script/takes.json"))
    tid = take_id(src, a.take)
    if tid not in script: sys.exit(f"{tid} is not in script/takes.json")
    lines = script[tid]["lines"]

    for d in ("raw", "wav", "report"): (TAKES / d).mkdir(parents=True, exist_ok=True)
    if not (TAKES / "raw" / src.name).exists(): shutil.copy2(src, TAKES / "raw" / src.name)
    info = probe(src)
    wav = TAKES / "wav" / f"{tid}.wav"
    convert(src, wav, info["sample_rate"])
    x, sr = sf.read(wav, dtype="float64")
    dur = len(x) / sr

    words = transcribe(wav)
    wt = [(w["start"], w["end"]) for w in words]
    L = levels(x, sr, wt)
    peak = db(np.max(np.abs(x))); clipped = int(np.sum(np.abs(x) >= 0.999))

    ref = [[t for t, _, _ in merge_letters(spoken_numbers(norm(l)))] for l in lines]
    hyp, hyp_w, header, header_words = tokens(words)
    rescued = 0
    if tid != "T00":
        # The recogniser sometimes drops a whole sentence from a long take (seen with a clean, well-read line after a
        # pause). Before calling a line missing, listen again to just the gap where it should be.
        ms, _ = match_lines(ref, hyp)
        extra_words = rescue(x, sr, words, hyp_w, ms, dur)
        if extra_words:
            rescued = len(extra_words)
            words = sorted(words + extra_words, key=lambda w: w["start"])
            wt = [(w["start"], w["end"]) for w in words]
            L = levels(x, sr, wt)
            hyp, hyp_w, header, header_words = tokens(words)

    notes, flagged, missing, retaken = [], [], [], []
    if rescued: notes.append(f"the first listen missed {rescued} word(s); a second listen to the gap found them")
    seg_dir = TAKES / "seg" / tid
    shutil.rmtree(seg_dir, ignore_errors=True); seg_dir.mkdir(parents=True)

    def line_result(k, mt):
        i0, i1 = hyp_w[mt["s"]][0], hyp_w[mt["e"] - 1][1]
        heard = " ".join(w["word"] for w in words[i0:i1 + 1])
        return dict(text=lines[k], heard=heard, wer=round(mt["cost"] / len(ref[k]), 3), word_range=[i0, i1])

    def write_seg(k, r, name, flag):
        i0, i1 = r["word_range"]
        t0, t1 = cut_span(x, sr, words, i0, i1, dur)
        sf.write(seg_dir / f"{name}.wav", x[int(t0 * sr):int(t1 * sr)], sr, subtype="PCM_24")
        meta = dict(text=r["text"], heard=r["heard"], wer=r["wer"], start=round(t0, 3), end=round(t1, 3))
        if flag: meta["flag"] = True
        json.dump(meta, open(seg_dir / f"{name}.json", "w"), indent=1)
        return meta

    results, readings = [], []
    if tid == "T00":   # read three times: segment each reading, keep the cleanest
        cursor = 0
        for r in range(3):
            ms, nxt = match_lines(ref, hyp[:], cursor, retakes=False)
            found = [m for m in ms if m]
            if len(found) < len(ref) / 2: break
            cost = sum(m["cost"] if m else len(ref[k]) for k, m in enumerate(ms))
            wer = cost / sum(map(len, ref))
            i0, i1 = hyp_w[found[0]["s"]][0], hyp_w[found[-1]["e"] - 1][1]
            t0, t1 = cut_span(x, sr, words, i0, i1, dur)
            snr = db(rms(np.concatenate([x[int(words[i]["start"] * sr):int(words[i]["end"] * sr)] for i in range(i0, i1 + 1)]))) - L["noise_floor_dbfs"]
            readings.append(dict(n=r + 1, wer=round(wer, 3), snr_db=round(snr, 1), start=round(t0, 2), end=round(t1, 2),
                                 matches=ms, heard=" ".join(w["word"] for w in words[i0:i1 + 1])))
            sf.write(seg_dir / f"T00_r{r + 1}.wav", x[int(t0 * sr):int(t1 * sr)], sr, subtype="PCM_24")
            cursor = nxt
        if not readings: notes.append("T00: could not find the reference text in the audio")
        else:
            best = min(readings, key=lambda r: (r["wer"], -r["snr_db"]))
            shutil.copy(seg_dir / f"T00_r{best['n']}.wav", seg_dir / "T00_pick.wav")
            json.dump(dict(text=" ".join(lines), heard=best["heard"], wer=best["wer"], snr_db=best["snr_db"], reading=best["n"],
                           start=best["start"], end=best["end"]), open(seg_dir / "T00_pick.json", "w"), indent=1)
            (seg_dir / "T00_pick.txt").write_text(" ".join(lines) + "\n")
            notes.append(f"T00: {len(readings)} reading(s) found; cleanest is reading {best['n']} (WER {best['wer']}, SNR {best['snr_db']} dB)")
            for r in readings:
                notes.append(f"  reading {r['n']}: WER {r['wer']} SNR {r['snr_db']} dB {r['start']}-{r['end']} s")
            matches = best["matches"]
    else:
        matches, _ = match_lines(ref, hyp)
    if tid != "T00" or readings:
        for k, mt in enumerate(matches):
            if mt is None: missing.append(k + 1); results.append(dict(line=k + 1, text=lines[k], missing=True)); continue
            r = line_result(k, mt); r["line"] = k + 1
            if len(mt["tries"]) > 1: retaken.append(k + 1)
            fl = r["wer"] > LINE_WER_FLAG
            if fl: flagged.append(k + 1)
            if tid != "T00":
                meta = write_seg(k, r, f"{tid}_{k + 1:02d}", fl)
                r["start"], r["end"] = meta["start"], meta["end"]
            r.pop("word_range"); results.append(r)
    total = sum(map(len, ref))
    errs = sum((m["cost"] if m else len(ref[k])) for k, m in enumerate(matches)) if (tid != "T00" or readings) else total
    take_wer = errs / total

    # extra speech: ASR words outside the chosen windows (retakes, slips, chatter)
    covered = set()
    for mt in (matches if (tid != "T00" or readings) else []):
        if mt:
            for t in range(mt["s"], mt["e"]): covered.update(range(hyp_w[t][0], hyp_w[t][1] + 1))
    extras, run = [], []
    for i in range(len(words) + 1):
        if i < len(words) and i not in covered and not (header and i < header_words): run.append(i)
        else:
            if len(run) >= 2 and tid != "T00": extras.append(dict(at=round(words[run[0]]["start"], 1), text=" ".join(words[j]["word"] for j in run)))
            run = []

    # verdict
    redo, warn = [], []
    if peak >= -0.1 and clipped > 20: redo.append(f"clipping: peak {peak:.1f} dBFS, {clipped} samples >= 0.999")
    if L["noise_floor_dbfs"] > -50: redo.append(f"noise floor {L['noise_floor_dbfs']:.1f} dBFS (> -50)")
    elif L["noise_floor_dbfs"] > -60: warn.append(f"noise floor {L['noise_floor_dbfs']:.1f} dBFS (> -60)")
    if L["snr_db"] < 30: redo.append(f"SNR {L['snr_db']:.1f} dB (< 30)")
    if info["sample_rate"] < 44100: redo.append(f"source sample rate {info['sample_rate']} Hz (< 44100)")
    if take_wer > TAKE_WER_REDO: redo.append(f"take WER {take_wer:.3f} (> {TAKE_WER_REDO})")
    if peak < -20: warn.append(f"peak {peak:.1f} dBFS: too quiet")
    h = hum(x, sr)
    if h: warn.append(f"hum at {h['hz']} Hz (+{h['peak_over_floor_db']} dB over neighbours)")
    if info["codec"] not in ("alac", "pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "flac"):
        warn.append(f"source codec {info['codec']} is lossy; Voice Memos should be set to Lossless")
    bad_lines = sorted(set(flagged) | set(missing))
    verdict = "REDO" if redo else (f"REDO LINES ({', '.join(map(str, bad_lines))})" if bad_lines else "PASS")

    report = dict(take=tid, file=src.name, verdict=verdict, redo_reasons=redo, warnings=warn, source=info,
                  duration_s=round(dur, 2), wav_sample_rate=sr, peak_dbfs=round(peak, 2), clipped_samples=clipped,
                  lufs=lufs(wav), **{k: round(v, 2) for k, v in L.items()}, hum=h, wer=round(take_wer, 3),
                  header_heard=header, flagged_lines=flagged, missing_lines=missing, retaken_lines=retaken,
                  extra_speech=extras, notes=notes, lines=results, asr_words=len(words))
    json.dump(report, open(TAKES / "report" / f"{tid}.json", "w"), indent=1)

    P = print
    P(f"== {tid}  {src.name}: {verdict}")
    P(f"source: {info['codec']} {info['sample_rate']} Hz {info['bit_depth'] or '?'}-bit {info['channels']}ch {info['duration']:.1f} s"
      f"  -> {sr} Hz mono 24-bit wav")
    P(f"peak {peak:.1f} dBFS, clipped {clipped}, loudness {report['lufs']} LUFS, speech RMS {L['speech_rms_dbfs']:.1f} dBFS")
    P(f"noise floor {L['noise_floor_dbfs']:.1f} dBFS (p10 frame {L['p10_frame_dbfs']:.1f}), SNR {L['snr_db']:.1f} dB, hum: {h or 'none'}")
    P(f"ASR: {len(words)} words, take WER {take_wer:.3f}" + (f", header heard '{header}'" if header else ""))
    for r in redo: P("  REDO:", r)
    for r in warn: P("  warn:", r)
    for n in notes: P("  " + n)
    if missing: P(f"  missing lines ({len(missing)}): {', '.join(map(str, missing))}")
    if retaken: P(f"  retaken (last used): lines {', '.join(map(str, retaken))}")
    for r in results:
        if r.get("wer", 0) > LINE_WER_FLAG: P(f"  line {r['line']} WER {r['wer']}: expected '{r['text']}' -> heard '{r['heard']}'")
    for e in extras: P(f"  extra speech @{e['at']}s: '{e['text']}'")
    P(f"segments: {seg_dir}  report: takes/report/{tid}.json")

if __name__ == "__main__":
    main()
