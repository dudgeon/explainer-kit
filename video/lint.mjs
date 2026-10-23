#!/usr/bin/env node
// Scenes are pure functions of the frame (style/motion.md). Anything on a wall clock flickers or
// vanishes in a frame-by-frame render, so it fails the build.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), 'src');
const banned = [
  [/\bDate\.now\s*\(/, 'Date.now()'],
  [/\bnew Date\s*\(/, 'new Date()'],
  [/\bperformance\.now\s*\(/, 'performance.now()'],
  [/\bsetTimeout\s*\(|\bsetInterval\s*\(|\brequestAnimationFrame\s*\(/, 'a timer'],
  [/\bMath\.random\s*\(/, 'Math.random() (use remotion random(seed))'],
  [/\btransition\s*:/, 'a CSS transition'],
  [/\banimation\s*:|@keyframes/, 'a CSS animation'],
  [/\banimate-\w+/, 'a Tailwind animation'],
];
const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
let bad = 0;
for (const f of files(src).filter((f) => /\.(tsx?|css)$/.test(f))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, what] of banned) if (re.test(line)) { console.error(`lint: ${relative(src, f)}:${i + 1} uses ${what}`); bad++; }
  });
}
process.exit(bad ? 1 : 0);
