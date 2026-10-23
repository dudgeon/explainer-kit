import {Composition, staticFile} from 'remotion';
import {Film, type FilmTimeline} from './scenes/Film';
import tokens from '../style/tokens.json';

// One composition, "Film", for every film (pipeline/render.mjs COMPOSITION). build.mjs writes the film's
// build/<film>/public/timeline.json; its length, frame size and look (timeline.style) come from there. The tokens
// imported here are only the defaults before timeline.json is read: scenes get the look from Film's StyleProvider.
export const Root = () => (
  <Composition
    id="Film"
    component={Film}
    width={tokens.frame.width}
    height={tokens.frame.height}
    fps={tokens.frame.fps}
    durationInFrames={tokens.frame.fps * 10}
    defaultProps={{timeline: null as FilmTimeline | null}}
    calculateMetadata={async () => {
      const timeline: FilmTimeline = await fetch(staticFile('timeline.json')).then((r) => r.json());
      // A film may set its own frame (films/<name>/style/tokens.json → timeline.width/height), e.g. square for phones.
      return {durationInFrames: timeline.frames, fps: timeline.fps, props: {timeline}, width: timeline.width ?? tokens.frame.width, height: timeline.height ?? tokens.frame.height};
    }}
  />
);
