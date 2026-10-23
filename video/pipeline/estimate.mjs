// Lines timed by estimate, with no voice: each line lasts its words at the look's target pace (style.voice.targetWps)
// and its words are spread over that time by length. Enough to place every event on its word and render stills of a
// look (build.mjs --stills --estimate, pipeline/style-frames.mjs) before anything is voiced, without the GPU's voice
// models. The timings are not the film's: a real build voices every line and times the picture from what was said.
import {norm} from './plan.mjs';

export function estimateVoiced(lines, style) {
  const wps = style.voice.targetWps;
  return lines.map((l) => {
    const words = (l.said ?? l.text).split(/\s+/).filter((w) => norm(w).length);
    const weight = words.map((w) => norm(w).join('').length + 2);
    const total = weight.reduce((a, b) => a + b, 0) || 1;
    const speech = words.length / wps;
    let t = 0.1;
    const timed = words.map((w, i) => {
      const d = speech * weight[i] / total, out = {word: w, start: +t.toFixed(3), end: +(t + d * 0.9).toFixed(3)};
      t += d;
      return out;
    });
    return {...l, src: null, estimated: true, duration: +(speech + 0.2).toFixed(3), words: timed};
  });
}
