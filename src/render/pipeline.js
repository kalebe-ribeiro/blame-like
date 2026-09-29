// ─────────────────────────────────────────────────────────────────────────────
//  Passe de cena com oclusão de ambiente (SSAO) e antialiasing temporal (TAA).
//  Substitui o RenderPass no EffectComposer:
//
//    cena (projeção com tremor sub-pixel) ──► cor + profundidade
//        │
//        ├─► AO em meia resolução: reconstrói a posição de cada pixel pela
//        │   profundidade (sem um segundo passe de geometria — o custo de
//        │   geometria é o que mais pesa aqui), amostra um disco em espiral
//        │   girado por pixel e por quadro ("Alchemy AO"); some com a distância
//        │   e com a névoa. Depois um desfoque que respeita a profundidade.
//        │
//        └─► TAA: cor × AO; o histórico é reprojetado pela profundidade e pelo
//            movimento da câmera, limitado pela vizinhança 3×3 (variância em
//            YCoCg) e misturado a 90%. Cabos, grades e corrimãos param de
//            cintilar, e o ruído do AO converge com o tempo.
//
//  Sombras na névoa (raios de luz): para as 4 luzes mais fortes em cena, cada
//  pixel (em 1/4 de resolução) caminha em direção à luz somando o brilho do
//  halo — mas só onde a superfície está ATRÁS da luz (o halo aparece); vigas e
//  pilares na frente bloqueiam, riscando a poeira de faixas de sombra e luz.
//  Proporcional à densidade da névoa: sem poeira, sem raios.
//
//  O histórico é descartado em saltos de câmera (portais, transporte) e
//  deslocado junto quando a origem flutuante muda (shiftOrigin).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const AO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec2 uRes;       // resolução do AO (meia)
uniform float uFrame;
uniform float uRadius;   // raio da oclusão (m)
uniform float uStrength;
uniform float uFogDensity;
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  float z = -p.z;
  float fade = (1.0 - smoothstep(45.0, 160.0, z)) * exp(-uFogDensity * z * 0.6);
  if (fade < 0.01) { gl_FragColor = vec4(1.0); return; }

  // normal pela vizinhança (o lado com menor salto de profundidade: bordas limpas)
  vec2 px = 1.0 / uRes;
  vec3 pr = viewPos(vUv + vec2(px.x, 0.0)) - p;
  vec3 pl = p - viewPos(vUv - vec2(px.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, px.y)) - p;
  vec3 pd = p - viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl;
  vec3 dy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 n = normalize(cross(dx, dy));

  // raio em pixels (projeção do raio no mundo), limitado
  float rpx = clamp(uRadius * uProj[1][1] * 0.5 * uRes.y / z, 3.0, 90.0);
  float ang = ign(gl_FragCoord.xy + uFrame * 7.0) * 6.2831853;
  const int N = 10;
  float occ = 0.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N);
    float a = ang + float(i) * 2.399963; // ângulo de ouro
    vec2 off = vec2(cos(a), sin(a)) * rpx * t * px;
    vec3 v = viewPos(vUv + off) - p;
    float dist2 = dot(v, v);
    float r2 = uRadius * uRadius;
    occ += max(0.0, dot(n, v) - 0.004 * z - 0.02) / (dist2 + 0.01) * max(0.0, 1.0 - dist2 / (r2 * 4.0));
  }
  float ao = max(0.0, 1.0 - uStrength * occ * uRadius / float(N));
  gl_FragColor = vec4(vec3(mix(1.0, ao, fade)), 1.0);
}
`;

// desfoque 4×4 que só mistura vizinhos de profundidade parecida
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  vec2 px = 1.0 / uRes;
  float z0 = lin(texture2D(tDepth, vUv).x);
  float sum = 0.0, wsum = 0.0;
  for (int x = -2; x <= 1; x++) {
    for (int y = -2; y <= 1; y++) {
      vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * px;
      float z = lin(texture2D(tDepth, uv).x);
      float w = max(0.0, 1.0 - abs(z - z0) / (0.05 * z0 + 0.1));
      sum += texture2D(tAO, uv).r * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(vec3(wsum > 0.0 ? sum / wsum : 1.0), 1.0);
}
`;

const SHAFT_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uLightUV[4];
uniform float uLightZ[4];    // distância da luz na vista (m)
uniform float uLightR[4];    // raio do halo na tela (fração da altura)
uniform vec3 uLightCol[4];   // cor · intensidade que chega à câmera (0 = vaga vazia)
uniform float uAspect;
uniform float uNear;
uniform float uFar;
uniform float uFrame;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 acc = vec3(0.0);   // raios (somados)
  float dark = 0.0;       // sombra (fator de escurecimento, 0..1)
  float jitter = ign(gl_FragCoord.xy + uFrame * 5.0);
  const int N = 28;
  for (int l = 0; l < 4; l++) {
    if (dot(uLightCol[l], vec3(1.0)) <= 0.0) continue;
    vec2 d = uLightUV[l] - vUv;
    float len = length(d * vec2(uAspect, 1.0));
    if (len > 1.2) continue;
    float lit = 0.0, all = 0.0;
    for (int i = 0; i < N; i++) {
      vec2 uv = vUv + d * ((float(i) + jitter) / float(N));
      // a fonte: o halo da luz como um disco suave na tela...
      vec2 q = (uv - uLightUV[l]) * vec2(uAspect, 1.0);
      float src = exp(-dot(q, q) / (uLightR[l] * uLightR[l]));
      // ...visível só onde nada mais perto que a luz está na frente
      float behind = step(uLightZ[l] - 1.5, lin(texture2D(tDepth, uv).x));
      lit += src * behind;
      all += src;
    }
    // o brilho em volta da luz já vem da névoa (applyFog); aqui entram as
    // SOMBRAS dele: onde o halo seria visto mas algo o bloqueia, escurece
    // (limitado — nunca vira preto) — e um leve reforço nos raios que passam
    float fall = 1.0 - smoothstep(0.4, 1.2, len);
    float halo = clamp(all / float(N) * 3.0, 0.0, 1.0);
    float blocked = 1.0 - lit / max(all, 1e-4);
    float strength = clamp(dot(uLightCol[l], vec3(0.3, 0.59, 0.11)) * 40.0, 0.0, 1.0);
    dark += blocked * halo * strength * fall * 0.35;
    acc += uLightCol[l] * (lit / float(N)) * 0.07 * fall;
  }
  gl_FragColor = vec4(acc, min(dark, 0.6));
}
`;

const RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform sampler2D tHistory;
uniform mat4 uInvViewProj;   // inversa da projeção (com tremor) × vista atual
uniform mat4 uPrevViewProj;  // projeção (sem tremor) × vista do quadro anterior
uniform vec2 uRes;
uniform float uFeedback;     // 0 = descarta o histórico
uniform float uAOOn;
uniform sampler2D tShafts;
uniform float uShafts;       // intensidade dos raios (0 = desligado)
varying vec2 vUv;

vec3 toYCoCg(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }

vec3 fetch(vec2 uv) {
  vec3 c = texture2D(tColor, uv).rgb;
  float ao = mix(1.0, texture2D(tAO, uv).r, uAOOn);
  c *= ao;
  vec4 sh = texture2D(tShafts, uv);
  c = c * (1.0 - sh.a * uShafts) + sh.rgb * uShafts;
  return c / (1.0 + dot(c, vec3(0.299, 0.587, 0.114))); // peso de Karis: brilhos não dominam
}

// histórico com Catmull-Rom em 5 amostras (mais nítido que bilinear)
vec3 history(vec2 uv) {
  vec2 pos = uv * uRes;
  vec2 c = floor(pos - 0.5) + 0.5;
  vec2 f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (c - 1.0) / uRes;
  vec2 t3 = (c + 2.0) / uRes;
  vec2 t12 = (c + w2 / w12) / uRes;
  vec3 r = texture2D(tHistory, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
         + texture2D(tHistory, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
         + texture2D(tHistory, t12).rgb * (w12.x * w12.y)
         + texture2D(tHistory, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
         + texture2D(tHistory, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / wsum, 0.0);
}

void main() {
  vec3 cur = fetch(vUv);
  // vizinhança 3×3: média e desvio em YCoCg
  vec2 px = 1.0 / uRes;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec3 s = toYCoCg(fetch(vUv + vec2(float(x), float(y)) * px));
      m1 += s;
      m2 += s * s;
    }
  }
  m1 /= 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));

  // reprojeção pela profundidade
  float d = texture2D(tDepth, vUv).x;
  vec4 w = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  w /= w.w;
  vec4 pc = uPrevViewProj * w;
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;

  vec3 res = cur;
  if (uFeedback > 0.0 && pc.w > 0.0 && all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))) {
    vec3 h = toYCoCg(history(puv));
    // limita o histórico à caixa da vizinhança (recorta em direção à média)
    vec3 lo = m1 - sigma * 1.25;
    vec3 hi = m1 + sigma * 1.25;
    vec3 center = 0.5 * (hi + lo);
    vec3 ext = max(0.5 * (hi - lo), vec3(1e-4));
    vec3 v = h - center;
    vec3 a = abs(v / ext);
    float mx = max(a.x, max(a.y, a.z));
    if (mx > 1.0) h = center + v / mx;
    res = mix(cur, fromYCoCg(h), uFeedback);
  }
  gl_FragColor = vec4(res, 1.0);
}
`;

// cópia final: um pouco de nitidez (o TAA amacia) e desfaz o peso de Karis
const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uRes;
uniform float uSharpen;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / uRes;
  vec3 c = texture2D(tSrc, vUv).rgb;
  vec3 n = texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(px.x, 0.0)).rgb
         + texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, px.y)).rgb;
  c = max(c + (c - n * 0.25) * uSharpen, 0.0);
  gl_FragColor = vec4(c / max(1.0 - dot(c, vec3(0.299, 0.587, 0.114)), 1e-3), 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

// sequência de Halton (2, 3): 16 posições de tremor sub-pixel
const halton = (i, b) => {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
};
const JITTER = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

export class ScenePass extends Pass {
  constructor(scene, camera, shared) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.shared = shared;
    this.needsSwap = true;
    this.aoEnabled = true;
    this.taaEnabled = true;
    this.frame = 0;
    this._reset = true;
    this._prevViewProj = new THREE.Matrix4();
    this._prevCamPos = new THREE.Vector3();
    this._proj = new THREE.Matrix4();
    this._m = new THREE.Matrix4();

    const depth = new THREE.DepthTexture(1, 1);
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: depth });
    const aoOpts = { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false };
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    this.shaftRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.shaftsEnabled = true;
    this.aoBlurRT = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    const histOpts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.hist = [new THREE.WebGLRenderTarget(1, 1, histOpts), new THREE.WebGLRenderTarget(1, 1, histOpts)];

    this.aoMat = mat(AO_FRAG, {
      tDepth: { value: depth },
      uInvProj: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2() },
      uFrame: { value: 0 },
      uRadius: { value: 2.4 },
      uStrength: { value: 1.7 },
      uFogDensity: shared.uFogDensity,
    });
    this.blurMat = mat(BLUR_FRAG, {
      tAO: { value: this.aoRT.texture },
      tDepth: { value: depth },
      uRes: { value: new THREE.Vector2() },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
    });
    this.resolveMat = mat(RESOLVE_FRAG, {
      tColor: { value: this.sceneRT.texture },
      tDepth: { value: depth },
      tAO: { value: this.aoBlurRT.texture },
      tHistory: { value: null },
      uInvViewProj: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2() },
      uFeedback: { value: 0 },
      uAOOn: { value: 1 },
      tShafts: { value: this.shaftRT.texture },
      uShafts: { value: 0 },
    });
    this.shaftMat = mat(SHAFT_FRAG, {
      tDepth: { value: depth },
      uLightUV: { value: Array.from({ length: 4 }, () => new THREE.Vector2()) },
      uLightZ: { value: [0, 0, 0, 0] },
      uLightR: { value: [0, 0, 0, 0] },
      uLightCol: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
      uAspect: { value: 1 },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
      uFrame: { value: 0 },
    });
    this._lp = new THREE.Vector3();
    this.copyMat = mat(COPY_FRAG, { tSrc: { value: null }, uRes: { value: new THREE.Vector2() }, uSharpen: { value: 0 } });
    this.quad = new FullScreenQuad(null);
  }

  /** Descarta o histórico (salto de câmera, troca de resolução, novo mundo). */
  reset() {
    this._reset = true;
  }

  /** A origem flutuante andou `delta`: o quadro anterior é expresso nas novas coordenadas. */
  shiftOrigin(delta) {
    this._prevViewProj.multiply(this._m.makeTranslation(delta.x, delta.y, delta.z));
    this._prevCamPos.sub(delta);
  }

  setSize(width, height) {
    this.sceneRT.setSize(width, height);
    const hw = Math.max(1, Math.floor(width / 2));
    const hh = Math.max(1, Math.floor(height / 2));
    this.aoRT.setSize(hw, hh);
    this.aoBlurRT.setSize(hw, hh);
    this.hist[0].setSize(width, height);
    this.hist[1].setSize(width, height);
    this.shaftRT.setSize(Math.max(1, Math.floor(width / 4)), Math.max(1, Math.floor(height / 4)));
    this.aoMat.uniforms.uRes.value.set(hw, hh);
    this.blurMat.uniforms.uRes.value.set(hw, hh);
    this.resolveMat.uniforms.uRes.value.set(width, height);
    this.copyMat.uniforms.uRes.value.set(width, height);
    this.reset();
  }

  render(renderer, writeBuffer /* , readBuffer */) {
    const cam = this.camera;
    const W = this.sceneRT.width;
    const H = this.sceneRT.height;

    // salto de câmera (transporte, queda de quadros): começa do zero
    if (this._prevCamPos.distanceTo(cam.position) > 8) this._reset = true;

    // ── cena com tremor sub-pixel ──
    const unjittered = this._proj.copy(cam.projectionMatrix);
    let jx = 0;
    let jy = 0;
    if (this.taaEnabled) {
      [jx, jy] = JITTER[this.frame % JITTER.length];
      cam.projectionMatrix.elements[8] += (2 * jx) / W;
      cam.projectionMatrix.elements[9] += (2 * jy) / H;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, cam);

    // ── AO ──
    const aoU = this.aoMat.uniforms;
    aoU.uInvProj.value.copy(cam.projectionMatrixInverse);
    aoU.uProj.value.copy(cam.projectionMatrix);
    aoU.uFrame.value = this.taaEnabled ? this.frame % 64 : 0;
    const aoOn = this.aoEnabled ? 1 : 0;
    if (aoOn) {
      this.quad.material = this.aoMat;
      renderer.setRenderTarget(this.aoRT);
      this.quad.render(renderer);
      this.blurMat.uniforms.uNear.value = cam.near;
      this.blurMat.uniforms.uFar.value = cam.far;
      this.quad.material = this.blurMat;
      renderer.setRenderTarget(this.aoBlurRT);
      this.quad.render(renderer);
    }

    // ── sombras na névoa ──
    const dust = Math.min(1.6, this.shared.uFogDensity.value / 0.0075);
    const shaftGain = this.shaftsEnabled ? Math.min(1, dust) : 0;
    if (shaftGain > 0.01 && this._pickLights(cam)) {
      const su = this.shaftMat.uniforms;
      su.uNear.value = cam.near;
      su.uFar.value = cam.far;
      su.uFrame.value = this.frame % 64;
      this.quad.material = this.shaftMat;
      renderer.setRenderTarget(this.shaftRT);
      this.quad.render(renderer);
      this.resolveMat.uniforms.uShafts.value = shaftGain;
    } else {
      this.resolveMat.uniforms.uShafts.value = 0;
    }

    // ── TAA ──
    const ru = this.resolveMat.uniforms;
    ru.uAOOn.value = aoOn;
    ru.uInvViewProj.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    ru.uPrevViewProj.value.copy(this._prevViewProj);
    ru.uFeedback.value = this.taaEnabled && !this._reset ? 0.9 : 0;
    const src = this.hist[this.frame % 2];
    const dst = this.hist[(this.frame + 1) % 2];
    ru.tHistory.value = src.texture;
    this.quad.material = this.resolveMat;
    renderer.setRenderTarget(dst);
    this.quad.render(renderer);

    this.copyMat.uniforms.tSrc.value = dst.texture;
    this.copyMat.uniforms.uSharpen.value = this.taaEnabled ? 0.35 : 0;
    this.quad.material = this.copyMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);

    // ── guarda o quadro (sem tremor) para a próxima reprojeção ──
    cam.projectionMatrix.copy(unjittered);
    cam.projectionMatrixInverse.copy(unjittered).invert();
    this._prevViewProj.multiplyMatrices(unjittered, cam.matrixWorldInverse);
    this._prevCamPos.copy(cam.position);
    this._reset = false;
    this.frame++;
  }

  /** Escolhe as 4 luzes que mais "brilham na poeira" dentro (ou perto) da tela. */
  _pickLights(cam) {
    const P = this.shared.uLightPos.value;
    const F = this.shared.uLightFog.value;
    const su = this.shaftMat.uniforms;
    const cand = [];
    for (let i = 0; i < P.length; i++) {
      const f = F[i];
      const strength = f.x * 0.3 + f.y * 0.59 + f.z * 0.11;
      if (strength < 1e-4) continue;
      const v = this._lp.copy(P[i]).applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -1) continue; // atrás da câmera
      const dist = -v.z;
      if (dist > 400) continue;
      v.applyMatrix4(cam.projectionMatrix);
      const u = v.x * 0.5 + 0.5;
      const w = v.y * 0.5 + 0.5;
      if (u < -0.3 || u > 1.3 || w < -0.3 || w > 1.3) continue;
      cand.push({ u, w, dist, f, score: strength / (1 + dist * 0.01) });
    }
    cand.sort((a, b) => b.score - a.score);
    su.uAspect.value = cam.aspect;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (let i = 0; i < 4; i++) {
      const c = cand[i];
      if (!c) {
        su.uLightCol.value[i].set(0, 0, 0);
        continue;
      }
      su.uLightUV.value[i].set(c.u, c.w);
      su.uLightZ.value[i] = c.dist;
      // o halo tem ~8 m no mundo: vira fração da tela conforme a distância
      su.uLightR.value[i] = THREE.MathUtils.clamp(8 / (c.dist * tanH * 2), 0.025, 0.22);
      // a luz que chega à câmera (já atenuada pela névoa), comprimida para não estourar
      su.uLightCol.value[i].copy(c.f).multiplyScalar(0.02 / (1 + c.dist * 0.004));
    }
    return cand.length > 0;
  }

  dispose() {
    for (const rt of [this.sceneRT, this.aoRT, this.aoBlurRT, this.shaftRT, ...this.hist]) rt.dispose();
    for (const m of [this.aoMat, this.blurMat, this.resolveMat, this.copyMat, this.shaftMat]) m.dispose();
    this.quad.dispose();
  }
}
