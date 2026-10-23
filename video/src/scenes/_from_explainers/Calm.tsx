// The restrained study (films/sdd-calm): two scenes drawn the way an educational film draws, with the picture serving the
// narration. Warm paper, one ink, hairline drawing, a single muted clay accent kept for the constraint, small type. Each
// element arrives on the word that names it and earlier ones step back; nothing moves unless the voice asks it to.
// Square (1080 × 1080) for phone viewing: the agent's run snakes over two rows, and the gates sit on one timeline.

type TLScene = {id: string; start: number; duration: number; lines: {start: number; duration: number}[]; drawn?: {events: Record<string, number>}};
export const C = {paper: '#f3f0e8', ink: '#24221e', muted: '#8a857b', faint: '#d3cdc0', accent: '#c4673f', accentWash: '#f0dccf'};
export const SERIF = 'Charter, "Iowan Old Style", Georgia, serif';
export const SANS = '"Avenir Next", "Helvetica Neue", sans-serif';
export const S = 1080;
export const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
export const ease = (u: number) => { const x = clamp01(u); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export const Calm = ({t, scene, timeline}: {t: number; scene: {start?: number}; timeline?: unknown}) => {
  const scenes = ((timeline as {scenes?: TLScene[]})?.scenes ?? []) as TLScene[];
  const T = (scene.start ?? 0) + t;
  const by = new Map(scenes.map((s) => [s.id, s]));
  const e = (id: string, n: string) => { const s = by.get(id); const v = s?.drawn?.events?.[n]; return s && v !== undefined ? s.start + v : 1e9; };
  const l = (id: string, n: number) => { const s = by.get(id); const x = s?.lines[n - 1]; return s && x ? s.start + x.start : 1e9; };
  const at = (a: number, d = 0.6) => ease((T - a) / d);
  const s2 = by.get('S2')?.start ?? 1e9;
  // Scene A steps back during the move to Scene B (the 1.6 s before S2), then Scene B draws itself in.
  const aOut = 1 - at(s2 - 1.5, 1.0);
  const bIn = at(s2 - 0.4, 0.8);
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${S} ${S}`} style={{position: 'absolute', inset: 0, background: C.paper}}>
      <defs>
        <marker id="calm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9" fill="none" stroke={C.ink} strokeWidth="1.4" /></marker>
        <pattern id="calm-wait" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill={C.accentWash} /><path d="M0 0V10" stroke={C.accent} strokeWidth="1.2" opacity="0.5" /></pattern>
      </defs>
      <rect width={S} height={S} fill={C.paper} />
      {aOut > 0 && <g opacity={aOut}><Title text="What the frameworks share" o={at(l('S1', 1), 0.8)} /><SceneA T={T} e={(n) => e('S1', n)} at={at} /></g>}
      {bIn > 0 && <g opacity={bIn}><Title text="Release gates" o={at(l('S2', 1) - 0.3, 0.8)} /><SceneB T={T} e={(n) => e('S2', n)} at={at} /></g>}
    </svg>
  );
};

export type Fns = {T: number; e: (n: string) => number; at: (a: number, d?: number) => number};

export const Title = ({text, o}: {text: string; o: number}) => <text x="90" y="128" fontFamily={SERIF} fontSize="48" fill={C.ink} opacity={o}>{text}</text>;
export const Label = ({x, y, text, o = 1, color = C.muted, size = 28, anchor = 'middle', weight = 500}: {x: number; y: number; text: string; o?: number; color?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number}) =>
  o > 0 ? <text x={x} y={y} textAnchor={anchor} fontFamily={SANS} fontSize={size} fontWeight={weight} fill={color} opacity={o} letterSpacing="0.3">{text}</text> : null;
/** A line that draws itself on as u goes 0 → 1. */
export const Draw = ({d, u, color = C.ink, w = 2.6, arrow}: {d: string; u: number; color?: string; w?: number; arrow?: boolean}) =>
  u > 0 ? <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - u} markerEnd={arrow && u > 0.95 ? 'url(#calm-arrow)' : undefined} /> : null;
/** A page with a folded corner, drawn on. */
export const Page = ({x, y, w, h, u}: {x: number; y: number; w: number; h: number; u: number}) => {
  const f = Math.min(w, h) * 0.16;
  return (
    <g>
      {u > 0.6 && <path d={`M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`} fill={C.paper} opacity={(u - 0.6) / 0.4} />}
      <Draw d={`M${x + w - f} ${y}H${x + 6}Q${x} ${y} ${x} ${y + 6}V${y + h - 6}Q${x} ${y + h} ${x + 6} ${y + h}H${x + w - 6}Q${x + w} ${y + h} ${x + w} ${y + h - 6}V${y + f}L${x + w - f} ${y}V${y + f}H${x + w}`} u={u} />
    </g>
  );
};
/** A small, quiet person: head and shoulders. */
export const Person = ({x, y, o}: {x: number; y: number; o: number}) =>
  o > 0 ? (
    <g opacity={o} transform={`translate(${x} ${y + (1 - o) * 6})`}>
      <circle cx="0" cy="-30" r="11" fill="none" stroke={C.accent} strokeWidth="2.6" />
      <path d="M-20 0Q-20 -14 0 -14Q20 -14 20 0" fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" />
    </g>
  ) : null;
export const Tick = ({x, y, u, s = 1}: {x: number; y: number; u: number; s?: number}) =>
  u > 0 ? <path transform={`translate(${x} ${y}) scale(${s})`} d="M-8 0L-2 6L9 -7" pathLength={1} fill="none" stroke={C.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - u} /> : null;
export const Code = ({x, y, size}: {x: number; y: number; size: number}) => <text x={x} y={y} textAnchor="middle" fontFamily="Menlo, monospace" fontSize={size} fill={C.ink}>{'</>'}</text>;

// Scene A · Write the whole intent down --------------------------------------------------------------------------------------
export const SceneA = ({T, e, at}: Fns) => {
  const slice = at(e('slicing') - 0.3, 1.1);
  const gates = at(e('person') - 0.2, 0.7);
  const dim = 1 - 0.45 * gates;
  // The spec: large while it is the subject, then small at the head of the run.
  const sx = lerp(lerp(390, 230, at(e('next') - 0.3, 0.9)), 96, slice), sy = lerp(260, 342, slice), sw = lerp(300, 120, slice), sh = lerp(390, 156, slice);
  const k = sw / 300;
  const reqs = [0.82, 0.64, 0.9, 0.55, 0.75, 0.68];
  const written = clamp01((T - e('before')) / Math.max(1, e('spec') - e('before') + 0.6));
  const repo = at(e('next') - 0.2, 0.7) * (1 - slice);
  const tests = (i: number) => at(e('every') + 0.25 * i, 0.4);
  const stage = (n: string) => at(e(n) - 0.25, 0.55);
  // Two rows: spec → plan → tasks, then down to code and back to tests.
  const r1 = 420, r2 = 760;
  const P = {plan: 470, tasks: 820, code: 820, tests: 470};
  return (
    <g>
      <g opacity={dim}>
        <Page x={sx} y={sy} w={sw} h={sh} u={at(e('before') - 0.2, 0.9)} />
        <Label x={sx + 34 * k} y={sy + 54 * k} text="spec" anchor="start" size={28 * Math.max(0.65, k)} color={C.ink} o={at(e('before'), 0.6)} weight={600} />
        {reqs.map((r, i) => {
          const u = clamp01(written * reqs.length - i);
          const yy = sy + (96 + i * 48) * k;
          return (
            <g key={i}>
              <Draw d={`M${sx + 34 * k} ${yy}H${sx + 34 * k + 170 * r * k}`} u={u} color={C.muted} w={Math.max(2, 5 * k)} />
              {tests(i) > 0 && <rect x={sx + 236 * k} y={yy - 13 * k} width={24 * k} height={24 * k} rx={4 * k} fill="none" stroke={C.ink} strokeWidth={2} opacity={tests(i)} />}
              <Tick x={sx + 248 * k} y={yy} u={at(e('tested') - 0.4 + 0.15 * i, 0.4)} s={k} />
            </g>
          );
        })}
        <Label x={380} y={760} text="every requirement, a test" o={tests(5) * (1 - slice)} />
        {repo > 0 && (
          <g opacity={repo}>
            <Page x={610} y={330} w={210} h={270} u={repo} />
            <Code x={715} y={482} size={46} />
            <Label x={715} y={640} text="code" color={C.ink} />
            <rect x={190} y={226} width={680} height={500} rx={22} fill="none" stroke={C.faint} strokeWidth="2" strokeDasharray="8 8" />
            <Label x={210} y={212} text="one repository" anchor="start" size={24} />
          </g>
        )}
        {/* the agent's run */}
        <Draw d={`M${sx + sw + 18} ${r1}H${P.plan - 76}`} u={stage('plan')} arrow />
        {stage('plan') > 0 && (
          <g opacity={stage('plan')}>
            <Page x={P.plan - 60} y={r1 - 76} w={120} h={152} u={stage('plan')} />
            {[0, 1, 2].map((i) => <path key={i} d={`M${P.plan - 34} ${r1 - 30 + i * 30}H${P.plan + 30 - i * 14}`} stroke={C.muted} strokeWidth="4" strokeLinecap="round" />)}
            <Label x={P.plan} y={r1 + 118} text="plan" color={C.ink} />
          </g>
        )}
        <Draw d={`M${P.plan + 80} ${r1}H${P.tasks - 96}`} u={stage('tasks')} arrow />
        {stage('tasks') > 0 && (
          <g>
            {Array.from({length: 9}, (_, i) => {
              const u = at(e('tasks') - 0.2 + i * 0.05, 0.35);
              return <rect key={i} x={P.tasks - 78 + (i % 3) * 56} y={r1 - 78 + Math.floor(i / 3) * 56} width={44} height={44} rx={6} fill={C.paper} stroke={C.ink} strokeWidth="2.2" opacity={u} transform={`translate(0 ${(1 - u) * 8})`} />;
            })}
            <Label x={P.tasks} y={r1 + 118} text="small tasks" color={C.ink} o={stage('tasks')} />
          </g>
        )}
        <Draw d={`M${P.tasks} ${r1 + 140}V${r2 - 92}`} u={stage('code')} arrow />
        {stage('code') > 0 && (
          <g opacity={stage('code')}>
            <Page x={P.code - 60} y={r2 - 76} w={120} h={152} u={stage('code')} />
            <Code x={P.code} y={r2 + 13} size={34} />
            <Label x={P.code} y={r2 + 118} text="code" color={C.ink} />
          </g>
        )}
        <Draw d={`M${P.code - 80} ${r2}H${P.tests + 64}`} u={stage('tests')} arrow />
        {stage('tests') > 0 && (
          <g opacity={stage('tests')}>
            <circle cx={P.tests} cy={r2} r={52} fill={C.paper} stroke={C.ink} strokeWidth="2.6" />
            <Tick x={P.tests} y={r2} u={at(e('tests'), 0.5)} s={2.2} />
            <Label x={P.tests} y={r2 + 118} text="tests" color={C.ink} />
          </g>
        )}
        <Draw d={`M${P.tests + 30} ${r2 - 66}C${P.tests + 90} ${r2 - 170},${P.code - 100} ${r2 - 170},${P.code - 40} ${r2 - 92}`} u={stage('fixes')} arrow w={2.2} />
        <Label x={(P.tests + P.code) / 2} y={r2 - 160} text="fixes" color={C.ink} o={stage('fixes')} />
        <Label x={P.code + 4} y={r2 + 196} text="the agent: fast" o={at(e('slicing'), 0.8) * stage('code')} anchor="middle" />
      </g>
      {/* a person approves each stage */}
      {gates > 0 && [{x: (sx + sw + P.plan - 60) / 2, y: r1}, {x: (P.plan + 60 + P.tasks - 78) / 2, y: r1}, {x: P.tasks, y: (r1 + 140 + r2 - 92) / 2, flat: true}].map((g, i) => {
        const u = at(e('person') - 0.2 + i * 0.3, 0.6);
        return (
          <g key={i}>
            <Draw d={g.flat ? `M${g.x - 86} ${g.y}H${g.x + 86}` : `M${g.x} ${g.y - 86}V${g.y + 86}`} u={u} color={C.accent} w={4} />
            <Person x={g.flat ? g.x + 126 : g.x} y={g.flat ? g.y + 20 : g.y - 104} o={u} />
          </g>
        );
      })}
      <Label x={540} y={1010} text="a person approves each stage" color={C.accent} size={30} weight={600} o={at(e('gate') - 0.3, 0.7)} />
    </g>
  );
};

// Scene B · Release gates ---------------------------------------------------------------------------------------------------
export const SceneB = ({e, at}: Fns) => {
  const y = 470, x0 = 100, built = 250;
  const G = [{x: 470, ev: 'boards', name: 'change board'}, {x: 690, ev: 'security', name: 'security review'}, {x: 900, ev: 'launch', name: 'launch sign-off'}];
  const wait = at(e('weeks') - 0.1, 1.6);
  const dl = at(e('delivery') - 0.2, 0.7);
  const cmp = at(e('dora') - 0.3, 0.8);
  const back = 1 - 0.35 * cmp;
  return (
    <g>
      <g opacity={back}>
        <Draw d={`M${x0} ${y + 40}H${980}`} u={at(e('second') - 0.6, 0.9)} color={C.faint} w={2} />
        <rect x={x0} y={y - 26} width={52} height={52} rx={8} fill={C.ink} opacity={at(e('second') - 0.3, 0.6)} />
        <Label x={x0 + 26} y={y + 86} text="finished" o={at(e('second') - 0.2, 0.6)} />
        {G.map((g, i) => {
          const u = at(e(g.ev) - 0.25, 0.6);
          const shown = Math.max(u, at(e('gates') + i * 0.15, 0.5) * 0.35);
          return (
            <g key={g.ev}>
              <Draw d={`M${g.x} ${y - 90}V${y + 52}`} u={shown} color={C.accent} w={4} />
              <Label x={g.x} y={y + 96} text={g.name} color={u > 0.5 ? C.ink : C.muted} o={u} size={26} />
            </g>
          );
        })}
        {at(e('day') - 0.2, 0.5) > 0 && <rect x={x0 + 66} y={y - 10} width={(built - x0 - 66) * at(e('day') - 0.2, 0.5) + 8} height={20} rx={3} fill={C.ink} />}
        <Label x={x0} y={y - 46} text="built · 1 day" anchor="start" color={C.ink} o={at(e('day') - 0.1, 0.5)} size={26} />
        {wait > 0 && <rect x={built + 8} y={y - 10} width={(G[2].x - built - 8) * wait} height={20} rx={3} fill="url(#calm-wait)" />}
        <Label x={(G[0].x + G[1].x) / 2} y={y - 34} text="waiting · weeks" color={C.accent} o={at(e('weeks') + 0.6, 0.6)} size={26} />
        {dl > 0 && (
          <g opacity={dl}>
            <circle cx={G[2].x} cy={y} r={18} fill="none" stroke={C.accent} strokeWidth="3" />
            <Draw d={`M${G[2].x} ${y - 110}V${y - 170}`} u={dl} color={C.accent} w={2} />
            <Label x={G[2].x - 10} y={y - 188} text="your delivery date" color={C.accent} size={28} weight={600} />
          </g>
        )}
      </g>
      {cmp > 0 && (
        <g opacity={cmp}>
          <Label x={100} y={700} text="time to release" anchor="start" size={22} o={at(e('slow'), 0.6)} />
          <Label x={100} y={748} text="heavyweight approval" anchor="start" color={C.ink} size={26} />
          <rect x={430} y={730} width={480 * at(e('slow') - 0.2, 0.9)} height={20} rx={3} fill="url(#calm-wait)" />
          <Label x={100} y={808} text="lightweight review" anchor="start" color={C.ink} size={26} />
          <rect x={430} y={790} width={50 * at(e('slow'), 0.6)} height={20} rx={3} fill={C.ink} />
          <Label x={100} y={890} text="Releases that fail: about the same either way." anchor="start" color={C.ink} size={28} weight={600} o={at(e('safer') - 0.2, 0.6)} />
          <Label x={100} y={980} text="Source: DORA research on change approval. Illustrative." anchor="start" size={20} o={at(e('dora'), 0.8)} />
        </g>
      )}
    </g>
  );
};
