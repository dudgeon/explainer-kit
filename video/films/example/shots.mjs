#!/usr/bin/env node
// The example film's shots: writes films/example/shots.json from one event map. Both scenes are the house paper card
// (src/scenes/house/PaperCard.tsx); its accent rule draws on the `mark` event. Copy this file for a new film and
// change the scene kind, the events and the requires lists.   node films/example/shots.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseScript} from '../../pipeline/script.mjs';
import {noteSha} from '../../pipeline/check.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// scene → line → event name → word (or [word, nth]); null = the line's start. Use plain words the speech check hears
// reliably: no product names or contractions.
const EVENTS = {
  S0: {1: {mark: 'script'}},
  S1: {1: {mark: 'picture'}},
};
// One requires item per Shot: line: what the line asks for, and what in the build realises it.
const REQUIRES = {
  S0: [{what: 'Line 1: the title draws in, the accent rule draws on "script"; the settled card is the poster', by: ['src:src/scenes/house/PaperCard.tsx', 'event:mark']}],
  S1: [{what: 'Line 1: the paper carries over, the new title replaces the last, the rule draws on "picture"', by: ['src:src/scenes/house/PaperCard.tsx', 'transition', 'event:mark']}],
};

const out = {$note: 'Written by films/example/shots.mjs; edit that, not this.'};
Object.entries(EVENTS).forEach(([id, lines], si) => {
  const events = {};
  for (const [n, evs] of Object.entries(lines))
    for (const [name, w] of Object.entries(evs)) events[name] = w === null ? {line: +n} : Array.isArray(w) ? {line: +n, word: w[0], nth: w[1]} : {line: +n, word: w};
  // The first scene is the poster (thumbnail: seconds from its end when negative); every later one names its way in.
  out[id] = {kind: 'drawn', scene: 'paper-card', ...(si === 0 ? {thumbnail: -0.5, leadIn: 0.8} : {transitionIn: 'paper-carry'}), tail: 1.2, events, requires: REQUIRES[id]};
});
for (const sc of parseScript(readFileSync(join(here, 'script.md'), 'utf8')).scenes) if (out[sc.id]) out[sc.id].shotSha = noteSha(sc);
writeFileSync(join(here, 'shots.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote films/example/shots.json');
