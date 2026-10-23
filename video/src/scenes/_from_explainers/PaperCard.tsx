import React from 'react';
import {AbsoluteFill} from 'remotion';
import {PaperGround} from '../../lib/Paper';
import tokens from '../../../style/tokens.json';
import type {SceneProps} from '../registry';

/** A placeholder scene for the director film: the paper ground with the scene's title in ink, so the film builds end to end
 *  before its real scenes exist. A pure function of the frame (t). */
export const PaperCard = ({scene}: SceneProps) => (
  <AbsoluteFill>
    <PaperGround />
    <AbsoluteFill style={{justifyContent: 'center', padding: tokens.frame.safe * 2}}>
      <div style={{fontFamily: tokens.font.ui, fontSize: 96, fontWeight: 600, letterSpacing: -2, color: tokens.paper.ink}}>{scene.title}</div>
    </AbsoluteFill>
  </AbsoluteFill>
);
