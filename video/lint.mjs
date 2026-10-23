#!/usr/bin/env node
// Scenes are pure functions of the frame. Anything on a wall clock flickers or vanishes in a frame-by-frame render,
// so it fails the build. And the look reaches a scene only through timeline.json (src/scenes/house/kit.tsx useStyle):
// a direct import of style/tokens.json would be baked in by the bundler with the base look, so no restyle or per-film
// look would reach it. Only kit.tsx and Root.tsx may import it.
// The look is also never written into a scene: colours and fonts come from the tokens, by role name, through the
// house kit. So a hex colour literal or a font-family string anywhere under src/ except src/scenes/house/ (the kit)
// fails too; a restyle then changes every scene and cannot miss one.
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
// Hex colours (#rgb, #rgba, #rrggbb, #rrggbbaa) outside the kit; not an HTML entity (&#123;) or an id reference
// (url(#kit-arrow) has a letter past f in it, so it never matches).
const LOOK_OK = (rel) => rel.startsWith('scenes/house/');
const hex = /(?<![&\w])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/;
// A font family written as a string: fontFamily="Georgia", fontFamily: 'Menlo', fontFamily={'…'}, font-family: … in CSS.
const fontString = /font-?family\s*[:=]\s*\{?\s*['"`]|font-family\s*:\s*[\w"']/i;
const files = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return f.startsWith('_') || f.startsWith('.') ? [] : files(p);
  return [p];
});
/** The problems in one file's text (rel: its path under src/). */
export function lintText(rel, text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    for (const [re, what] of banned) if (re.test(line)) found.push(`${at} uses ${what}`);
    if (!LOOK_OK(rel) && hex.test(line)) found.push(`${at} has a colour literal (${line.match(hex)[0]}); use a role from the kit (color="accent") or useStyle().color`);
    if (!LOOK_OK(rel) && fontString.test(line)) found.push(`${at} names a font; use the kit's type (Label, Serif, Para) or useStyle().font`);
    if (tokensImport.test(line) && !TOKENS_OK.has(rel)) found.push(`${at} imports tokens.json; read the look with useStyle() from src/scenes/house/kit.tsx`);
  });
  return found;
}

// node lint.mjs --self-test: the look rules against probes that must fail and probes that must pass.
if (process.argv.includes('--self-test')) {
  const fail = [
    ['scenes/probe/A.tsx', '<rect fill="#ff0000" />'],
    ['scenes/probe/A.tsx', "<div style={{color: '#abc'}} />"],
    ['scenes/probe/A.tsx', '<div style={{border: `1px solid #24221eaa`}} />'],
    ['scenes/probe/A.tsx', '<text fontFamily="Georgia, serif">x</text>'],
    ['scenes/probe/A.tsx', "<div style={{fontFamily: 'Menlo'}} />"],
    ['lib/A.tsx', '<rect fill="#fff" />'],
    ['scenes/probe/A.tsx', "import tokens from '../../../style/tokens.json';"],
  ];
  const pass = [
    ['scenes/probe/A.tsx', '<Label x={1} y={2} text="ok" color="accent" />'],
    ['scenes/probe/A.tsx', '<text fontFamily={SERIF} fill={C.ink}>x</text>'],
    ['scenes/probe/A.tsx', '<path markerEnd="url(#kit-arrow)" /> &#123; #face-off'],
    ['scenes/house/kit.tsx', "import tokens from '../../../style/tokens.json'; const x = '#f3f0e8'; <text fontFamily=\"Menlo\" />"],
  ];
  let wrong = 0;
  for (const [rel, text] of fail) { const f = lintText(rel, text); console.log(`${f.length ? 'fails, as it should' : 'PASSES, WRONGLY'}: ${rel}: ${text}${f.length ? `\n    ${f.join('\n    ')}` : ''}`); if (!f.length) wrong++; }
  for (const [rel, text] of pass) { const f = lintText(rel, text); console.log(`${f.length ? 'FAILS, WRONGLY' : 'passes, as it should'}: ${rel}: ${text}${f.length ? `\n    ${f.join('\n    ')}` : ''}`); if (f.length) wrong++; }
  process.exit(wrong ? 1 : 0);
}

let bad = 0;
for (const f of files(src).filter((f) => /\.(tsx?|css)$/.test(f))) {
  for (const p of lintText(relative(src, f), readFileSync(f, 'utf8'))) { console.error(`lint: ${p}`); bad++; }
}
process.exit(bad ? 1 : 0);
