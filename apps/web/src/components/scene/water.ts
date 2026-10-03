import { trace, random, type P } from "./route-geometry";

/**
 * One coherent wave field over the whole river (MOTION_SPEC "The river surface").
 * A single WebGL canvas covers the scene's art box, samples the same plate the page shows, and is masked by the
 * water matte, so every visible bit of water shares one time value and phase; land, sky and text never move.
 * The page's light route is drawn in the same pass: rasterized once into two textures (line, glow) that carry each
 * pixel's arrival time, then revealed by one clock, refracted by the same ripples and lit on the same crests as the
 * water, so the line sits in the water rather than on the glass. Any failure (no WebGL, context loss) leaves the still
 * plate and the SVG copy of the route: nothing depends on this layer.
 */
export type GlLine = { pts: readonly P[]; lead?: P; kind?: "main" | "branch" | "ruled" | "tail" | "strand"; start: number; dur: number; ease?: "in" | "out" | "even" };
export type GlDot = { at: P; tone: "origin" | "end" | "ruled" | "current"; time: number };
export type GlRoute = { lines: GlLine[]; dots: GlDot[]; sparkles?: number; seed?: number };

const VERTEX = `attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
/** The wave field, shared word for word by the water and the route so both move as one surface. */
const RIPPLE = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv; uniform sampler2D matte; uniform float t;
float depth, n, crest; vec2 d;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
void ripple() {
  // Irregular wavelets, not periodic bands (sine swells read as stripes laid over the photo's own ripples): two layers of
  // smooth noise, stretched wide and flat, smaller toward the horizon, drifting slowly toward the viewer.
  depth = smoothstep(.34, .95, uv.y);                               // 0 far water, 1 near bank: perspective
  vec2 q = vec2(uv.x * 1672. / mix(16., 52., depth), uv.y * 941. / mix(3., 11., depth));
  float a = noise(q + vec2(t * .1, -t * .45));
  float b = noise(q * vec2(1.9, 2.4) + vec2(5.2 - t * .16, 1.3 - t * .7));
  float v = a * .62 + b * .38;
  n = v * 2. - 1.;
  crest = smoothstep(.66, .92, v);                                   // the high points of the wavelets: where light glints
  d = vec2(n * .25, n) * mix(.0005, .0017, depth);                   // a gentle, mostly vertical shimmer of the reflections
}
`;
/** The water, with the page's route drawn into it: refracted by the same swells, its glow broken into reflections by
 *  their crests, tinted by the light already on the water and dimmer with distance. Premultiplied output: the water
 *  by its matte, the route's light added. */
const WATER = RIPPLE + `uniform sampler2D plate; uniform sampler2D core; uniform sampler2D glow; uniform vec2 texel; uniform float rt; uniform float route;
void main() {
  ripple();
  float m = texture2D(matte, uv).r;
  vec2 w = uv + d;
  vec3 base = texture2D(plate, w).rgb;
  float lum = dot(base, vec3(.3, .59, .11));
  vec3 water = base * (1. + n * mix(.025, .045, depth)) + crest * smoothstep(.22, .6, lum) * vec3(1., .86, .7) * .14;
  vec3 light = vec3(0.); float cover = 0.;
  if (route > .5) {
    vec2 r = uv + d * m * .45;                                       // the route bends with the swells it lies on
    vec4 k = texture2D(core, r), g = texture2D(glow, r);
    float since = rt - k.g;
    float shown = clamp(since * 90., 0., 1.);                        // arrival time per pixel, a soft head a few ms wide
    float head = shown * (1. - clamp(since * 14., 0., 1.));          // freshly drawn light is brighter, then settles
    float spark = step(.55, k.b) * step(k.b, .85);
    float level = mix(k.b, .3 + 1.5 * crest + .5 * max(n, 0.), spark);
    // Comets of light run upstream along the drawn line, forever: a pixel's arrival time is also its distance along the
    // route, so a sawtooth in it (head upstream, tail trailing back toward the report) moves as time is subtracted.
    float settled = clamp((since - .03) * 5., 0., 1.);
    float T = mod(t * .8, 64.);
    float ph = k.g * 7. - T, f = fract(ph);
    float amp = step(.28, fract(sin(floor(ph) * 78.233) * 43758.5)) * (.75 + .5 * fract(sin(floor(ph) * 12.9898) * 4375.85));
    float comet = (pow(f, 4.) * 1.1 + smoothstep(.95, .995, f) * 2.6) * smoothstep(1., .985, f) * amp * settled;
    float gp = g.g * 7. - T, gf = fract(gp);
    float gcomet = pow(gf, 3.) * smoothstep(1., .96, gf) * step(.28, fract(sin(floor(gp) * 78.233) * 43758.5)) * clamp((rt - g.g - .03) * 5., 0., 1.);
    float line = k.a * shown * level * (mix(1. + head, .38, settled) + 4.2 * comet) * (1. + .25 * n * m);
    float halo = g.a * clamp((rt - g.g) * 40., 0., 1.) * mix(1., .65 + .6 * n + .7 * crest, m) * (mix(1.5, .75, settled) + 4.5 * gcomet); // reflections break on the swells
    water += vec3(1., .9, .76) * g.a * gcomet * (.35 + 2.2 * crest) * m * .7; // a passing comet lights the ripples under it
    vec3 ink = mix(mix(vec3(.98, .97, .94), vec3(1., .93, .8), clamp(comet, 0., 1.)), vec3(.95, .7, .42), k.r); // comet heads burn a little warmer
    vec3 haze = mix(vec3(.84, .95, .94), vec3(.95, .7, .42), g.r);
    vec3 tint = mix(vec3(1.), min(base / max(lum, .04), 1.8), .3 * m * (1. - max(k.r, g.r))); // the light takes on the colour of the water under it (the amber origin keeps its own)
    float far = mix(.7, 1., depth);                                  // and fades a little with distance
    light = (ink * line + haze * halo * .7) * tint * far;
    cover = clamp(line + halo * .55, 0., 1.);
  }
  gl_FragColor = vec4(min(water * m + light, 1.), max(m, cover));
}`;

const EASE = { in: (f: number) => f ** (1 / 1.6), out: (f: number) => 1 - Math.sqrt(1 - f), even: (f: number) => f < .5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2) };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
type ClockWindow = Window & { __routeClock?: number };

/** One route clock per page, shared by the water layer, the SVG copy and the labels (their CSS waits for
 *  html[data-route-clock]), so everything that belongs to the route arrives together. */
export function startRouteClock() {
  const w = window as ClockWindow;
  if (w.__routeClock === undefined) { w.__routeClock = performance.now(); document.documentElement.dataset.routeClock = ""; }
  return w.__routeClock;
}
export function resetRouteClock() {
  delete (window as ClockWindow).__routeClock;
  delete document.documentElement.dataset.routeClock; delete document.documentElement.dataset.routeGl;
}

/** Paint the route into line and glow canvases at the water canvas's resolution; each pixel's green is its arrival. */
function paintRoute(route: GlRoute, width: number, height: number, cssPx: number) {
  const total = Math.max(...route.lines.map(l => l.start + l.dur), ...route.dots.map(d => d.time), .1) + .05;
  const enc = (time: number) => Math.round(Math.min(1, Math.max(0, time / total)) * 255);
  const sx = width / 1672, sy = height / 941, plate = width / 1672 / cssPx; // CSS px per plate unit
  const make = () => { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; };
  const core = make(), glow = make();
  const k = core.getContext("2d")!, g = glow.getContext("2d")!;
  k.lineCap = "round"; k.lineJoin = "round";
  const taper = (y: number) => .62 + .7 * smooth(.34, .95, y / 941); // nearer water, wider line
  const rand = random(route.seed ?? 7);
  const sparks: { x: number; y: number; r: number; time: number }[] = [];
  for (const line of route.lines) {
    const kind = line.kind ?? "branch", ease = EASE[line.ease ?? "even"], tr = trace(line.pts, line.lead, 40);
    const time = (f: number) => line.start + line.dur * ease(f);
    const width = (kind === "strand" ? .8 : kind === "tail" ? 1.1 : kind === "ruled" ? 1.4 : 1.8) * cssPx;
    const level = kind === "strand" ? 90 : kind === "tail" ? 140 : kind === "ruled" ? 190 : 255;
    const dash = 7 / plate; // ruled-out lines: 7 CSS px dashes and gaps, whatever the scale
    for (let i = 1; i < tr.at.length; i++) {
      const a = tr.at[i - 1], b = tr.at[i];
      if (kind === "ruled" && (b.f * tr.length) % (2 * dash) > dash) continue;
      const warm = kind === "main" ? Math.round(255 * (1 - smooth(0, .3, b.f))) : 0;
      k.strokeStyle = `rgb(${warm},${enc(time(b.f))},${level})`;
      k.lineWidth = width * taper(b.p[1]);
      k.beginPath(); k.moveTo(a.p[0] * sx, a.p[1] * sy); k.lineTo(b.p[0] * sx, b.p[1] * sy); k.stroke();
    }
    if (kind === "strand" || kind === "tail") continue;
    const count = Math.round(tr.length / (kind === "ruled" ? 40 : 15) * (route.sparkles ?? 1));
    for (let j = 0; j < count; j++) {
      const f = kind === "main" ? 1 - (1 - rand()) ** 1.7 : rand(), at = tr.at[Math.min(tr.at.length - 1, Math.round(f * (tr.at.length - 1)))];
      const spread = (rand() - .5) * (rand() < .7 ? 16 : 46) * (kind === "main" ? .4 + f : 1);
      sparks.push({ x: at.p[0] + at.normal[0] * spread, y: at.p[1] + at.normal[1] * spread, r: (.5 + rand() * .8) * cssPx * taper(at.p[1]), time: time(f) + .04 });
    }
  }
  for (const s of sparks) { k.fillStyle = `rgb(0,${enc(s.time)},180)`; k.beginPath(); k.arc(s.x * sx, s.y * sy, s.r, 0, Math.PI * 2); k.fill(); }
  // glow: the drawn light, softened twice (canvas filter where supported, a shadow pass elsewhere)
  if (typeof g.filter === "string") {
    g.filter = `blur(${4 * cssPx}px)`; g.drawImage(core, 0, 0); g.filter = `blur(${11 * cssPx}px)`; g.globalAlpha = .6; g.drawImage(core, 0, 0);
    // light on water reflects as a short vertical streak under itself; the shader then breaks it on the swells
    g.filter = `blur(${1.6 * cssPx}px)`;
    for (let i = 1; i <= 8; i++) { g.globalAlpha = .2 * (1 - i / 9); g.drawImage(core, 0, i * 2.6 * cssPx); }
    g.filter = "none"; g.globalAlpha = 1;
  } else { g.shadowColor = "#fff"; g.shadowBlur = 8 * cssPx; g.drawImage(core, 0, 0); g.shadowBlur = 0; }
  for (const dot of route.dots) {
    const x = dot.at[0] * sx, y = dot.at[1] * sy, warm = dot.tone === "origin" || dot.tone === "current" ? 255 : 0, big = warm ? 1.3 : 1, t = taper(dot.at[1]);
    const color = (alpha: number) => `rgba(${warm},${enc(dot.time)},255,${alpha})`;
    k.fillStyle = k.strokeStyle = color(1);
    k.beginPath(); k.arc(x, y, (dot.tone === "ruled" ? 3.4 : 4.2) * big * cssPx * t, 0, Math.PI * 2);
    if (dot.tone === "ruled") { k.lineWidth = 1.3 * cssPx; k.stroke(); } else k.fill();
    const reach = (warm ? 11 : 14) * cssPx * t; // a soft, even halo: the dot is a light on the water, not a lens flare
    const halo = g.createRadialGradient(x, y, 0, x, y, reach);
    halo.addColorStop(0, color(dot.tone === "ruled" ? .2 : warm ? .45 : .6)); halo.addColorStop(1, color(0));
    g.fillStyle = halo; g.beginPath(); g.arc(x, y, reach, 0, Math.PI * 2); g.fill();
    if (dot.tone !== "ruled") { // the dot's reflection: a column of light stretched down the water, broken by the ripples
      g.save(); g.translate(x, y + 3 * cssPx); g.scale(.26, 1);
      const column = g.createRadialGradient(0, 0, 0, 0, 0, 48 * big * cssPx * t);
      column.addColorStop(0, color(warm ? .22 : .38)); column.addColorStop(1, color(0));
      g.fillStyle = column; g.beginPath(); g.arc(0, 0, 48 * big * cssPx * t, 0, Math.PI); g.fill(); g.restore();
    }
  }
  return { core, glow, total };
}

type Layer = { gl: WebGLRenderingContext; texture: (unit: number, source: TexImageSource) => void; uniform: (name: string) => WebGLUniformLocation | null };
function layer(canvas: HTMLCanvasElement, fragment: string, samplers: string[]): Layer | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) return null;
  const shader = (type: number, source: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s); return s; };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  samplers.forEach((name, unit) => gl.uniform1i(gl.getUniformLocation(program, name), unit));
  const textures: WebGLTexture[] = [];
  return {
    gl, uniform: name => gl.getUniformLocation(program, name),
    texture: (unit, source) => {
      textures[unit] ??= gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    },
  };
}

export function startWater(canvas: HTMLCanvasElement, plate: HTMLImageElement, matteUrl: string, active: () => boolean) {
  const none = { refresh: () => undefined, stop: () => undefined, setRoute: (_route: GlRoute | null) => undefined };
  const made = layer(canvas, WATER, ["matte", "plate", "core", "glow"]);
  if (!made) return none;
  const water: Layer = made, gl = water.gl;
  const blank = document.createElement("canvas"); blank.width = blank.height = 1;
  water.texture(2, blank); water.texture(3, blank);

  let frame = 0, sizing = 0, ready = 0, elapsed = 0, previous = 0, lost = false, stopped = false;
  let route: GlRoute | null = null, painted = false, total = 1;
  const root = document.documentElement;
  const u = { t: water.uniform("t"), rt: water.uniform("rt"), route: water.uniform("route"), texel: water.uniform("texel") };
  const clear = () => { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); };
  const paint = () => {
    if (!route || !canvas.clientWidth) return;
    const result = paintRoute(route, canvas.width, canvas.height, canvas.width / canvas.clientWidth);
    water.texture(2, result.core); water.texture(3, result.glow); total = result.total; painted = true;
  };
  const refresh = () => {
    const on = !stopped && !lost && ready === 3 && active();
    canvas.dataset.running = String(on);
    if (on && route && !painted) paint();
    gl.uniform1f(u.route, route && painted ? 1 : 0);
    if (on && route && painted) { startRouteClock(); root.dataset.routeGl = ""; } else delete root.dataset.routeGl; // otherwise the SVG copy shows
    if (on && !frame) frame = requestAnimationFrame(draw);
    if (!on && frame) { cancelAnimationFrame(frame); frame = 0; clear(); previous = 0; }
  };
  const matte = new Image();
  matte.onload = () => { // rasterize the vector matte once, at plate proportions
    const m = document.createElement("canvas"); m.width = 836; m.height = 470;
    m.getContext("2d")!.drawImage(matte, 0, 0, m.width, m.height); water.texture(0, m); ready |= 2; refresh();
  };
  matte.src = matteUrl;
  const plateReady = () => { try { water.texture(1, plate); gl.uniform2f(u.texel, 1 / plate.naturalWidth, 1 / plate.naturalHeight); ready |= 1; refresh(); } catch { lost = true; } };
  if (plate.complete && plate.naturalWidth) plateReady(); else plate.addEventListener("load", plateReady, { once: true });
  const onLost = (e: Event) => { e.preventDefault(); lost = true; canvas.hidden = true; refresh(); };
  canvas.addEventListener("webglcontextlost", onLost);

  const resize = () => {
    // full device resolution (a reduced buffer made the water soft), capped near 3.6 megapixels for very large screens
    const dpr = Math.min(window.devicePixelRatio || 1, 2), area = canvas.clientWidth * canvas.clientHeight * dpr * dpr;
    const ratio = dpr * Math.min(1, Math.sqrt(3.6e6 / Math.max(1, area)));
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (route) { cancelAnimationFrame(sizing); sizing = requestAnimationFrame(() => { painted = false; refresh(); }); }
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  const coarse = matchMedia("(pointer: coarse)").matches;

  function draw(now: number) {
    frame = 0;
    if (stopped || lost || !active()) { refresh(); return; }
    frame = requestAnimationFrame(draw);
    const clock = (window as ClockWindow).__routeClock;
    const rt = route && painted && clock !== undefined ? (now - clock) / 1000 / total : 2;
    if (coarse && rt > 1.05 && previous && now - previous < 30) return; // touch devices settle to ~30 fps once the route is drawn
    elapsed += Math.min((now - (previous || now)) / 1000, .1); previous = now; // continuous across pauses: no phase jump
    gl.uniform1f(u.t, elapsed); gl.uniform1f(u.rt, rt); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  refresh();
  return {
    refresh,
    setRoute: (next: GlRoute | null) => { route = next; painted = false; refresh(); },
    stop: () => {
      stopped = true; cancelAnimationFrame(frame); cancelAnimationFrame(sizing); frame = 0; observer.disconnect(); matte.onload = null;
      plate.removeEventListener("load", plateReady); canvas.removeEventListener("webglcontextlost", onLost);
      delete root.dataset.routeGl; gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
