// ─────────────────────────────────────────────────────────────────────────────
//  O forno das superfícies (o rework gráfico, frente 1 — o cofre, Rework-grafico).
//
//  Gera uma vez, na GPU e pela seed, as texturas repetíveis (sem emenda: ruído periódico) de cada
//  FAMÍLIA de superfície da Cidade, num array de texturas com mipmaps:
//    A  cor (rgb, cinza médio ≈ 0,5 = o tom do material) + altura (a)
//    B  normal no plano da textura (rgb, 0,5 = reta) + aspereza (a)
//  A normal sai da MESMA função de altura (diferenças finitas), não da altura de 8 bits.
//  O shader de superfície (shaders/materials.js, USE_SURF_TEX) amostra em triplanar, com relevo na luz.
//  Nada de imagem externa: tudo é código e seed.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

/** As famílias (a camada do array) e o tamanho, em metros, de um ladrilho de textura. */
export const SURF = {
  concrete: { layer: 0, tile: 4.8 }, // concreto: a pele contínua (ondulação, grão, poros)
  plate: { layer: 1, tile: 3.0 }, // chapa de aço: placas, rebites, soldas, amassados, riscos
  tread: { layer: 2, tile: 1.2 }, // piso de chapa xadrez: ressaltos alternados, sujeira nos sulcos
};
const LAYERS = 3;
const SIZE = 1024;


const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform float uTile;    // m por ladrilho

// ── ruído periódico (Perlin clássico com período — S. Gustavson) ──
vec4 mod289v(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permutev(vec4 x) { return mod289v(((x * 34.0) + 10.0) * x); }
vec4 tisr(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fadev(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float pnoise(vec2 P, vec2 rep) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod(Pi, rep.xyxy);
  Pi = mod289v(Pi + uSeed);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permutev(permutev(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = tisr(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 f = fadev(Pf.xy);
  vec2 nx = mix(vec2(n00, n01), vec2(n10, n11), f.x);
  return 2.3 * mix(nx.x, nx.y, f.y);
}
// fbm periódico: o ladrilho (0..1) com 'cells' células na primeira oitava (laços de tamanho fixo)
float pfbm3(vec2 uv, float cells) {
  float a = 0.5, s = 0.0, c = cells;
  for (int o = 0; o < 3; o++) {
    s += a * pnoise(uv * c, vec2(c));
    c *= 2.0;
    a *= 0.5;
  }
  return s;
}
float pfbm4(vec2 uv, float cells) {
  return pfbm3(uv, cells) + 0.0625 * pnoise(uv * cells * 8.0, vec2(cells * 8.0));
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 0.013);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// células (Worley) periódicas: distância ao ponto mais perto, n células por lado
float pcell(vec2 uv, float n) {
  vec2 p = uv * n;
  vec2 ip = floor(p);
  float d = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = ip + vec2(float(i), float(j));
    vec2 w = mod(c, n);
    vec2 o = vec2(hash21(w), hash21(w + 17.3));
    d = min(d, length(p - c - o));
  }
  return d / n; // (em fração do ladrilho)
}

// ── as famílias: altura (m, relativa) e cor (cinza médio 0,5 = o tom do material), aspereza ──
// m = posição em metros dentro do ladrilho
float hConcrete(vec2 uv, out vec3 col, out float rough) {
  // concreto contínuo: sem grade de tábuas nem de furos (o usuário, 2026-10-09: nada de "tiles" em todo
  // lugar — os padrões regulares ficam para onde o contexto pede)
  // veio fraco e irregular da forma (horizontal, some e volta)
  float grain = pnoise(vec2(uv.x * 6.0, uv.y * 90.0), vec2(6.0, 90.0)) * 0.0008 * smoothstep(-0.2, 0.4, pnoise(uv * 5.0, vec2(5.0)));
  // bolhas (poros): só uma célula em sete tem bolha, de 2 a 6 mm de raio (em fração do ladrilho)
  float bh = hash21(floor(uv * 70.0) + 5.7);
  float bugR = step(0.86, bh) * mix(0.002, 0.006, fract(bh * 7.13)) / uTile;
  float bug = (1.0 - smoothstep(0.0, 0.0008, pcell(uv, 70.0) - bugR)) * step(0.86, bh);
  // a pele do concreto: ondulações grandes, médias e o grão fino
  float big = pfbm3(uv, 3.0) * 0.006;
  float mid = pfbm3(uv, 12.0) * 0.002;
  float fine = pfbm3(uv, 48.0) * 0.0015;
  float h = big + mid + fine + grain - bug * 0.004;
  float tone = 0.5 + 0.08 * pfbm4(uv, 4.0) + 0.04 * pfbm3(uv, 20.0);
  tone *= 1.0 - 0.25 * bug;
  col = vec3(tone);
  rough = 0.88;
  return h;
}

float hPlate(vec2 uv, out vec3 col, out float rough) {
  vec2 m = uv * uTile;
  // placas de 1,5 × 1,0 m sobrepostas: a borda de cima levanta 4 mm
  vec2 pw = vec2(1.5, 1.0);
  vec2 pc = floor(m / pw);
  vec2 pf = fract(m / pw) * pw;
  float ex = min(pf.x, pw.x - pf.x);
  float ey = min(pf.y, pw.y - pf.y);
  float lap = smoothstep(0.0, 0.006, pf.y) * (1.0 - smoothstep(pw.y - 0.004, pw.y, pf.y));
  float seamH = 1.0 - smoothstep(0.002, 0.008, min(ex, ey));
  // rebites: fileiras a 4 cm das bordas, a cada 7,5 cm
  vec2 rv = vec2(mod(pf.x + 0.0375, 0.075) - 0.0375, min(pf.y, pw.y - pf.y) - 0.04);
  vec2 rh = vec2(min(pf.x, pw.x - pf.x) - 0.04, mod(pf.y + 0.0375, 0.075) - 0.0375);
  float rd = min(length(rv), length(rh));
  float rivet = sqrt(max(0.0, 1.0 - (rd / 0.009) * (rd / 0.009)));
  // amassados e ondulação da chapa
  float dent = pfbm3(uv, 4.0) * 0.004;
  // riscos (finos, horizontais na maioria)
  float scr = smoothstep(0.82, 1.0, abs(pnoise(vec2(uv.x * 9.0, uv.y * 220.0), vec2(9.0, 220.0)))) * 0.0005;
  float h = dent + lap * 0.002 - seamH * 0.003 + rivet * 0.006 - scr;
  float tone = 0.5 + 0.06 * (hash21(mod(pc, uTile / pw)) - 0.5) + 0.05 * pfbm4(uv, 10.0);
  // as bordas e os rebites escurecem (óleo, ferrugem); o topo do rebite gasto clareia
  tone *= 1.0 - 0.3 * seamH;
  tone += 0.12 * smoothstep(0.6, 1.0, rivet);
  col = vec3(tone);
  rough = mix(0.55, 0.85, seamH) - 0.2 * smoothstep(0.6, 1.0, rivet);
  return h;
}

float hTread(vec2 uv, out vec3 col, out float rough) {
  vec2 m = uv * uTile;
  // chapa xadrez: ressaltos alongados (2,4 × 0,6 cm) a cada 3 cm, alternando a direção
  float cs = 0.03;
  vec2 cc = floor(m / cs);
  vec2 cf = fract(m / cs) - 0.5;
  bool alt = mod(cc.x + cc.y, 2.0) > 0.5;
  vec2 q = alt ? cf.yx : cf;
  // elipse inclinada a 45°
  vec2 r = vec2(q.x + q.y, q.x - q.y) * 0.7071;
  float lug = 1.0 - smoothstep(0.85, 1.0, length(r / vec2(0.42, 0.11)));
  float wavy = pfbm3(uv, 3.0) * 0.002;
  float h = lug * 0.0015 + wavy;
  // sujeira nos sulcos; o topo dos ressaltos gasto (mais claro e liso)
  float dirt = 0.5 + 0.5 * pfbm4(uv, 8.0);
  float tone = 0.45 + 0.08 * dirt;
  tone = mix(tone * 0.8, tone * 1.25, lug);
  col = vec3(tone);
  rough = mix(0.8, 0.45, lug);
  return h;
}

void main() {
  vec3 col = vec3(0.5);
  float rough = 0.8;
  vec2 uv = fract(vUv);
  #if FAMILY == 0
  float h = hConcrete(uv, col, rough);
  #elif FAMILY == 1
  float h = hPlate(uv, col, rough);
  #else
  float h = hTread(uv, col, rough);
  #endif
  // (half float: a altura em "unidades" de 4 cm, sem perder o milímetro)
  gl_FragColor = vec4(col.r, h * 25.0, rough, 1.0);
}
`;

// o passe final: da altura assada (half float) às duas texturas de 8 bits
const FINAL = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uH;
uniform int uPass;      // 0: cor + altura · 1: normal + aspereza
uniform float uTile;
float hAt(ivec2 p) {
  ivec2 q = ivec2(mod(vec2(p), ${SIZE}.0));
  return texelFetch(uH, q, 0).g / 25.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uH, p, 0);
  vec4 o;
  if (uPass == 0) {
    // a altura cabe em 8 bits: ±2 cm em torno de 0,5
    o = vec4(vec3(c.r), clamp(0.5 + c.g, 0.0, 1.0));
  } else {
    // a normal pela inclinação (Sobel), em metros
    float tl = hAt(p + ivec2(-1, 1)), t = hAt(p + ivec2(0, 1)), tr = hAt(p + ivec2(1, 1));
    float l = hAt(p + ivec2(-1, 0)), r = hAt(p + ivec2(1, 0));
    float bl = hAt(p + ivec2(-1, -1)), b = hAt(p + ivec2(0, -1)), br = hAt(p + ivec2(1, -1));
    float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
    float dm = 8.0 * uTile / ${SIZE}.0; // (Sobel: 4 pesos × 2 texels)
    vec3 n = normalize(vec3(-dx / dm, -dy / dm, 1.0));
    o = vec4(n * 0.5 + 0.5, clamp(c.b, 0.0, 1.0));
  }
  gl_FragColor = o;
}
`;

/**
 * Assa as famílias pela seed. → { a: DataArrayTexture-like, b: ..., ms } (as texturas dos dois
 * render targets de array). Chamar de novo (outra seed) reaproveita os alvos.
 */
export function bakeSurfaces(renderer, seed, prev = null) {
  const t0 = performance.now();
  const mk = () => {
    const rt = new THREE.WebGLArrayRenderTarget(SIZE, SIZE, LAYERS, { depthBuffer: false });
    const tex = rt.texture;
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.colorSpace = THREE.NoColorSpace;
    return rt;
  };
  const rtA = prev?.rtA ?? mk();
  const rtB = prev?.rtB ?? mk();
  // (os clones dos materiais — soloMaterial, LOD — religam os uniforms compartilhados; a marca só faz
  //  o cloneUniforms do three reclamar e zerar a cópia. No r170 ela não muda mais nada num array.)
  rtA.texture.isRenderTargetTexture = false;
  rtB.texture.isRenderTargetTexture = false;
  const rtH = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: false, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const final = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FINAL,
    uniforms: { uH: { value: rtH.texture }, uPass: { value: 0 }, uTile: { value: 1 } },
    depthTest: false,
    depthWrite: false,
  });
  const prevRT = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  const mats = [final];
  for (const f of Object.values(SURF)) {
    // um programa por família (o ANGLE compila cada um pequeno, sem desvio por família)
    const hm = new THREE.ShaderMaterial({
      defines: { FAMILY: f.layer },
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSeed: { value: (seed % 997) + 0.5 }, uTile: { value: f.tile } },
      depthTest: false,
      depthWrite: false,
    });
    mats.push(hm);
    quad.material = hm;
    renderer.setRenderTarget(rtH);
    renderer.render(scene, cam);
    quad.material = final;
    final.uniforms.uTile.value = f.tile;
    for (const [pass, rt] of [[0, rtA], [1, rtB]]) {
      final.uniforms.uPass.value = pass;
      renderer.setRenderTarget(rt, f.layer);
      renderer.render(scene, cam);
    }
  }
  renderer.setRenderTarget(prevRT);
  renderer.autoClear = prevAuto;
  for (const m of mats) m.dispose();
  quad.geometry.dispose();
  rtH.dispose();
  return { rtA, rtB, a: rtA.texture, b: rtB.texture, ms: performance.now() - t0 };
}
