import React, {createContext, useContext, type ReactNode} from 'react';
import tokens from '../../../style/tokens.json';

// The house kit: the film's look, and the drawing primitives every scene is made of.
//
// The look. build.mjs merges style/tokens.json, the film's own films/<name>/style/tokens.json and any
// KIT_TOKENS_OVERRIDE file, and writes the result into timeline.json as `timeline.style`; Film.tsx provides it here,
// and every scene and lib component reads it with useStyle(). This file and src/Root.tsx are the only ones allowed to
// import style/tokens.json (lint.mjs): a scene that imported it directly would be baked with the base look by the
// bundler, and no restyle or per-film look would reach it.
//
// The primitives. Restrained drawing on warm paper: one ink, hairline strokes, one accent kept for the idea that
// matters most, small type. Every primitive takes its colour by role name (color="accent", the keys of
// tokens.color) and its type from tokens.font, so a scene never names a colour or a font: lint.mjs fails a hex
// literal or a font-family string anywhere under src/ except this folder. Every primitive is a pure function of its
// props; scenes drive them from the time t (o = opacity 0..1, u = how far drawn 0..1).
// See style/house.md for the look in words, style/shot-grammar.md for how scenes move.

/** The film's look: the shape of style/tokens.json (a film's override may add keys of its own). */
export type Style = typeof tokens;
/** A colour, by its role in the palette. */
export type Role = Exclude<keyof Style['color'], '$note'>;
type Anchor = 'start' | 'middle' | 'end';

/** The base look, for a component rendered with no film around it (Remotion Studio, a still of one component). */
export const BASE_STYLE: Style = tokens;

const StyleContext = createContext<Style>(BASE_STYLE);

/** Gives everything inside it this look (Film.tsx wraps the whole film in one, with timeline.style). */
export const StyleProvider = ({style, children}: {style?: Style | null; children: React.ReactNode}) => (
  <StyleContext.Provider value={style ?? BASE_STYLE}>{children}</StyleContext.Provider>
);

/** The film's look, inside a scene or a lib component. */
export const useStyle = (): Style => useContext(StyleContext);

/** The look in the short names scenes use: C (colours by role), the three fonts, S (the frame's width), sizes. */
export const useKit = () => {
  const s = useStyle();
  const {$note: _n, ...C} = s.color;
  return {C: C as Record<Role, string>, SERIF: s.font.serif, SANS: s.font.sans, MONO: s.font.mono, S: s.frame.width, H: s.frame.height,
    safe: s.frame.safe, type: s.type, line: s.line, style: s};
};
/** A role's colour. */
export const useColor = (role: Role = 'ink') => useStyle().color[role];

// Time helpers ------------------------------------------------------------------------------------------------------------
export const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
/** Cubic ease in and out, clamped. */
export const ease = (u: number) => { const x = clamp01(u); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** An eased 0..1 that starts at time a and takes d seconds. */
export const at = (t: number, a: number, d = 0.6) => ease((t - a) / d);
/** Never: an event a scene's shot doesn't have. */
export const NEVER = 1e9;

// The canvas -------------------------------------------------------------------------------------------------------------
/** Ids of the shared SVG defs the Canvas draws: arrowheads (ink, accent) and the accent hatch (waiting, the not-done). */
export const ARROW = 'kit-arrow', ARROW_ACCENT = 'kit-arrow-accent', HATCH = 'kit-hatch', GRID = 'kit-grid';

/** The drawing surface every house scene draws on: an SVG the size of the frame, on paper (with the faint grid when
 *  style.ground.grid is more than 0), with the shared defs. */
export const Canvas = ({children}: {children?: ReactNode}) => {
  const {C, S, H, line, style} = useKit();
  const g = style.ground.grid;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${S} ${H}`} style={{position: 'absolute', inset: 0, background: C.paper}}>
      <defs>
        {g > 0 && <pattern id={GRID} width={g} height={g} patternUnits="userSpaceOnUse" x={g / 2} y={g / 2}><path d={`M${g} 0H0V${g}`} fill="none" stroke={C.faint} strokeWidth="1" opacity="0.6" /></pattern>}
        <marker id={ARROW} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9" fill="none" stroke={C.ink} strokeWidth={line.hairline} /></marker>
        <marker id={ARROW_ACCENT} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9" fill="none" stroke={C.accent} strokeWidth={line.hairline} /></marker>
        <pattern id={HATCH} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill={C.accentWash} /><path d="M0 0V10" stroke={C.accent} strokeWidth="1.2" opacity="0.5" /></pattern>
      </defs>
      <rect width={S} height={H} fill={C.paper} />
      {g > 0 && <rect width={S} height={H} fill={`url(#${GRID})`} />}
      {children}
    </svg>
  );
};

// Type -------------------------------------------------------------------------------------------------------------------
/** Breaks text into lines no wider than `width` px at `size` px (k: the font's average width per px of size, estimated). */
export const wrap = (text: string, size: number, width: number, k = 0.5): string[] => {
  const max = Math.max(1, Math.floor(width / (size * k)));
  const out: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + ' ' + w).length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
};
/** A block of type that wraps to `width`, its first baseline at y. */
export const Para = ({x, y, text, width, size, o = 1, font = 'serif', color = 'ink', lead = 1.12, weight, k}: {x: number; y: number; text: string; width: number; size: number; o?: number; font?: 'serif' | 'sans' | 'mono'; color?: Role; lead?: number; weight?: number; k?: number}) => {
  const {C, style} = useKit();
  if (o <= 0) return null;
  return (
    <text x={x} y={y} fontFamily={style.font[font]} fontSize={size} fontWeight={weight} fill={C[color]} opacity={o}>
      {wrap(text, size, width, k).map((l, i) => <tspan key={i} x={x} dy={i ? size * lead : 0}>{l}</tspan>)}
    </text>
  );
};
/** A scene's title, top left, in the serif. */
export const Title = ({text, o = 1, x, y = 128, size, color = 'ink'}: {text: string; o?: number; x?: number; y?: number; size?: number; color?: Role}) => {
  const {C, SERIF, safe, type} = useKit();
  return o > 0 ? <text x={x ?? safe + 18} y={y} fontFamily={SERIF} fontSize={size ?? type.title} fill={C[color]} opacity={o}>{text}</text> : null;
};
/** A small label in the sans (muted unless told otherwise). */
export const Label = ({x, y, text, o = 1, color = 'muted', size, anchor = 'middle', weight = 500}: {x: number; y: number; text: string; o?: number; color?: Role; size?: number; anchor?: Anchor; weight?: number}) => {
  const {C, SANS, type} = useKit();
  return o > 0 ? <text x={x} y={y} textAnchor={anchor} fontFamily={SANS} fontSize={size ?? type.label} fontWeight={weight} fill={C[color]} opacity={o} letterSpacing="0.3">{text}</text> : null;
};
/** A phrase in the serif. */
export const Serif = ({x, y, text, o = 1, size = 40, anchor = 'middle', color = 'ink', italic}: {x: number; y: number; text: string; o?: number; size?: number; anchor?: Anchor; color?: Role; italic?: boolean}) => {
  const {C, SERIF} = useKit();
  return o > 0 ? <text x={x} y={y} textAnchor={anchor} fontFamily={SERIF} fontSize={size} fontStyle={italic ? 'italic' : undefined} fill={C[color]} opacity={o}>{text}</text> : null;
};
/** Small print in the mono: a file name, a command, a source tag. */
export const Mono = ({x, y, text, o = 1, size = 18, anchor = 'start', color = 'ink'}: {x: number; y: number; text: string; o?: number; size?: number; anchor?: Anchor; color?: Role}) => {
  const {C, MONO} = useKit();
  return o > 0 ? <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={size} fill={C[color]} opacity={o}>{text}</text> : null;
};
/** The code mark, </>. */
export const Code = ({x, y, size, o = 1, color = 'ink'}: {x: number; y: number; size: number; o?: number; color?: Role}) => {
  const {C, MONO} = useKit();
  return o > 0 ? <text x={x} y={y} textAnchor="middle" fontFamily={MONO} fontSize={size} fill={C[color]} opacity={o}>{'</>'}</text> : null;
};
/** A line drawn through a label, left to right, as u goes 0 → 1 (width estimated from the text). */
export const Strike = ({x, y, text, size, u, anchor = 'start', color = 'ink', k = 0.52}: {x: number; y: number; text: string; size: number; u: number; anchor?: Anchor; color?: Role; k?: number}) => {
  const {C} = useKit();
  if (u <= 0) return null;
  const w = text.length * size * k, x0 = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
  return <path d={`M${x0 - 4} ${y - size * 0.32}H${x0 - 4 + (w + 8) * clamp01(u)}`} stroke={C[color]} strokeWidth="2.4" strokeLinecap="round" />;
};

// Drawing ----------------------------------------------------------------------------------------------------------------
/** A line that draws itself on as u goes 0 → 1 (for borders and arrows; never for whole drawings). */
export const Draw = ({d, u, color = 'ink', w, arrow}: {d: string; u: number; color?: Role; w?: number; arrow?: boolean}) => {
  const {C, line} = useKit();
  return u > 0 ? <path d={d} pathLength={1} fill="none" stroke={C[color]} strokeWidth={w ?? line.stroke} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - u}
    markerEnd={arrow && u > 0.95 ? `url(#${color === 'accent' ? ARROW_ACCENT : ARROW})` : undefined} /> : null;
};
/** A page with a folded corner, drawn on. */
export const Page = ({x, y, w, h, u, color = 'ink'}: {x: number; y: number; w: number; h: number; u: number; color?: Role}) => {
  const {C} = useKit();
  const f = Math.min(w, h) * 0.16;
  return (
    <g>
      {u > 0.6 && <path d={`M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`} fill={C.paper} opacity={(u - 0.6) / 0.4} />}
      <Draw d={`M${x + w - f} ${y}H${x + 6}Q${x} ${y} ${x} ${y + 6}V${y + h - 6}Q${x} ${y + h} ${x + 6} ${y + h}H${x + w - 6}Q${x + w} ${y + h} ${x + w} ${y + h - 6}V${y + f}L${x + w - f} ${y}V${y + f}H${x + w}`} u={u} color={color} />
    </g>
  );
};
/** Lines of text on a page, as grey rules of varying length. */
export const Lines = ({x, y, w, n, dy = 14, o = 1, sw = 3, color = 'muted'}: {x: number; y: number; w: number; n: number; dy?: number; o?: number; sw?: number; color?: Role}) => {
  const {C} = useKit();
  return o > 0 ? <g opacity={o}>{Array.from({length: n}, (_, k) => <path key={k} d={`M${x} ${y + k * dy}H${x + w * (k % 3 === 2 ? 0.6 : k % 2 ? 0.82 : 1)}`} stroke={C[color]} strokeWidth={sw} strokeLinecap="round" />)}</g> : null;
};
/** A rounded box. */
export const Box = ({x, y, w, h, o = 1, dash, color = 'ink', fill = 'paper', r = 8, sw = 2.2}: {x: number; y: number; w: number; h: number; o?: number; dash?: boolean; color?: Role; fill?: Role | 'none'; r?: number; sw?: number}) => {
  const {C} = useKit();
  return o > 0 ? <rect x={x} y={y} width={w} height={h} rx={r} fill={fill === 'none' ? 'none' : C[fill]} stroke={C[color]} strokeWidth={sw} strokeDasharray={dash ? '7 7' : undefined} opacity={o} /> : null;
};
/** A tick that draws itself on. */
export const Tick = ({x, y, u, s = 1, color = 'ink'}: {x: number; y: number; u: number; s?: number; color?: Role}) => {
  const {C, line} = useKit();
  return u > 0 ? <path transform={`translate(${x} ${y}) scale(${s})`} d="M-8 0L-2 6L9 -7" pathLength={1} fill="none" stroke={C[color]} strokeWidth={line.stroke} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - u} /> : null;
};
/** A small, quiet person: head and shoulders; (x, y) is the middle of the shoulders, the head 30 above. */
export const Person = ({x, y, o = 1, color = 'ink', s = 1, dash}: {x: number; y: number; o?: number; color?: Role; s?: number; dash?: boolean}) => {
  const {C, line} = useKit();
  return o > 0 ? (
    <g opacity={o} transform={`translate(${x} ${y + (1 - o) * 6}) scale(${s})`}>
      <circle cx="0" cy="-30" r="11" fill={C.paper} stroke={C[color]} strokeWidth={line.stroke} strokeDasharray={dash ? '4 4' : undefined} />
      <path d="M-20 0Q-20 -14 0 -14Q20 -14 20 0" fill="none" stroke={C[color]} strokeWidth={line.stroke} strokeLinecap="round" strokeDasharray={dash ? '4 4' : undefined} />
    </g>
  ) : null;
};
/** An agent: a small hexagon with a centre dot. */
export const Agent = ({x, y, o = 1, r = 15, color = 'ink'}: {x: number; y: number; o?: number; r?: number; color?: Role}) => {
  const {C} = useKit();
  return o > 0 ? (
    <g opacity={o} transform={`translate(${x} ${y})`}>
      <path d={Array.from({length: 6}, (_, i) => `${i ? 'L' : 'M'}${(r * Math.cos((Math.PI / 3) * i + Math.PI / 6)).toFixed(1)} ${(r * Math.sin((Math.PI / 3) * i + Math.PI / 6)).toFixed(1)}`).join('') + 'Z'}
        fill={C.paper} stroke={C[color]} strokeWidth="2.4" strokeLinejoin="round" />
      <circle r={r * 0.22} fill={C[color]} />
    </g>
  ) : null;
};
/** A numbered mark: a circle with a number or letter in it. */
export const Mark = ({x, y, n, o = 1, color = 'ink', r = 21}: {x: number; y: number; n: number | string; o?: number; color?: Role; r?: number}) => {
  const {C, SANS} = useKit();
  return o > 0 ? (
    <g opacity={o}>
      <circle cx={x} cy={y} r={r} fill={C.paper} stroke={C[color]} strokeWidth="2.4" />
      <text x={x} y={y + r * 0.4} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={r * 1.12} fill={C[color]}>{n}</text>
    </g>
  ) : null;
};
/** A speech bubble; `side` is where its tail sits. On-screen words are short (a few words), never the narration. */
export const Bubble = ({x, y, w, text, o = 1, side = 'left', size = 22, color = 'ink', italic}: {x: number; y: number; w: number; text: string; o?: number; side?: 'left' | 'right'; size?: number; color?: Role; italic?: boolean}) => {
  const {C, SANS} = useKit();
  return o > 0 ? (
    <g opacity={o}>
      <rect x={x} y={y} width={w} height={size + 26} rx={(size + 26) / 2} fill={C.paper} stroke={C[color]} strokeWidth="2" />
      <text x={x + 22} y={y + size + 7} fontFamily={SANS} fontSize={size} fontStyle={italic ? 'italic' : undefined} fill={C.ink}>{text}</text>
      <path d={side === 'left' ? `M${x + 26} ${y + size + 24}l-12 14l26 -8` : `M${x + w - 26} ${y + size + 24}l12 14l-26 -8`} fill={C.paper} stroke={C[color]} strokeWidth="2" strokeLinejoin="round" />
    </g>
  ) : null;
};
/** A clock face. */
export const Clock = ({x, y, r = 22, o = 1, color = 'ink'}: {x: number; y: number; r?: number; o?: number; color?: Role}) => {
  const {C} = useKit();
  return o > 0 ? (
    <g opacity={o}>
      <circle cx={x} cy={y} r={r} fill={C.paper} stroke={C[color]} strokeWidth="2.4" />
      <path d={`M${x} ${y - r * 0.6}V${y}H${x + r * 0.45}`} fill="none" stroke={C[color]} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  ) : null;
};
/** A bar that fills left to right as u goes 0 → 1: ink for work done, `hatch` for waiting. */
export const Bar = ({x, y, w, h = 20, u, color = 'ink', hatch}: {x: number; y: number; w: number; h?: number; u: number; color?: Role; hatch?: boolean}) => {
  const {C} = useKit();
  return u > 0 ? <rect x={x} y={y} width={w * clamp01(u)} height={h} rx={3} fill={hatch ? `url(#${HATCH})` : C[color]} /> : null;
};
