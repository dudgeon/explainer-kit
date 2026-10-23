import React, {createContext, useContext} from 'react';
import tokens from '../../../style/tokens.json';

// The house kit: how a scene gets the film's look. build.mjs merges style/tokens.json, the film's own
// films/<name>/style/tokens.json and any KIT_TOKENS_OVERRIDE file, and writes the result into timeline.json as
// `timeline.style`; Film.tsx provides it here, and every scene and lib component reads it with useStyle().
// This file and src/Root.tsx are the only ones allowed to import style/tokens.json (lint.mjs): a scene that imported it
// directly would be baked with the base look by the bundler, and no restyle or per-film look would reach it.

/** The film's look: the shape of style/tokens.json (a film's override may add keys of its own). */
export type Style = typeof tokens;

/** The base look, for a component rendered with no film around it (Remotion Studio, a still of one component). */
export const BASE_STYLE: Style = tokens;

const StyleContext = createContext<Style>(BASE_STYLE);

/** Gives everything inside it this look (Film.tsx wraps the whole film in one, with timeline.style). */
export const StyleProvider = ({style, children}: {style?: Style | null; children: React.ReactNode}) => (
  <StyleContext.Provider value={style ?? BASE_STYLE}>{children}</StyleContext.Provider>
);

/** The film's look, inside a scene or a lib component. */
export const useStyle = (): Style => useContext(StyleContext);
