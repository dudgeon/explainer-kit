import {Composition, staticFile} from 'remotion';
import {Film, type FilmTimeline} from './scenes/Film';
import tokens from '../style/tokens.json';
import {WallpaperSvg} from './lib/Desk';
import {WALLPAPERS} from './lib/Wallpapers';
import {StyleFrame} from './scenes/StyleFrames';
import {TopicVariant} from './scenes/TopicVariants';
import {CalloutVariant} from './scenes/CalloutVariants';
import {CalloutStudy} from './scenes/CalloutStudy';
import {CalloutStudy2} from './scenes/CalloutStudy2';

// build.mjs writes build/public/timeline.json; the film's length comes from it.
export const Root = () => (
  <>
  {/* Rendered once as a still (at --scale=4) into build/public/wallpaper.png. */}
  <Composition id="Wallpaper"
    component={({variant}: {variant: string}) => {
      const V = WALLPAPERS[variant];
      return V ? <V w={tokens.frame.width} h={tokens.frame.height} /> : <WallpaperSvg w={tokens.frame.width} h={tokens.frame.height} />;
    }}
    defaultProps={{variant: (tokens.desk.wallpaper as {variant?: string}).variant ?? 'blobs'}}
    width={tokens.frame.width} height={tokens.frame.height} fps={tokens.frame.fps} durationInFrames={1} />
  <Composition id="StyleFrame" component={StyleFrame as never} defaultProps={{frame: 'callout'}}
    width={tokens.frame.width} height={tokens.frame.height} fps={tokens.frame.fps} durationInFrames={tokens.frame.fps * 4} />
  <Composition id="CalloutStudy2" component={CalloutStudy2 as never} defaultProps={{variant: 'trace'}}
    width={tokens.frame.width} height={tokens.frame.height} fps={tokens.frame.fps} durationInFrames={tokens.frame.fps * 6} />
  <Composition id="CalloutStudy" component={CalloutStudy as never} defaultProps={{variant: 'loop'}}
    width={tokens.frame.width} height={tokens.frame.height} fps={tokens.frame.fps} durationInFrames={tokens.frame.fps * 4} />
  <Composition id="CalloutVariant" component={CalloutVariant as never} defaultProps={{variant: 'ring'}}
    width={tokens.frame.width} height={tokens.frame.height} fps={tokens.frame.fps} durationInFrames={1} />
  <Composition id="TopicVariant" component={TopicVariant as never} defaultProps={{variant: 'rail'}}
    width={tokens.frame.width} height={tokens.frame.height} fps={tokens.frame.fps} durationInFrames={1} />
  <Composition
    id="Intro"
    component={Film}
    width={tokens.frame.width}
    height={tokens.frame.height}
    fps={tokens.frame.fps}
    durationInFrames={tokens.frame.fps * 10}
    defaultProps={{timeline: null as FilmTimeline | null}}
    calculateMetadata={async () => {
      const timeline: FilmTimeline = await fetch(staticFile('timeline.json')).then((r) => r.json());
      // A film may set its own frame (films/<name>/style/tokens.json → timeline.width/height), e.g. square for phones.
      return {durationInFrames: timeline.frames, props: {timeline}, width: timeline.width ?? tokens.frame.width, height: timeline.height ?? tokens.frame.height};
    }}
  />
  </>
);
