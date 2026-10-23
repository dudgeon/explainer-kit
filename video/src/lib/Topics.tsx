import React from 'react';
import {AbsoluteFill} from 'remotion';
import {PaperGround} from './Paper';
import {smootherstep} from './camera';
import {useStyle} from '../scenes/house/kit';

// The running topic list: at each change of topic (the script's `Topic:` lines) the picture steps right to 80% of
// the frame and a vertical list of every topic stands in the left 20%, on paper; the accent bar (style.color.accent)
// slides from the topic just finished to the new one, then the picture comes back. A motion graphic over the scenes'
// own transitions, which keep playing in the smaller picture. Sizes follow the film's frame (style.frame).

/** The list's width: a fifth of the frame. */
export const railWidth = (frameWidth: number) => Math.round(frameWidth * 0.2);
const IN = 0.5, OUT = 0.5, HOLD = 1.9, LEAD = 0.35;     // seconds: slide in (starting LEAD before the change), hold, slide out
const MOVE = [0.2, 0.75];                                // the bar's move, after the change

export type TopicChange = {at: number; index: number; from: number};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number, a: number, b: number) => smootherstep(clamp01((t - a) / (b - a)));

/** Where the topic list stands at time t: u (0 hidden … 1 shown) and the bar's position between topics. */
export function topicsAt(changes: TopicChange[], t: number): {u: number; bar: number; current: number} {
  for (const c of changes) {
    const a = c.at - LEAD, z = c.at - LEAD + IN + HOLD + OUT;
    if (t < a || t > z) continue;
    const u = ease(t, a, a + IN) * (1 - ease(t, z - OUT, z));
    const m = ease(t, c.at + MOVE[0], c.at + MOVE[1]);
    return {u, bar: c.from + (c.index - c.from) * m, current: m > 0.5 ? c.index : c.from};
  }
  return {u: 0, bar: 0, current: 0};
}

/** The picture's place while the list shows: 80% wide, flush right, centred vertically. */
export function pictureTransform(u: number, frame: {width: number; height: number}, ink: string): React.CSSProperties {
  if (u <= 0) return {};
  const s = 1 - 0.2 * u;
  return {transform: `translate(${railWidth(frame.width) * u}px, ${(frame.height * (1 - s)) / 2}px) scale(${s})`, transformOrigin: '0 0',
    borderRadius: 18 * u / s, overflow: 'hidden', boxShadow: `0 ${24 * u}px ${70 * u}px color-mix(in srgb, ${ink} ${Math.round(30 * u)}%, transparent)`};
}

const ROW = 92, CUR_ROW = 120;
export const TopicRail = ({topics, u, bar, current}: {topics: string[]; u: number; bar: number; current: number}) => {
  const style = useStyle();
  if (u <= 0) return null;
  const C = style.color, ui = style.font.sans, mono = style.font.mono, H = style.frame.height, RAIL = railWidth(style.frame.width), ACCENT = C.accent;
  const heights = topics.map((_, i) => (i === current ? CUR_ROW : ROW));
  const total = heights.reduce((a, b) => a + b, 0);
  const tops: number[] = [];
  heights.reduce((y, h, i) => { tops[i] = y; return y + h; }, (H - total) / 2);
  const lo = Math.floor(bar), hi = Math.min(topics.length - 1, lo + 1), f = bar - lo;
  const barY = tops[lo] + (tops[hi] - tops[lo]) * f, barH = heights[lo] + (heights[hi] - heights[lo]) * f;
  return (
    <AbsoluteFill style={{opacity: Math.min(1, u * 1.6)}}>
      <div style={{position: 'absolute', left: -RAIL * (1 - u), top: 0, width: RAIL, height: H}}>
        <div style={{position: 'absolute', left: 30, top: barY + 16, width: 7, height: barH - 32, borderRadius: 4, background: ACCENT}} />
        {topics.map((t, i) => {
          const cur = i === current, past = i < current;
          return (
            <div key={t + i} style={{position: 'absolute', left: 56, right: 18, top: tops[i], height: heights[i], display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
              <div style={{fontFamily: mono, fontSize: 19, letterSpacing: 1, color: cur ? ACCENT : past ? C.muted : C.faint}}>
                {String(i + 1).padStart(2, '0')}{past ? '  ✓' : ''}
              </div>
              <div style={{fontFamily: ui, fontSize: cur ? 40 : 29, fontWeight: cur ? 650 : 500, letterSpacing: cur ? -1 : -0.3, lineHeight: 1.08,
                color: cur ? C.ink : past ? C.muted : C.faint}}>{t}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** The film's topics, in order, and the moments they change (a scene whose topic repeats the last adds none). */
export function topicChanges(scenes: {start: number; topic?: string | null}[]): {topics: string[]; changes: TopicChange[]} {
  const topics: string[] = [], changes: TopicChange[] = [];
  let last: string | undefined;
  scenes.forEach((s, i) => {
    const name = s.topic ?? undefined;
    if (!name || name === last) return;
    topics.push(name);
    if (i > 0 && last !== undefined) changes.push({at: s.start, index: topics.length - 1, from: topics.length - 2});
    last = name;
  });
  return {topics, changes};
}

export {PaperGround};
