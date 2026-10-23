import {AbsoluteFill} from 'remotion';
import {PaperGround} from '../../lib/Paper';
import type {SceneProps} from '../registry';
import {useStyle} from './kit';

// The house paper card: the paper ground with the scene's title in ink, so a film builds end to end before its real
// scenes exist, and the example film (films/example) has something to draw. It shows the pipeline's grammar in the
// smallest form: the title draws in as the scene opens, an accent rule draws under it on the word the shot's `mark`
// event names, and the line being spoken sits under the title while it is said. A pure function of the time t.

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const ease = (u: number) => { const x = clamp01(u); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

export const PaperCard = ({t, ev, scene}: SceneProps) => {
  const {frame, font, paper: P} = useStyle();
  const title = ease(t / 0.6);
  // The accent rule: drawn over 0.5 s from the `mark` event; a shot without one has no rule.
  const rule = ev.mark === undefined ? 0 : ease((t - ev.mark) / 0.5);
  const line = (scene.lines ?? []).find((l) => t >= l.start && t <= l.start + l.duration + 0.3);
  const width = frame.width - frame.safe * 4;
  return (
    <AbsoluteFill>
      <PaperGround />
      <AbsoluteFill style={{justifyContent: 'center', padding: frame.safe * 2}}>
        <div style={{fontFamily: font.ui, fontSize: 96, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, color: P.ink,
          opacity: title, transform: `translateY(${(1 - title) * 16}px)`}}>{scene.title}</div>
        <div style={{height: 8, marginTop: 28, width: width * 0.32 * rule, background: P.marker, borderRadius: 4}} />
        <div style={{minHeight: 120, marginTop: 36, maxWidth: width, fontFamily: font.ui, fontSize: 40, fontWeight: 500, lineHeight: 1.3, color: P.ink2}}>
          {line?.text ?? ''}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
