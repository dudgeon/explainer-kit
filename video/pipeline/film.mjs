// Which film a build is for. The intro keeps its original paths (script.md, shots.json, out/, build/public); any other
// film lives in films/<name>/ (script.md, shots.json, an optional style/tokens.json merged over style/tokens.json) and
// builds to out/<name>/ with its own public dir build/<name>/public. The content-addressed .cache/ is shared.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {BuildError} from './util.mjs';

export const INTRO = 'intro';

/** The other films' names: the folders under films/. */
export const filmNames = (here) => [INTRO, ...(existsSync(join(here, 'films')) ? readdirSync(join(here, 'films'), {withFileTypes: true}).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name) : [])];

export function filmPaths(here, film = INTRO) {
  if (film === INTRO) {
    return {film, name: 'intro', dir: here, script: join(here, 'script.md'), shots: join(here, 'shots.json'), out: join(here, 'out'), pub: join(here, 'build/public'),
      lastBuild: 'last-build-script.json', anchors: 'anchors-used.json', styleOverride: null, publicDirArgs: []};
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(film)) throw new BuildError(`film: "${film}" isn't a film name (lowercase letters, digits, dashes)`);
  const dir = join(here, 'films', film);
  if (!existsSync(join(dir, 'script.md'))) throw new BuildError(`film: no films/${film}/script.md`);
  const pub = join(here, 'build', film, 'public');
  const override = join(dir, 'style/tokens.json');
  return {film, name: film, dir, script: join(dir, 'script.md'), shots: join(dir, 'shots.json'), out: join(here, 'out', film), pub,
    lastBuild: `last-build-script-${film}.json`, anchors: `anchors-used-${film}.json`, styleOverride: existsSync(override) ? override : null,
    // remotion.config.ts sets build/public; every remotion call for another film must say where its public dir is.
    publicDirArgs: [`--public-dir=${pub}`]};
}

const merge = (a, b) => (b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)
  ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]])) : b);

/** style/tokens.json with the film's own style/tokens.json merged over it. */
export function filmStyle(here, paths) {
  const base = JSON.parse(readFileSync(join(here, 'style/tokens.json'), 'utf8'));
  return paths.styleOverride ? merge(base, JSON.parse(readFileSync(paths.styleOverride, 'utf8'))) : base;
}
