# Explainer Kit

Make short narrated explainer videos on your own Mac, with Claude Code doing the work alongside you.

You give it your sources (pages, PDFs, notes). Claude reads them, writes a script with you, draws the pictures, narrates it and renders a finished film. Everything runs on your Mac.

Watch the demo, which was made with the kit: [[demo video link]]

The kit does three things:

1. **Make an explainer.** From your sources to a finished square video, about 3 to 6 minutes long. You can edit the script afterwards and rebuild only what changed.
2. **Use your own voice.** Record yourself reading a short script on your phone, and the kit makes a narrator that sounds like you. Until then, films use the kit's own designed voice (the "house voice").
3. **Change the look.** The films have a house style: ink drawings on warm paper with one accent colour. Claude can help you design a different one and shows you real frames to choose from.

## What you need

- A Mac with Apple silicon (M1 or later) and macOS 15 or newer.
- At least 16 GB of memory. Fine-tuning your own voice needs 32 GB or more (see the table below).
- [Claude Code](https://claude.com/claude-code).
- [Homebrew](https://brew.sh), and these tools from it: `brew install uv ffmpeg node`
- Free disk space:

| Part | Download | When |
|---|---|---|
| The base kit (house voice, speech check, video tools) | about 6.5 GB of models, plus about [[WP8: base install size on disk]] of tools | always |
| Quick clone of your voice | about 1 GB | only if you want your own voice |
| Fine-tuning your voice | about 5 GB of models plus 2.6 GB of tools | only on a 32 GB Mac |
| Making your own music | about 9.4 GB | optional; the kit ships a music bed |

Your films also need room while they build: [[WP8: cache size for a 5-minute film]].

## Which tasks work on which Mac

| | 16 GB | 24 GB | 32 GB or more |
|---|---|---|---|
| Make an explainer with the house voice | yes | yes | yes |
| Change the look | yes | yes | yes |
| Quick clone of your voice | yes | yes | yes |
| Fine-tune your voice | no | not offered by default (see below) | yes |
| Narrate with a fine-tuned voice | no | probably; measured later | yes |
| Make your own music | [[WP8: yes/no]] | [[WP8: yes/no]] | yes |

Memory each task needs (peak, measured on a 32 GB Mac unless marked):

| Task | Memory it uses | Time |
|---|---|---|
| Narrate a 5-minute film, house voice | [[WP8: peak GiB]] | [[WP8: minutes]] |
| Narrate with a quick clone | [[WP8: peak GiB]] | [[WP8: minutes]] |
| Render a 5-minute film | [[WP8: peak GiB]] | [[WP8: minutes]] |
| Narrate with a fine-tuned voice | about 13 GiB of GPU memory | [[WP8: minutes]] |
| Fine-tune your voice | about 15.5 GiB of GPU memory, 17.5 GB in all | about 20 minutes |
| Make a music bed | [[WP8: peak GiB]] | [[WP8: minutes]] |

**About 24 GB Macs.** The 24 GB figures are estimates made from the 32 GB measurements, not runs on a real 24 GB Mac; they will be measured later. [[WP8: 24 GB expectation table, marked as simulated where it is]] Until then the kit does not offer fine-tuning on 24 GB, because training leaves little room for macOS and anything else you have open. You can still try it, at your own risk, if Claude's memory check allows.

Before any heavy job (narrating, rendering, training, making music), the kit checks how much memory is free. If there isn't enough, Claude tells you which apps to quit (usually the browser, Slack, Teams, Docker, Xcode or other large apps) and waits for you. Only one heavy job runs at a time.

## Download and set up

1. Get the kit, either way:
   - **Download ZIP:** on the kit's GitHub page (https://github.com/dudgeon/explainer-kit), click **Code**, then **Download ZIP**, and double-click the ZIP to unpack it. Move the folder wherever you like.
   - **Or with git:** `git clone https://github.com/dudgeon/explainer-kit.git`
2. Open Terminal in that folder and run:

   ```
   ./setup.sh
   ```

   This checks your tools, installs the video packages and downloads the house voice and the speech checker (about 6.5 GB). It takes about [[WP8: setup time on a typical connection]]. If macOS says "permission denied", run `bash setup.sh` instead.

Optional parts, any time later (Claude will offer them when you need them):

- `./setup.sh --voice-quick` for a quick clone of your own voice (any Mac).
- `./setup.sh --voice-train` for fine-tuning your voice (32 GB Macs only; it refuses on a smaller one).
- `./setup.sh --music` to make your own music beds.

You can run setup again at any time: it skips what is already done. `./setup.sh --check` shows what is installed without changing anything. Setup is the only step that uses the internet. After it finishes, the kit works offline.

## Start

In the kit's folder, run `claude` and say hello. Claude checks that setup has run, then asks which of the three tasks you want. You don't need to edit any code or learn any commands; Claude runs them and explains what it is doing.

**Make an explainer.** Claude asks for a short name, your sources, who the film is for, how long it should be, which voice and which shape (square, or wide 16:9). It reads every source, writes the script with you, draws each scene, narrates and renders. You get the video, a sheet of stills and a short report saying what to look at.

**Use my own voice.** Claude checks your Mac's memory and tells you what is possible on it. You record on your iPhone with Voice Memos, in a quiet room, from a script in the kit. For a quick clone you read one paragraph three times (about 2 minutes). For a fine-tune you read the whole script (about 25 minutes). Claude checks every recording and tells you if one needs redoing.

> **How good is the quick clone?** It is a likeness made from one short reading, not a trained copy of your voice. People who know you will recognise it, but it is not exact: it can drift in tone or pace from line to line, and it may say names differently from you. In tests it scored 0.747 speaker similarity on the harder test lines, against 0.800 for a fine-tune (higher is closer). A fine-tune, on a 32 GB Mac, holds your tone, pace and the way you say names more steadily. Listen to a few lines before you narrate a whole film with either.

**Change the look.** Claude asks what you want to change (colours, fonts, the drawing style) and for two or three references you like. It writes down what it sees in each, then renders the same scenes in two or three candidate looks and gives you one page to compare them on. You pick, and the look applies to your films from then on.

## How making an explainer works

```
your sources  ->  research notes  ->  script  ->  check  ->  pictures  ->  voice  ->  render  ->  you review
                  (every claim                (seconds,                                         |
                   from a source               no GPU)                                          v
                   Claude opened)                                             edit and rebuild what changed
```

- Each explainer has a folder, `projects/<name>/`: your sources, the research notes, the script, and a log of decisions.
- The script is a two-column table: what the voice says, and what is on screen. It is a plain file you can edit yourself. If you use Claude Docs, you can paste it into a Doc to comment on and paste it back, but you don't have to.
- Nothing is narrated that isn't backed by a source Claude actually opened.
- The film is in `video/out/<name>/<name>.mp4`: 1080 x 1080, loudness at -16 LUFS, no captions. A film can have its own shape and length.

### Changing a film after it is made

Everything is cached, so a rebuild only redoes what your change affects:

| What you change | What is re-narrated | What is re-rendered | Uses the GPU | Typical time |
|---|---|---|---|---|
| The words of one line | that line | that scene (and the next, if it runs over) | yes | [[WP8: minutes]] |
| What a scene shows | nothing | that scene, once Claude has redrawn it | for the render | [[WP8: minutes]] |
| The drawing code of a film | nothing | every scene of that film | for the render | [[WP8: seconds per second of film]] |
| The look | nothing | every scene of every film you build next | for the render | a full render |
| The voice | everything | everything | yes | [[WP8: minutes]] |
| The music settings | nothing | the soundtrack only | only if you make new music | [[WP8: minutes]] |

Ask Claude for "a quick look" to get a half-size draft, or for one scene on its own.

## Privacy

- Everything runs on your Mac. Your sources, scripts, recordings and voices are never uploaded anywhere by the kit.
- Your recordings and voices stay in `voice/takes/` and `voice/voices/`, which git ignores, so they can't be committed by accident.
- Before you publish or share anything from this folder (a fork, a copy, a ZIP), run `scripts/check-repo.sh`. It refuses if it finds audio, voice weights, personal paths or anything else that should stay private.
- Record only your own voice, or the voice of someone who has clearly agreed to it.

## Licences

- The kit's own code and text: MIT (see `LICENSE`).
- **Remotion**, which renders the films, has its own licence. It is free for individuals, for companies of up to 3 people, and for non-profits. Larger companies need a Remotion Company License. The licence applies to whoever renders, so check it if you make films for work. Its terms change slightly at version 5.0.
- The speech models are downloaded at setup, not shipped: Qwen3-TTS (Apache-2.0), Parakeet (CC-BY-4.0), VoxCPM2 (Apache-2.0), the ECAPA speaker model (Apache-2.0). The optional music model, ACE-Step, is MIT.
- **The house voice and the music bed.** The house voice is synthetic: it was designed with Qwen3-TTS VoiceDesign from a written description, and nobody's recording is in it. Its reference clip and the shipped music bed are released as CC0 (public domain). CC0 removes the kit's own claims, but it cannot remove the terms of the models that made the audio, and we have not confirmed what the model makers say about generated audio. If that matters for your use, you can:
  - design a different house voice from your own description, or use your own voice,
  - make your own music bed with `./setup.sh --music`, or
  - build the film without music and add your own licensed track in a video editor.

`NOTICES.md` has the full details, including what is still unconfirmed.
