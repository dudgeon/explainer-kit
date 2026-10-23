# Your own voice

This folder turns a short recording of your voice into a narrator the kit can use for your films. You don't need to run anything here by hand: ask Claude to **make my voice** and the `make-my-voice` skill walks you through recording, checking and building it. This page says what you'll get.

## Two ways to make it

| | Quick clone | Fine-tune |
|---|---|---|
| Mac memory | 16 GB or more | **32 GB or more** |
| You record | the 10-second reference (T00), about 2 minutes with setup | the whole reading script, about 25 minutes |
| Time to build | a few minutes | about 20 minutes of training on a 32 GB Mac (150 steps at about 7 s each), then scoring |
| Extra download | about 1 GB (the take checker) | about 5 GB of models plus 2.6 GB of tools |

**How accurate is the quick clone?** It is a likeness made from one short reading, not a model of your voice. People who know you will recognise it, but it is not exact: it can drift in tone or pace from line to line, and it may say unusual names differently from you. In our tests it scored 0.747 speaker similarity to the real voice on the harder test lines, against 0.800 for a fine-tune (higher is closer). A fine-tune learns from all 15 takes, so it holds your tone, pace and the way you say names and numbers more steadily. Listen to a few lines of either before you narrate a whole film with it.

Fine-tuning needs a Mac with 32 GB of memory or more: training peaks at about 15 GiB of GPU memory, and speaking with the trained voice at about 13 GiB. On a smaller Mac the kit offers the quick clone instead and says so before you record the long script. Even on a 32 GB Mac, expect to quit your browser and other large apps before training: the kit checks free memory first and waits until about 20 GiB is free (in a test with a browser and a few apps open, it found 16 to 19 GiB).

## What's here

- `script/reading-script.md`: what you read, and how to set up the phone and the room. `script/takes.json` is generated from it by `tools/parse_script.py`.
- `tools/`: the take checker (audio quality, plus a transcript compared with the script) and model fetching.
- `train/`: the fine-tune recipe (`lora.yaml`), its runner and packaging.
- `eval/`: scoring a voice against your held-out takes (H1, H2), and a private listening page.
- `bin/speak`: speak text with a voice you made.
- `voices/`: the voices you make. `takes/` and `runs/` hold your recordings and training runs.

## Privacy

Your recordings, training runs and voices stay on this Mac. `voices/`, `takes/` and `runs/` are ignored by git, and `scripts/check-repo.sh` refuses to let them into a commit. Everything runs locally; no audio is sent anywhere.

Record only your own voice, or someone's who has agreed to it.
