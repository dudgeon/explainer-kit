import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useStyle} from '../scenes/house/kit';

// The paper ground every drawn film stands on, in the film's look: the paper colour (style.color.paper) and, when
// style.ground.grid is more than 0, a faint graph grid of that spacing in the faint ink. The house look is plain paper.
// A pure function of the frame: it never moves.

/** Warm paper, plain or with a faint graph grid. */
export const PaperGround = () => {
  const {color: C, ground} = useStyle();
  const g = ground.grid;
  const line = `color-mix(in srgb, ${C.faint} 45%, transparent)`;
  return (
    <AbsoluteFill style={{background: C.paper, ...(g > 0 ? {
      backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      backgroundSize: `${g}px ${g}px`, backgroundPosition: `${g / 2}px ${g / 2}px`} : {})}} />
  );
};
