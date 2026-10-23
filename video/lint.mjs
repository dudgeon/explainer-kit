#!/usr/bin/env node
// Scenes are pure functions of the frame. Anything on a wall clock flickers or vanishes in a frame-by-frame render,
// so it fails the build. And the look reaches a scene only through timeline.json (src/scenes/house/kit.tsx useStyle):
// a direct import of style/tokens.json would be baked in by the bundler with the base look, so no restyle or per-film
// look would reach it. Only kit.tsx and Root.tsx may import it.
// Folders under src/ whose name starts with `_` are scratch (never bundled, never committed) and are not linted.
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
// May import style/tokens.json: the kit (the style context's default) and Root (the composition's default size).
const TOKENS_OK = new Set(['scenes/house/kit.tsx', 'Root.tsx']);
const tokensImport = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"][^'"]*tokens\.json['"]/;
const files = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return f.startsWith('_') || f.startsWith('.') ? [] : files(p);
  return [p];
});
let bad = 0;
for (const f of files(src).filter((f) => /\.(tsx?|css)$/.test(f))) {
  const rel = relative(src, f);
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, what] of banned) if (re.test(line)) { console.error(`lint: ${rel}:${i + 1} uses ${what}`); bad++; }
    if (tokensImport.test(line) && !TOKENS_OK.has(rel)) {
      console.error(`lint: ${rel}:${i + 1} imports tokens.json; read the look with useStyle() from src/scenes/house/kit.tsx`);
      bad++;
    }
  });
}
process.exit(bad ? 1 : 0);
