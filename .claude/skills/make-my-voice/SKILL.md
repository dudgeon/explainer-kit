---
name: make-my-voice
description: Make a narrator from the user's own recorded voice, as a quick clone (any Mac) or a fine-tune (32 GB Macs), and use it for films. Use when the user says "use my voice", "clone my voice", "record my voice", "train my voice", "narrate in my own voice" or "make my voice".
---

# Make my voice

The user records on their phone; you check each recording, build the voice and help them choose it by ear. The user is not a developer: you run every command, from the kit's root folder. Ask choices with AskUserQuestion.

Privacy, said to the user at the start: the recordings, training runs and voices stay on this Mac, in `voice/takes/`, `voice/runs/` and `voice/voices/`, which git ignores. Nothing is uploaded.

Heavy commands go through `scripts/run-heavy.sh`. If it exits 3, list the apps it names and ask "I quit them, check again" / "Use the quick clone instead" / "Stop for now".

## 1. Consent and a name

Ask: "Is this your own voice?" with options "Yes, my own voice" / "Someone else's, and they have clearly agreed" / "Neither". On "Neither", stop: the kit only makes voices of people who agreed. Ask for a short name for the voice (lowercase letters, digits and dashes, for example `sam`).

## 2. What this Mac can do

```
scripts/preflight.sh voice-quick
KIT_PREFLIGHT_SIZE_ONLY=1 scripts/preflight.sh train-full
```

The first says whether there is memory for the quick clone now. The second exits 0 only on a Mac big enough to fine-tune (32 GB or more). Then tell the user plainly, in these words or close to them:

> **The quick clone** works on any Mac with 16 GB. You read one paragraph three times (about 2 minutes), and it is ready in minutes. It is a likeness made from that one reading, not a trained copy of your voice: people who know you will recognise it, but it is not exact. It can drift in tone or pace from line to line, and it may say names differently from you. In tests it scored 0.747 speaker similarity on the harder test lines, against 0.800 for a fine-tune (higher is closer).
>
> **A fine-tune** needs a Mac with 32 GB or more. You read the whole script (about 25 minutes), then training takes about 20 minutes. It holds your tone, pace and the way you say names more steadily across a whole film.

On a 24 GB Mac, say the fine-tune is not offered by default: its memory figures there are estimates, not yet measured, and training may not fit alongside macOS. On a 16 GB Mac, offer the quick clone only.

Ask: "Quick clone" / "Fine-tune" (only on 32 GB or more) / "Both: quick clone now, fine-tune after".

## 3. Setup

- Quick clone: `./setup.sh --voice-quick` (about 1 GB).
- Fine-tune: `./setup.sh --voice-train` (about 5 GB of models plus 2.6 GB of tools; it includes the quick-clone parts, and refuses on a Mac under 32 GB).

`./setup.sh --voice-quick --check` (or `--voice-train --check`) shows what is still missing without changing anything.

## 4. Recording

Send the user `voice/script/reading-script.md` (attach it if you can, otherwise `open` it). Go over its setup notes: Voice Memos set to Lossless, a small soft room, the phone still about a hand-span away, 3 seconds of silence first, the take number said aloud, each memo renamed to its take (`T00`, `T01` ... `H2`).
- Quick clone: T00 only, read three times in one memo. Add H1 and H2 if they want the voice scored.
- Fine-tune: all 15 takes. T00 and T01 first, so the setup can be checked before the rest.

Ask where the takes will land: the iCloud Drive folder `explainer-kit-takes` (the script's suggestion), AirDrop (usually `~/Downloads`), or another folder. Check each take as the user tells you it has arrived.

## 5. Check each take

```
scripts/run-heavy.sh --shared --task voice-house voice/.venv-eval/bin/python -I voice/tools/check_take.py "<path to the take>"
```

It copies the take into `voice/takes/`, cuts it into lines and prints a verdict. Say it in plain words:
- **PASS**: good to use.
- **REDO**, with reasons: clipping (too loud: move the phone back a little), noise floor above -50 dBFS or SNR under 30 dB (the room is noisy: find a quieter, softer room), a sample rate under 44.1 kHz (Voice Memos isn't set to Lossless), or a take WER above 0.15 (the reading wandered from the script).
- **REDO LINES**: only those lines. Look at what it printed as heard before you ask for a re-record:
  - The speech check spelled a well-read line differently (a name such as "Sophia" for "Sofia", "Meshwire" for "Mesh wire", "on to" for "onto"): the line is fine. Keep the script's own words for it in `voice/script/overrides.json` (`{"T08_06": {"text": "<the script line>"}}`).
  - The user said a line a little differently but well: record what they said (`{"T05_03": {"text": "what they said"}}`).
  - Otherwise, leave the line out (`{"T05_03": {"drop": true}}`) or re-record the take.

  Then run `voice/.venv-eval/bin/python -I voice/tools/apply_overrides.py`. A dropped or still-flagged line is simply not trained on; a take needs no re-record for one or two of them.

For T00 the checker keeps the cleanest of the three readings as `voice/takes/seg/T00/T00_pick.wav` (and `.txt`, the words it says). After the takes are checked, record them:

```
voice/.venv-eval/bin/python -I voice/tools/takes_manifest.py
```

## 6. The quick clone

Make the voice folder from the T00 pick:

```
mkdir -p voice/voices/<name>-quick
cp voice/takes/seg/T00/T00_pick.wav voice/voices/<name>-quick/reference.wav
cp voice/takes/seg/T00/T00_pick.txt voice/voices/<name>-quick/reference.txt
```

Write `voice/voices/<name>-quick/voice.json`:

```
{"name": "<name>-quick", "engine": "qwen-clone", "mode": "clone", "ref_wav": "reference.wav", "ref_text_file": "reference.txt", "seed": 0, "tempo": 1.0, "said": {}}
```

Write `voice/voices/<name>-quick/CONSENT.md`: whose voice it is, that they agreed, today's date, and what it may be used for.

Then let the user hear it narrate the example film (a short draft, no music):

```
scripts/run-heavy.sh --task voice-quick node video/build.mjs --film example --voice <name>-quick --draft --no-score
```

Send `video/out/example/example-draft.mp4`. If they already have a film, `scripts/run-heavy.sh --task voice-quick node video/pipeline/voice-only.mjs --film <their film> --voice <name>-quick` narrates its lines too. Ask: "Keep it" / "Try another seed" / "Try another reading as the reference". Another seed: change `seed` in its `voice.json` and run the draft again. Another reading: copy `voice/takes/seg/T00/T00_r1.wav` (or `_r2`, `_r3`) over `reference.wav`; the words are the same.

## 7. The fine-tune (32 GB or more)

Check memory now (exit 3: ask the user to quit apps first). On a 32 GB Mac in everyday use (a browser and a few apps open) expect a WAIT: in a test it found 15.7 to 18.6 GiB free against the 20 GiB it asks for, so the user will usually need to quit the browser and other large apps first:

```
scripts/preflight.sh train-full
```

Build the training list from the checked takes, then train in the background:

```
voice/.venv/bin/python -I voice/train/build_manifest.py --out voice/runs/<name>/data
scripts/run-heavy.sh --task train-full voice/train/run_lora.sh <name> --iters 150 --save-interval 50
```

Training takes about 20 minutes on a 32 GB Mac (about 7 s a step) and saves a checkpoint every 50 steps in `voice/runs/<name>/ckpt/step_0000050` and so on. Every 10 steps `voice/runs/<name>/train.log` gets a line like `[kit-voice] step 40 7.1s/step mps_driver=14.4GiB`; report the step, the seconds per step and the memory. If the seconds per step grow past three times the first reading, the Mac is swapping: stop it politely with `pkill -TERM -f train_voxcpm_finetune.py` (it saves a checkpoint) and ask the user to quit apps. Running the same `run_lora.sh` line again resumes from the last checkpoint.

## 8. Choose a checkpoint by ear

This needs H1 and H2 recorded and checked. Voice the test lines with each checkpoint, and with no training as a baseline (the quick clone folder from step 6 supplies the reference clip):

```
scripts/run-heavy.sh --task voice-voxcpm voice/eval/speak_eval.sh <name>-step50 --voice <name>-quick --lora voice/runs/<name>/ckpt/step_0000050
scripts/run-heavy.sh --task voice-voxcpm voice/eval/speak_eval.sh <name>-step100 --voice <name>-quick --lora voice/runs/<name>/ckpt/step_0000100
scripts/run-heavy.sh --task voice-voxcpm voice/eval/speak_eval.sh <name>-step149 --voice <name>-quick --lora voice/runs/<name>/ckpt/step_0000149
scripts/run-heavy.sh --task voice-voxcpm voice/eval/speak_eval.sh <name>-zero --voice <name>-quick --lora none
```

(Use the checkpoint folders that are actually in `voice/runs/<name>/ckpt/`.) Then score them and make the listening page (both tools take paths inside `voice/`, so `eval/scores-<name>.json` is `voice/eval/scores-<name>.json`):

```
scripts/run-heavy.sh --task voice-house voice/.venv-eval/bin/python -I voice/eval/score.py --systems <name>-step50,<name>-step100,<name>-step149,<name>-zero --out eval/scores-<name>.json
voice/.venv-eval/bin/python -I voice/eval/make_page.py eval/scores-<name>.json
```

Send `voice/eval/index.html` (private, local, no network). Explain the numbers: SIM is how close each one sounds to the user's real held-out recordings (the "real" row is the ceiling), WER is how often the words come out wrong (lower is better). Ask which sounds most like them, with the best-scoring one as your recommendation.

## 9. Package the voice

```
voice/.venv/bin/python -I voice/train/package_voice.py voice/runs/<name>/ckpt/step_0000100 --name <name>
```

(With the checkpoint the user chose.) It writes `voice/voices/<name>/` with the reference from the T00 pick. Copy `CONSENT.md` into it. Then confirm nothing personal can be committed:

```
scripts/check-repo.sh
```

## 10. Use it, and what to know

- A film uses the voice named in `video/films/<film>/voice.json`: `{"voice": "<name>"}` or `{"voice": "<name>-quick"}`. `--voice <name>` on a build tries it once without changing the file.
- Narrating with your voice: add `--task voice-quick` (quick clone) or `--task voice-voxcpm` (fine-tune) after `scripts/run-heavy.sh` in the make-explainer commands.
- Changing a film's voice re-narrates and re-renders all of it.
- A voice is just a folder. Keep old folders to keep older films sounding the same. To keep voices somewhere else (another disk, say), move the folders there and set `KIT_VOICE_DIR` to that folder; `--voice` also accepts a folder path.
- The voice is personal data. Never share `voice/voices/`, `voice/takes/` or `voice/runs/`.
