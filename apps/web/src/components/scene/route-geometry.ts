/** Geometry shared by the illustrative light routes: smooth curves through points, sampled for dashes and sparkles. */
export type P = readonly [number, number];

type Segment = [P, P, P, P];

/** Catmull-Rom through the points as cubic Béziers. `lead` is the point before the first one, so a branch leaves its
 *  junction along the tangent of the line it grows from instead of kinking there. */
function segments(points: readonly P[], lead?: P): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i ? points[i - 1] : lead ?? points[0], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    out.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function curve(points: readonly P[], lead?: P) {
  const s = segments(points, lead);
  return s.length ? `M${r1(s[0][0][0])} ${r1(s[0][0][1])}` + s.map(([, a, b, c]) => ` C${r1(a[0])} ${r1(a[1])} ${r1(b[0])} ${r1(b[1])} ${r1(c[0])} ${r1(c[1])}`).join("") : "";
}

const bez = ([a, b, c, d]: Segment, t: number): P => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
};

/** Points along the curve with their share of the length (0..1) and unit normal; dense enough for dashes and sparkles. */
export function trace(points: readonly P[], lead?: P, per = 24) {
  const pts: P[] = [];
  for (const s of segments(points, lead)) for (let k = pts.length ? 1 : 0; k <= per; k++) pts.push(bez(s, k / per));
  const run = [0];
  for (let i = 1; i < pts.length; i++) run.push(run[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = run.at(-1) || 1;
  return { length, at: pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
    return { p, f: run[i] / length, normal: [-dy / n, dx / n] as P };
  }) };
}

/** Deterministic noise so server and client render the same sparkles. */
export function random(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
