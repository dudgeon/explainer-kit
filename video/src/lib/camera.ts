// A camera over a still capture. Rects are in the capture's points; the capture is `scale` px per point.
// Pure functions of time: no state carried between frames (style/motion.md).

export type Rect = {x: number; y: number; w: number; h: number};
export type Key = {t: number; rect: Rect};

export const smootherstep = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** The rect at time t (seconds). Centre moves on the eased curve; zoom is eased in log space so it feels even. */
export function cameraAt(keys: Key[], t: number, ease = smootherstep): Rect {
  if (t <= keys[0].t) return keys[0].rect;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const u = ease((t - a.t) / (b.t - a.t));
      const lerp = (p: number, q: number) => p + (q - p) * u;
      const w = Math.exp(lerp(Math.log(a.rect.w), Math.log(b.rect.w)));
      const cx = lerp(a.rect.x + a.rect.w / 2, b.rect.x + b.rect.w / 2);
      const cy = lerp(a.rect.y + a.rect.h / 2, b.rect.y + b.rect.h / 2);
      const h = w * (a.rect.h / a.rect.w);
      return {x: cx - w / 2, y: cy - h / 2, w, h};
    }
  }
  return keys[keys.length - 1].rect;
}
