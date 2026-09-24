/**
 * One coherent wave field over the whole river (MOTION_SPEC "The river surface").
 * A single WebGL canvas covers the scene's art box, samples the same plate the page shows, and is masked by the
 * water matte, so every visible bit of water shares one time value and phase; land, sky and text never move.
 * Any failure (no WebGL, context loss) leaves the still plate: nothing depends on this layer.
 */
const VERTEX = `attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
const FRAGMENT = `precision mediump float;
varying vec2 uv; uniform sampler2D plate; uniform sampler2D matte; uniform float t;
void main() {
  float depth = smoothstep(.36, .9, uv.y);                       // distant water moves less than the foreground
  float a = sin(uv.x * mix(150., 48., depth) + t * .55 + uv.y * 90.);
  float b = sin(uv.x * mix(260., 96., depth) - t * .37 + uv.y * 140.);
  float c = sin(uv.y * mix(420., 160., depth) + t * .8);            // slow travelling swell across the plane
  float d = (a * .55 + b * .3 + c * .15) * mix(.0006, .0022, depth);
  vec4 base = texture2D(plate, uv + vec2(d, d * .35));
  float warm = smoothstep(.35, .8, base.r - base.b * .35);         // shimmer only where the sunset already lights the water
  vec3 color = base.rgb + warm * (.5 + .5 * b) * .035;
  gl_FragColor = vec4(color, 1.) * texture2D(matte, uv).r;         // premultiplied by the matte
}`;

export function startWater(canvas: HTMLCanvasElement, plate: HTMLImageElement, matteUrl: string, active: () => boolean) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) return () => undefined;
  const shader = (type: number, source: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s); return s; };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => undefined;
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = (unit: number, source: TexImageSource) => {
    const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };
  gl.uniform1i(gl.getUniformLocation(program, "plate"), 0); gl.uniform1i(gl.getUniformLocation(program, "matte"), 1);
  const time = gl.getUniformLocation(program, "t");

  let frame = 0, ready = 0, elapsed = 0, previous = 0, lost = false;
  const matte = new Image();
  matte.onload = () => { // rasterize the vector matte once, at plate proportions
    const m = document.createElement("canvas"); m.width = 836; m.height = 470;
    m.getContext("2d")!.drawImage(matte, 0, 0, m.width, m.height); texture(1, m); ready |= 2;
  };
  matte.src = matteUrl;
  const plateReady = () => { try { texture(0, plate); ready |= 1; } catch { lost = true; } };
  if (plate.complete && plate.naturalWidth) plateReady(); else plate.addEventListener("load", plateReady, { once: true });
  const onLost = (e: Event) => { e.preventDefault(); lost = true; canvas.hidden = true; };
  canvas.addEventListener("webglcontextlost", onLost);

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5) * .7; // capped: the shader is soft and cheap at this resolution
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    const on = !lost && ready === 3 && active();
    canvas.dataset.running = String(on);
    if (!on) { previous = now; if (!lost) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } return; } // paused: the still plate shows through
    elapsed += Math.min((now - (previous || now)) / 1000, .1); previous = now; // continuous across pauses: no phase jump
    gl.uniform1f(time, elapsed); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  frame = requestAnimationFrame(draw);
  return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("webglcontextlost", onLost); gl.getExtension("WEBGL_lose_context")?.loseContext(); };
}
