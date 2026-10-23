import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {PaperGround, TopicRail, pictureTransform, topicChanges, topicsAt} from '../lib/Topics';
import {StyleProvider, useStyle, type Style} from './house/kit';
import {SCENE_KINDS} from './registry';

type Line = {id: string; text: string; src: string | null; start: number; duration: number};
type Scene = {
  id: string; title: string; topic?: string | null; kind: 'card' | 'drawn'; start: number; duration: number; lines: Line[];
  poster?: number;
  card?: {title: string; sub: string; standIn: boolean};
  drawn?: {scene: string; events: Record<string, number>};
};
export type ScoreData = {src: string; speech: number; gap: number; swell: number; fadeIn: number; fadeOut: number};
export type FilmTimeline = {fps: number; duration: number; frames: number; fade: number; width?: number; height?: number; style?: Style; scenes: Scene[]; score?: ScoreData};

// The background score's level at time t: down under every voice line (ducking 0.25 s before it starts, back up over
// 0.7 s after it ends), a little up in the gaps, a small swell at each topic change, faded in at the start and out
// over the end. Interpolated in dB so the moves are smooth.
function scoreGain(t: number, sc: ScoreData, lines: {start: number; end: number}[], changes: number[], duration: number): number {
  const db = (g: number) => 20 * Math.log10(Math.max(g, 1e-6));
  let near = 1;   // 1 = in a gap, 0 = under speech
  for (const l of lines) {
    if (t >= l.start - 0.25 && t <= l.end) { near = 0; break; }
    if (t < l.start - 0.25 && t > l.start - 0.25 - 0.25) near = Math.min(near, (l.start - 0.25 - t) / 0.25);
    if (t > l.end && t < l.end + 0.7) near = Math.min(near, (t - l.end) / 0.7);
  }
  let g = db(sc.speech) + (db(sc.gap) - db(sc.speech)) * near;
  for (const c of changes) {
    const u = t < c - 0.6 || t > c + 2.2 ? 0 : t < c ? (t - (c - 0.6)) / 0.6 : t < c + 1.2 ? 1 : 1 - (t - c - 1.2) / 1.0;
    g += (db(sc.swell) - db(sc.gap)) * u * near;
  }
  const fade = Math.min(1, t / sc.fadeIn, Math.max(0, (duration - t) / sc.fadeOut));
  return Math.pow(10, g / 20) * fade;
}

/** A `kind: "card"` shot: a title card on paper. A stand-in (a scene not drawn yet) says so in its corner. */
const Card = ({card}: {card: NonNullable<Scene['card']>}) => {
  const {frame, font, color: C, type} = useStyle();
  const [sub, ...rest] = card.sub ? card.sub.split(' · ') : [];
  return (
    <AbsoluteFill>
      <PaperGround />
      <div style={{position: 'absolute', left: frame.safe + 32, right: frame.safe + 32, top: frame.height * 0.36, color: C.ink, fontFamily: font.serif}}>
        <div style={{fontSize: type.card, lineHeight: 1.08}}>{card.title}</div>
        {sub && <div style={{fontFamily: font.sans, fontSize: type.label * 1.4, fontWeight: 500, color: C.muted, marginTop: 22}}>{sub}</div>}
        {rest.length > 0 && (
          <div style={{fontFamily: font.mono, fontSize: type.small, color: C.muted, marginTop: 36, lineHeight: 1.7}}>
            {rest.map((l) => <div key={l}>{l}</div>)}
          </div>
        )}
      </div>
      {card.standIn && (
        <div style={{position: 'absolute', right: frame.safe, bottom: frame.safe, fontFamily: font.mono, fontSize: type.small, color: C.muted,
          border: `1.5px dashed ${C.faint}`, padding: '6px 14px'}}>stand-in: not drawn yet</div>
      )}
    </AbsoluteFill>
  );
};

const SceneView = ({scene, timeline}: {scene: Scene; timeline: FilmTimeline}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // Frame 0 is the poster (the first scene's `poster`, its settled title card): the still a player shows before play.
  // On play it gives way to frame 1, where the scene starts building.
  const t = frame === 0 && scene.poster !== undefined ? scene.poster : frame / fps;
  const Registered = scene.drawn ? SCENE_KINDS[scene.drawn.scene] : undefined;
  return (
    <AbsoluteFill>
      {scene.kind === 'card' && scene.card && <Card card={scene.card} />}
      {Registered && scene.drawn && <Registered t={t} ev={scene.drawn.events} scene={scene} timeline={timeline} />}
      {scene.lines.map((l) => (
        // A line timed by estimate (build.mjs --estimate, the style picker) has no audio yet.
        l.src ? (
          <Sequence key={l.id} from={Math.round(l.start * fps)} durationInFrames={Math.ceil((l.duration + 0.1) * fps)}>
            <Audio src={staticFile(l.src)} />
          </Sequence>
        ) : null
      ))}
    </AbsoluteFill>
  );
};

const FilmBody = ({timeline}: {timeline: FilmTimeline}) => {
  const frame = useCurrentFrame();
  const style = useStyle();
  const {fps, fade} = timeline;
  const {topics, changes} = topicChanges(timeline.scenes);
  const tp = topicsAt(changes, frame / fps);
  return (
    <AbsoluteFill style={{background: style.color.paper}}>
      {timeline.score && (() => {
        const sc = timeline.score;
        const lines = timeline.scenes.flatMap((s) => s.lines.map((l) => ({start: s.start + l.start, end: s.start + l.start + l.duration})));
        const at = changes.map((c) => c.at);
        return <Audio src={staticFile(sc.src)} volume={(f) => scoreGain(f / fps, sc, lines, at, timeline.duration)} />;
      })()}
      {tp.u > 0 && <PaperGround />}
      <AbsoluteFill style={pictureTransform(tp.u, style.frame, style.color.ink)}>
        {timeline.scenes.map((s, i) => {
          const last = i === timeline.scenes.length - 1;
          // `fade` is 0: scenes hand over by transitions they draw themselves, never a dissolve.
          return (
            <Sequence key={s.id} name={s.id} from={Math.round(s.start * fps)} durationInFrames={Math.ceil((s.duration + (last ? 0 : fade)) * fps)}>
              <SceneView scene={s} timeline={timeline} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
      <TopicRail topics={topics} {...tp} />
    </AbsoluteFill>
  );
};

/** The film: every scene of timeline.json, in the film's look (timeline.style), with its voice and score. */
export const Film = ({timeline}: {timeline: FilmTimeline | null}) => {
  if (!timeline) return null;
  return (
    <StyleProvider style={timeline.style}>
      <FilmBody timeline={timeline} />
    </StyleProvider>
  );
};
