import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useStyle} from '../scenes/house/kit';

// The paper ground every drawn film stands on: warm paper with a faint graph grid, in the film's look (style.paper).
// A pure function of the frame: it never moves.

/** Warm paper with a faint graph grid. */
export const PaperGround = () => {
  const P = useStyle().paper;
  return (
    <AbsoluteFill style={{background: P.ground,
      backgroundImage: `linear-gradient(${P.grid} 1px, transparent 1px), linear-gradient(90deg, ${P.grid} 1px, transparent 1px)`,
      backgroundSize: `${P.gridSize}px ${P.gridSize}px`, backgroundPosition: `${P.gridSize / 2}px ${P.gridSize / 2}px`}} />
  );
};
