#!/usr/bin/env python3
"""Check TTS WAVs against expected text with parakeet-mlx.
Usage (from video/voice/): .venv/bin/python -I asr_check.py <dir-with-wavs-and-json> [id ...]
Reads <id>.json (needs "text"), writes <id>.asr.json. Exit 1 if any line fails.
Pass: WER <= 0.05, no content word missing/added, 2 <= words/sec <= KIT_MAX_WPS (default 4.0), no internal gap > 1.5 s.
"""
import json, os, re, sys
from pathlib import Path

os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")  # parakeet shells out to ffmpeg
MODEL = Path(os.environ.get("KIT_MODELS", Path.home() / "Library/Caches/explainer-kit/models")) / "parakeet-tdt-0.6b-v3"
STOP = set("a an the of to in on at for and or but is are was were be it its this that with as by from so".split())
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
    words = num_words(n).split()
    last = words[-1]
    words[-1] = ORD.get(last, last[:-1] + "ieth" if last.endswith("y") else last + "th")
    return " ".join(words)


def norm(text):
    t = text.lower().replace("&", " and ").replace("%", " percent")
    t = re.sub(r"(?<=[a-z0-9])\.(?=[a-z0-9])", " dot ", t)  # "prd.md" is said "prd dot md"
    t = re.sub(r"\ba (hundred|thousand)\b", r"one \1", t)  # "a hundred" is heard as "100", "one hundred"
    t = re.sub(r"\b(hundred|thousand) and\b", r"\1", t)  # and "a hundred and eighty" as "180"
    t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: " " + ordinal(int(m.group(1))) + " ", t)  # "5th" is said "fifth"
    t = re.sub(r"(\d+)", lambda m: " " + num_words(int(m.group(1))) + " ", t)
    # Contractions count the same as their long form, either way round ("you are" heard as "you're").
    t = re.sub(r"[’]", "'", t)
    for a, b in (("n't", " not"), ("'re", " are"), ("'ll", " will"), ("'ve", " have"), ("'m", " am"), ("'d", " would")):
        t = t.replace(a, b)
    t = re.sub(r"\b(it|that|there|what|he|she)'s\b", r"\1 is", t)
    t = re.sub(r"\bvs\b\.?", "versus", t)
    t = re.sub(r"[^a-z' ]", " ", t.replace("-", " ")).replace("'", "")
    return t.split()


HEARD_AS = {w: name for name, heard in json.load(open(Path(__file__).with_name("heard-as.json"))).items()
            if not name.startswith("$") for w in heard if " " not in w}


HEARD_MULTI = sorted(((w, name) for name, heard in json.load(open(Path(__file__).with_name("heard-as.json"))).items()
                      if not name.startswith("$") for w in heard if " " in w), key=lambda p: -len(p[0]))


def canon(words):
    # A name may be several words: a heard "cli" scores as the spelled-out "c l i", and a name heard as several words
    # ("open spec") scores as the one it stands for.
    s = " ".join(words)
    for heard, name in HEARD_MULTI:
        s = re.sub(rf"\b{re.escape(heard)}\b", name, s)
    return [x for w in s.split() for x in HEARD_AS.get(w, w).split()]


def edit_ops(ref, hyp):
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1): d[i][0] = i
    for j in range(m + 1): d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (ref[i-1] != hyp[j-1]))
    i, j, miss, extra = n, m, [], []
    while i or j:
        if i and j and d[i][j] == d[i-1][j-1] + (ref[i-1] != hyp[j-1]):
            if ref[i-1] != hyp[j-1]: miss.append(ref[i-1]); extra.append(hyp[j-1])
            i, j = i - 1, j - 1
        elif i and d[i][j] == d[i-1][j] + 1: miss.append(ref[i-1]); i -= 1
        else: extra.append(hyp[j-1]); j -= 1
    return d[n][m], miss, extra


def words_from(result):
    words = []
    for s in result.sentences:
        for tk in s.tokens:
            if tk.text.startswith(" ") or not words:
                words.append({"word": tk.text.strip(), "start": tk.start, "end": tk.end})
            else:
                words[-1]["word"] += tk.text; words[-1]["end"] = tk.end
    return words


def main(d, ids):
    import soundfile as sf
    from parakeet_mlx import from_pretrained
    model = from_pretrained(str(MODEL))
    d = Path(d); bad = 0
    for jp in sorted(d.glob("*.json")) if not ids else [d / f"{i}.json" for i in ids]:
        if jp.name.endswith(".asr.json"): continue
        meta = json.load(open(jp)); wav = jp.with_suffix(".wav")
        dur = sf.info(wav).duration
        words = words_from(model.transcribe(wav))
        ref, hyp = canon(norm(meta.get("expect", meta["text"]))), canon(norm(" ".join(w["word"] for w in words)))
        errs, miss, extra = edit_ops(ref, hyp)
        wer = errs / max(1, len(ref))
        cmiss = [w for w in miss if w not in STOP]; cextra = [w for w in extra if w not in STOP]
        lead = words[0]["start"] if words else dur
        trail = dur - words[-1]["end"] if words else dur
        gaps = [round(b["start"] - a["end"], 2) for a, b in zip(words, words[1:])]
        spoken = (words[-1]["end"] - words[0]["start"]) if words else dur
        wps = len(words) / spoken if spoken > 0 else 0
        reasons = []
        if wer > 0.05: reasons.append(f"WER {wer:.3f}")
        if cmiss or cextra: reasons.append(f"content words missing {cmiss} / added {cextra}")
        max_wps = float(os.environ.get("KIT_MAX_WPS", "4.0"))
        if not 2 <= wps <= max_wps: reasons.append(f"words/sec {wps:.2f} outside 2-{max_wps}")
        if gaps and max(gaps) > 1.5: reasons.append(f"internal silence {max(gaps)}s")
        out = dict(id=meta["id"], expected=meta.get("expect", meta["text"]), seed=meta.get("seed"), heard=" ".join(w["word"] for w in words), wer=round(wer, 4),
                   words_per_sec=round(wps, 2), leading_silence_s=round(lead, 2), trailing_silence_s=round(trail, 2),
                   max_internal_gap_s=max(gaps) if gaps else 0, missing_content=cmiss, added_content=cextra,
                   duration_s=round(dur, 2), words=words, passed=not reasons, fail_reasons=reasons)
        json.dump(out, open(jp.with_suffix(".asr.json"), "w"), indent=2)
        bad += bool(reasons)
        print(f"{'PASS' if not reasons else 'FAIL'} {meta['id']}: WER {wer:.3f} wps {wps:.2f} lead {lead:.2f} trail {trail:.2f} {reasons}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
