import {AbsoluteFill} from 'remotion';
import type {SceneProps} from '../registry';
import {Canvas, Draw, Para, at, useKit, wrap} from './kit';

// The house paper card: the scene's title in the serif on plain paper, and an accent rule that draws under it on the
// word the shot's `mark` event names. A film builds end to end with it before its real scenes exist, and the example
// film (films/example) is made of it. It shows the house grammar in its smallest form: the title arrives as the scene
// opens, the one accent arrives on its word, and the narration is never written on screen. A pure function of t.

export const PaperCard = ({t, ev, scene}: SceneProps) => {
  const {safe, S, H, type, line} = useKit();
  const x = safe + 18, width = S - 2 * x, size = type.card;
  const rows = wrap(scene.title, size, width).length;
  // The block (title, then the rule) sits a little above the middle of the frame.
  const top = H * 0.46 - (rows * size * 1.12) / 2 + size * 0.8;
  const ruleY = top + (rows - 1) * size * 1.12 + size * 0.7;
  const title = at(t, 0.05, 0.8);
  // The accent rule: drawn over 0.5 s from the `mark` event; a shot without one has no rule.
  const rule = ev.mark === undefined ? 0 : at(t, ev.mark, 0.5);
  return (
    <AbsoluteFill>
      <Canvas>
        <g transform={`translate(0 ${(1 - title) * 14})`}>
          <Para x={x} y={top} text={scene.title} width={width} size={size} o={title} />
        </g>
        <Draw d={`M${x + 4} ${ruleY}H${x + 4 + width * 0.3}`} u={rule} color="accent" w={line.bold} />
      </Canvas>
    </AbsoluteFill>
  );
};
