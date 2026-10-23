// Which film a build is for. Every film lives in films/<name>/ (script.md, shots.json, an optional style/tokens.json
// merged over style/tokens.json, an optional voice.json naming its narrator) and builds to out/<name>/ with its own
// public dir build/<name>/public. The content-addressed .cache/ is shared by every film.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {BuildError} from './util.mjs';

export const FILM_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The films: the folders under films/ with a valid name (a folder starting `_` or `.` is a scratch folder, never a film). */
export const filmNames = (here) => (existsSync(join(here, 'films'))
  ? readdirSync(join(here, 'films'), {withFileTypes: true}).filter((d) => d.isDirectory() && FILM_NAME.test(d.name)).map((d) => d.name).sort()
  : []);

export function filmPaths(here, film) {
  if (!film) throw new BuildError(`film: say which film (--film <name>); the films are: ${filmNames(here).join(', ') || '(none yet)'}`);
  if (!FILM_NAME.test(film)) throw new BuildError(`film: "${film}" isn't a film name (lowercase letters, digits, dashes)`);
  const dir = join(here, 'films', film);
  if (!existsSync(join(dir, 'script.md'))) throw new BuildError(`film: no films/${film}/script.md (the films are: ${filmNames(here).join(', ') || 'none yet'})`);
  const pub = join(here, 'build', film, 'public');
  const override = join(dir, 'style/tokens.json');
  return {film, name: film, dir, script: join(dir, 'script.md'), shots: join(dir, 'shots.json'), out: join(here, 'out', film), pub,
    voiceFile: join(dir, 'voice.json'), lastBuild: `last-build-script-${film}.json`, styleOverride: existsSync(override) ? override : null,
    // remotion.config.ts sets build/public; every remotion call must say where this film's public dir is.
    publicDirArgs: [`--public-dir=${pub}`]};
}

const merge = (a, b) => (b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)
  ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]])) : b);

const readJson = (f, what) => {
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw new BuildError(`style: ${what} ${f} isn't readable JSON (${e.message})`); }
};

/**
 * The film's look: style/tokens.json, then the film's own style/tokens.json merged over it, then the file named by
 * KIT_TOKENS_OVERRIDE (a candidate look being tried, e.g. by the style picker) merged over both. build.mjs writes the
 * result into timeline.json (`timeline.style`), which is the only way a look reaches the scenes (src/scenes/house/kit.tsx).
 */
export function filmStyle(here, paths) {
  let style = readJson(join(here, 'style/tokens.json'), 'the base tokens');
  if (paths.styleOverride) style = merge(style, readJson(paths.styleOverride, 'the film tokens'));
  const env = process.env.KIT_TOKENS_OVERRIDE;
  if (env) {
    const f = isAbsolute(env) ? env : resolve(process.cwd(), env);
    if (!existsSync(f)) throw new BuildError(`style: KIT_TOKENS_OVERRIDE names ${f}, which isn't there`);
    style = merge(style, readJson(f, 'KIT_TOKENS_OVERRIDE'));
  }
  return style;
}
