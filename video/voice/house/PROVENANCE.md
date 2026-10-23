# Where the house voice came from

`reference.wav` is the house narrator's reference clip. Every house-voice line is cloned from it (see `voice.json`).
This file records how the clip was made and how that was checked.

## The claim

The clip is the direct output of Qwen3-TTS VoiceDesign given **a text description and nothing else**. No human
recording was involved. VoiceDesign takes no reference audio: its only inputs are the description (`instruct`), the
text to speak and the random seed.

The inputs, all in `voice.json`:

| Input | Value |
| --- | --- |
| Model | `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16` at commit `7d3824abff87e49756bb0f83fb5411de75d160c4` |
| Description | `designed_from.description` |
| Text spoken | `ref_text` |
| Seed | 14 (`designed_from.seed`; `mx.random.seed(14)` before generation) |
| Tool | `video/voice/tts.py`, design mode (`model.generate(text=..., lang_code="english", instruct=...)`, written as 16-bit PCM WAV) |

The clip itself: 24 kHz, mono, 16-bit, 9.28 s, 445484 bytes, sha256
`0b0f125e0cb36e9af223db5bfd60c514ab2177c772e950dbb016aba24beb948d`. `scripts/check-repo.sh` fails if the file
stops matching `voice.json`'s `sha256`.

## The check (2026-10-23)

The clip was regenerated from `designed_from` alone, in a scratch folder outside the repo, and compared byte for byte
with the shipped file.

1. The VoiceDesign model was placed in the kit's model cache (`$KIT_MODELS`, default
   `~/Library/Caches/explainer-kit/models`) at the pinned commit. Its weights hash to the Hub's own LFS ids:
   `model.safetensors` sha256 `96ae28bec2205ec0b5e0c750bea2b8a5deac4f14d33a8a25a5f753299486b70e`,
   `speech_tokenizer/model.safetensors` sha256 `836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`.
   `./setup.sh` does not fetch this model (only the house voice's Base model and the speech check need to be on a
   user's Mac), so it was added for this check and is not part of a normal install.
2. A job file was written from `voice.json`:
   `{"lines": [{"id": "regen-s14", "text": <ref_text>, "seed": 14}], "voice": {"mode": "design", "description": <designed_from.description>, "seed": 14}, "out_dir": "<scratch>/out"}`.
3. It was run through the GPU lock, from `video/voice/`:
   `../../scripts/run-heavy.sh --task voice-house -- .venv/bin/python -I tts.py <scratch>/job.json`.
   It produced 9.28 s of audio in 5.3 s.
4. The output was compared with the shipped clip: `shasum -a 256` and `cmp`.

**Result: bit-identical.** The regenerated file's sha256 is
`0b0f125e0cb36e9af223db5bfd60c514ab2177c772e950dbb016aba24beb948d`, the same as `reference.wav`. `cmp` reports no
difference, and both files are 445484 bytes.

As a control, the same job with seed 15 produced a different file (10.00 s, sha256
`941e4d790028497ea3c13dd037f37ceac821fafc86ceab2909d0602c83961f06`). So the match comes from the inputs, not from a
cached or copied file.

Bit identity made a similarity measure unnecessary. No ECAPA or spectral comparison was run; the eval environment
was not built for this check.

### Environment

- Apple M6 Mac with 32 GB of memory, macOS 27.0 (build 26A428).
- Python 3.12.15, in the kit's narration venv (`video/voice/.venv`, built by `./setup.sh` with uv 0.12.22 from
  `video/voice/requirements.txt`, sha256 `a25be592…4838c`).
- mlx 0.32.3, mlx-metal 0.32.3, mlx-audio 0.5.8, numpy 2.5.4, soundfile 0.14.0, transformers 5.19.0. These are
  the same pins the clip was first made with.
- `tts.py` sha256 `b668907329a7fec607b592b3e09c61c7b09bc7f00b697c331be5476105a0bc55`.

## Conclusion

The clip is verifiably synthetic. Anyone with the pinned model and libraries can produce these exact bytes from a
one-sentence text description, a fixed sentence and seed 14, with no audio input. A recording of a person cannot
match a model's output bit for bit by chance. The shipped file is therefore that model output, and nothing else.

What this does **not** show:
- **Other machines.** Bit identity was shown on one Mac and one macOS version. Another Apple GPU or macOS release
  may run different Metal kernels and give slightly different samples. There, compare by speaker similarity
  (ECAPA, expect above 0.9) and by ear, rather than expecting the same sha.
- **Resemblance to real people.** Like any TTS model, VoiceDesign was trained on recordings of people. This check
  cannot show that the designed voice resembles no real speaker. It shows only that no person's recording was an
  input to this clip.
- **Licence of the output.** The clip's licence and the usage terms on generated audio are covered in `NOTICES.md`.
