// ─────────────────────────────────────────────────────────────────────────────
//  Materiais (ShaderMaterial) do mundo.
//
//  createSharedUniforms()    → uniforms globais (tempo, luzes, névoa).
//                               São passados POR REFERÊNCIA para todos os
//                               materiais: mudar um valor aqui afeta todo o mundo.
//                               (Não use material.clone(): ele copia os uniforms
//                               e quebra o compartilhamento.)
//
//  createSurfaceMaterial()   → a superfície da Cidade: concreto / aço.
//                               Juntas de placas, escorrimentos verticais,
//                               ferrugem, tom variando por placa, janelas
//                               minúsculas acesas (sem geometria, no shader),
//                               linhas técnicas fracas.
//  createSkyMaterial()       → o "infinito": névoa, luzes remotas, um disco escuro.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { NOISE_GLSL, SHARED_UNIFORMS_GLSL, FOG_GLSL } from './chunks.js';
import { SURF } from '../render/surfaceBaker.js';
import { shadowUniforms } from '../render/shadows.js';

/** Quantidade de luzes pontuais suportadas pelos shaders (ver world/lights.js). */
export const LIGHT_COUNT = 16;

/** Paleta (RGB linear): luz de rua de sódio, fluorescente cansada, branco frio, alerta. */
export const PALETTE = {
  sodium: new THREE.Vector3(1.0, 0.5, 0.17),
  fluoro: new THREE.Vector3(0.66, 0.78, 0.7),
  cold: new THREE.Vector3(0.72, 0.78, 0.9),
  warn: new THREE.Vector3(0.85, 0.12, 0.05),
  bone: new THREE.Vector3(0.62, 0.6, 0.55),
};

export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uLightPos: { value: Array.from({ length: LIGHT_COUNT }, () => new THREE.Vector3(0, -1e5, 0)) },
    uLightColor: { value: Array.from({ length: LIGHT_COUNT }, () => new THREE.Vector3()) },
    uLightFog: { value: Array.from({ length: LIGHT_COUNT }, () => new THREE.Vector3()) }, // cor · atenuação até a câmera
    uLightDown: { value: new Array(LIGHT_COUNT).fill(0) }, // 1 = luminária (ilumina para baixo), 0 = em todas as direções
    // apagões de setor (world/outages.js): A = centro (cena) + frente da queda; B = frente do religamento, raio
    uOutageA: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, -1)) },
    uOutageB: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    uFogDensity: { value: 0.0075 },
    uFogFalloff: { value: 0.0022 },
    uFogBase: { value: 0 },
    uScatter: { value: 0.01 },
    uOriginMod: { value: new THREE.Vector3() },
    uOrigin: { value: new THREE.Vector3() }, // origem flutuante inteira (setores de energia)
    uSectorSeed: { value: 0 },
    // poeira em suspensão: cinza neutro e um cinza quente
    uFogColorA: { value: new THREE.Vector3(0.014, 0.0145, 0.015) },
    uFogColorB: { value: new THREE.Vector3(0.021, 0.0195, 0.017) },
    // luz difusa "de lugar nenhum" — deixa as massas lerem como volume
    uAmbient: { value: new THREE.Vector3(0.036, 0.036, 0.037) },
    // silhuetas colossais (world/silhouettes.js): máscara em tela que escurece a névoa
    uSilMask: { value: null },
    uSilRes: { value: new THREE.Vector2(1, 1) },
    uSilOn: { value: 0 },
    // a lanterna na mão (app/carried.js): um facho de verdade, não uma luz em volta do corpo
    uFlashPos: { value: new THREE.Vector3(0, -1e6, 0) }, // a lente (cena)
    uFlashDir: { value: new THREE.Vector3(0, 0, -1) }, // para onde aponta
    uFlashColor: { value: new THREE.Vector3() }, // cor · intensidade (0 = apagada)
    // setores religados perto (world/substations.js): (i, faixa, k, ativo) e (subestação x, z em cena, frente da luz, y)
    uRestoredId: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uRestoredFront: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    // o tiro do emissor (app/beamfx.js): uma luz ao longo do feixe — não usa vaga de luz
    uShotA: { value: new THREE.Vector4() }, // início (cena), intensidade (0 = apagada)
    uShotB: { value: new THREE.Vector4() }, // fim (cena)
    // as texturas das superfícies, assadas pela seed (render/surfaceBaker.js): cor+altura e normal+aspereza
    uSurfA: { value: null },
    uSurfB: { value: null },
    uSurfOn: { value: 0 },
    uAgeSeed: { value: 0 }, // a idade por região: o deslocamento do ruído, pela seed do mundo
    ...shadowUniforms(), // as sombras das lâmpadas (render/shadows.js)
  };
}

const col = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
export { col as linearColor };

// ─── Superfície da Cidade ───────────────────────────────────────────────────

const SURF_VERT = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
uniform float uNoiseScale;
uniform float uSeed;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vPatPos;   // onde o desenho (placas, ferrugem, escorridos) é calculado
varying vec3 vPatN;
varying float vTop;  // m abaixo da borda de cima da face (o gerador põe no comprimento da normal; 24 = longe)
#ifdef USE_SURF_TEX
varying vec3 vAxX;   // os eixos do desenho, no mundo (o relevo das texturas volta ao mundo por eles)
varying vec3 vAxY;
varying vec3 vAxZ;
#endif

#include <clipping_planes_pars_vertex>
#include <batching_pars_vertex>
#include <skinning_pars_vertex>

void main() {
  vec3 p = position;
  vec3 n = normal;
  vTop = (clamp(length(normal), 0.5, 1.0) - 0.5) * 48.0;   // (gen/chunkgen.js markTopEdges: 0,5 → 1 = 0 → 24 m)
  // os corpos em malha contínua (world/flesh.js): a pele segue os ossos; o desenho fica na pose de repouso
  #ifdef USE_SKINNING
    vec3 objectNormal = n;
    vec3 transformed = p;
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>
    vec3 pRest = p;
    p = transformed;
    n = objectNormal;
  #endif
  #ifdef USE_INSTANCING
    p = (instanceMatrix * vec4(p, 1.0)).xyz;
    n = mat3(instanceMatrix) * n;
  #endif
  // lotes (BatchedMesh): cada chunk tem sua matriz numa textura
  #include <batching_vertex>
  #ifdef USE_BATCHING
    p = (batchingMatrix * vec4(p, 1.0)).xyz;
    n = mat3(batchingMatrix) * n;
  #endif

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  #ifdef USE_OBJECT_PATTERN
    // o que se move (elevadores, vagões, os Construtores, os colossos, o que cai): o desenho
    // preso ao objeto — senão as placas deslizam por ele enquanto anda
    vPatPos = p;
    vPatN = n;
    #ifdef USE_SKINNING
      vPatPos = pRest;
    #endif
    #ifdef USE_SURF_TEX
      vAxX = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
      vAxY = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
      vAxZ = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    #endif
  #else
    vPatPos = wp.xyz + uOriginMod;   // posição "global": os padrões contínuos na origem flutuante
    vPatN = vNormalW;
    #ifdef USE_SURF_TEX
      vAxX = vec3(1.0, 0.0, 0.0);
      vAxY = vec3(0.0, 1.0, 0.0);
      vAxZ = vec3(0.0, 0.0, 1.0);
    #endif
  #endif
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`;

const SURF_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
${FOG_GLSL}
uniform vec3  uAmbient;
uniform vec3  uBaseColor;     // concreto / aço
uniform vec3  uAccentColor;   // ferrugem, fuligem
uniform float uAccent;        // quanto de ferrugem
uniform float uPanel;         // tamanho da placa (m)
uniform float uSeams;         // 0..1: a grade de juntas e o tom por placa (0: superfície contínua)
uniform float uStreaks;       // escorrimentos verticais
uniform float uWindows;       // fração de janelas acesas (0 = sem janelas)
uniform vec3  uWindowColor;
uniform vec2  uWindowSize;    // célula de janela (m)
uniform vec3  uCircuitColor;  // linhas técnicas (emissão fraca)
uniform float uCircuit;
uniform float uCircuitScale;
uniform float uNoiseScale;
uniform float uSeed;
uniform float uFogAmount;     // 1 = névoa normal; < 1 = fura a névoa
uniform vec2  uFadeRange;     // distância (início, fim) em que se dissolve na névoa
uniform float uCutout;        // recorte: 0 nada · 1 degraus de escada · 2 grade vazada · 3 pichação
uniform float uWet;           // 0..1 superfície molhada (poças)
uniform float uAgeSeed;       // a idade por região (a seed do mundo)
// as sombras das lâmpadas (render/shadows.js): a distância até a luz guardada por 3 câmeras olhando para baixo
uniform sampler2D uShadowMap0;
uniform sampler2D uShadowMap1;
uniform sampler2D uShadowMap2;
uniform float uShadowIdx[3];
uniform mat4 uShadowVP[3];
#ifdef USE_SURF_TEX
uniform highp sampler2DArray uSurfA;  // cor (rgb, 0,5 = o tom do material) + altura (a)
uniform highp sampler2DArray uSurfB;  // normal no plano da textura (rgb) + aspereza (a)
uniform float uSurfOn;
uniform float uSurfLayer;     // a família (render/surfaceBaker.js SURF)
uniform float uSurfLayerTop;  // a família das faces viradas para cima (o piso de uma ponte, p. ex.)
uniform float uSurfScaleTop;
uniform float uSurfScale;     // 1 / (m por ladrilho)
uniform float uSurfBump;      // força do relevo
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;
#endif
#ifdef USE_REFLECTION
uniform sampler2D uReflTex;   // reflexo planar (render/reflection.js)
uniform float uReflOn;
#endif
#ifdef USE_HEAT
uniform vec4 uCutA[8];        // os últimos cortes (app/beamfx.js): início (cena), raio
uniform vec4 uCutB[8];        //   fim (cena), instante do tiro (s; < 0 = vaga vazia)
uniform float uHeatNow;
#endif

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vPatPos;
varying vec3 vPatN;
varying float vTop;

#include <clipping_planes_pars_fragment>

// a luz que passa (1) ou não (0) da lâmpada que tem o mapa j até P: 4 amostras (bordas macias)
float shadowSample(sampler2D m, mat4 vp, vec3 P, float dist, float slope) {
  vec4 c = vp * vec4(P, 1.0);
  float lit = 1.0;
  if (c.w > 0.0) {
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      // (a precisão do half float cai com a distância, e um texel de 512 a 150° cobre ~0,5% dela)
      float bias = 0.05 + dist * (0.004 + 0.012 * slope);
      float tx = 1.0 / 512.0;
      float s = 0.0;
      s += step(dist - bias, texture2D(m, uv + vec2(-0.6, -0.6) * tx).r);
      s += step(dist - bias, texture2D(m, uv + vec2(0.6, -0.6) * tx).r);
      s += step(dist - bias, texture2D(m, uv + vec2(-0.6, 0.6) * tx).r);
      s += step(dist - bias, texture2D(m, uv + vec2(0.6, 0.6) * tx).r);
      lit = s * 0.25;
    }
  }
  return lit;
}
float shadowFor(float i, vec3 P, float dist, float slope) {
  float lit = 1.0;
  if (i == uShadowIdx[0]) lit = shadowSample(uShadowMap0, uShadowVP[0], P, dist, slope);
  else if (i == uShadowIdx[1]) lit = shadowSample(uShadowMap1, uShadowVP[1], P, dist, slope);
  else if (i == uShadowIdx[2]) lit = shadowSample(uShadowMap2, uShadowVP[2], P, dist, slope);
  return lit;
}

#ifdef USE_SURF_TEX
// uma família do forno em triplanar: cor+altura (A), aspereza e a normal no espaço do desenho (np)
// (as caixas da Cidade são alinhadas aos eixos: quase sempre uma projeção só)
// (textureGrad com as derivadas de W tiradas antes: a chamada pode ficar dentro de um desvio — a ferrugem só onde
//  há ferrugem — sem errar o mipmap nas bordas)
void surfTri(vec3 W, vec3 dWx, vec3 dWy, vec3 pn, vec3 bw, float layer, float layerTop, float sc, float scTop, out vec4 A, out float rgh, out vec3 np) {
  A = vec4(0.0);
  rgh = 0.0;
  vec3 tnX = vec3(0.0, 0.0, 1.0);
  vec3 tnY = vec3(0.0, 0.0, 1.0);
  vec3 tnZ = vec3(0.0, 0.0, 1.0);
  if (bw.x > 0.01) {
    vec3 uvw = vec3(W.zy * sc, layer);
    vec2 gx = dWx.zy * sc;
    vec2 gy = dWy.zy * sc;
    vec4 b = textureGrad(uSurfB, uvw, gx, gy);
    A += textureGrad(uSurfA, uvw, gx, gy) * bw.x;
    rgh += b.w * bw.x;
    vec3 tn = b.xyz * 2.0 - 1.0;
    tn.xy *= uSurfBump;
    tnX = vec3(tn.xy + pn.zy, abs(tn.z) * pn.x);
  }
  if (bw.y > 0.01) {
    // (as faces de cima podem ser de outra família: o piso — só as quase horizontais: a metade de cima de um
    //  corrimão redondo continua a do resto)
    bool top = pn.y > 0.97;
    float k = top ? scTop : sc;
    vec3 uvw = vec3(W.xz * k, top ? layerTop : layer);
    vec2 gx = dWx.xz * k;
    vec2 gy = dWy.xz * k;
    vec4 b = textureGrad(uSurfB, uvw, gx, gy);
    A += textureGrad(uSurfA, uvw, gx, gy) * bw.y;
    rgh += b.w * bw.y;
    vec3 tn = b.xyz * 2.0 - 1.0;
    tn.xy *= uSurfBump;
    tnY = vec3(tn.xy + pn.xz, abs(tn.z) * pn.y);
  }
  if (bw.z > 0.01) {
    vec3 uvw = vec3(W.xy * sc, layer);
    vec2 gx = dWx.xy * sc;
    vec2 gy = dWy.xy * sc;
    vec4 b = textureGrad(uSurfB, uvw, gx, gy);
    A += textureGrad(uSurfA, uvw, gx, gy) * bw.z;
    rgh += b.w * bw.z;
    vec3 tn = b.xyz * 2.0 - 1.0;
    tn.xy *= uSurfBump;
    tnZ = vec3(tn.xy + pn.xy, abs(tn.z) * pn.z);
  }
  // (o blend "whiteout" — sem tangentes)
  np = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
}
#endif

void main() {
  #include <clipping_planes_fragment>

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 Ng = normalize(vNormalW);
  if (dot(Ng, V) < 0.0) Ng = -Ng;
  vec3 Nd = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (dot(Nd, V) < 0.0) Nd = -Nd;
  vec3 N = normalize(mix(Ng, Nd, 0.1));

  float t = uTime;
  vec3 W = vPatPos;   // a posição para os padrões (global; ou do objeto, no que se move)
  vec3 P = W * uNoiseScale + uSeed;

  // projeção pela normal dominante (a do desenho: a do objeto, no que se move)
  vec3 an = abs(normalize(vPatN));
  bool onX = an.x > an.y && an.x > an.z;
  bool onY = !onX && an.y > an.z;
  vec2 uvP = onX ? W.zy : (onY ? W.xz : W.xy);

  // a idade do lugar (manchas de ~400 m, pela seed do mundo): quanto escorrido e quanta ferrugem
  float age = smoothstep(-0.6, 0.6, snoise(W * 0.0025 + uAgeSeed));
  float rust = clamp(smoothstep(0.25, 0.75, snoise(W * uNoiseScale * 0.6 + 5.0)) * uAccent * (0.3 + 1.4 * age), 0.0, 1.0);

  // ── as texturas assadas (render/surfaceBaker.js): triplanar, relevo na luz ──
  float surfH = 0.5;
  float surfRough = -1.0;
  vec3 surfCol = vec3(0.5);
  float rustTone = 0.5;
  #ifdef USE_SURF_TEX
  if (uSurfOn > 0.5) {
    vec3 pn = normalize(vPatN);
    vec3 bw = pow(abs(pn), vec3(8.0));
    bw /= bw.x + bw.y + bw.z;
    vec4 A;
    float rgh;
    vec3 np;
    vec3 dWx = dFdx(W);
    vec3 dWy = dFdy(W);
    surfTri(W, dWx, dWy, pn, bw, uSurfLayer, uSurfLayerTop, uSurfScale, uSurfScaleTop, A, rgh, np);
    #ifdef USE_SURF_RUST
    if (rust > 0.15) {
      // onde a ferrugem toma conta, o relevo e a aspereza passam a ser os dela (só lá: a segunda amostragem custava)
      vec4 RA;
      float rR;
      vec3 npR;
      surfTri(W, dWx, dWy, pn, bw, SURF_RUST_LAYER, SURF_RUST_LAYER, SURF_RUST_SCALE, SURF_RUST_SCALE, RA, rR, npR);
      float m = smoothstep(0.15, 0.6, rust);
      A = mix(A, RA, m);
      rgh = mix(rgh, rR, m);
      np = normalize(mix(np, npR, m));
      rustTone = RA.r;
    }
    #endif
    vec3 nw = normalize(vAxX * np.x + vAxY * np.y + vAxZ * np.z);
    if (dot(nw, V) < 0.0) nw = -nw;
    N = normalize(mix(nw, Nd, 0.08));
    surfCol = A.rgb;
    surfH = A.a;
    surfRough = rgh;
  }
  #endif

  // ── recortes: a geometria continua sólida (colisão), o desenho não ──
  // (só compilado nos materiais com recorte: um discard no programa desliga o
  // teste de profundidade antecipado da GPU para TODOS que o usam)
  #ifdef USE_CUTOUT
  {
    float keep;
    if (uCutout < 1.5) {
      // degraus de escada de marinheiro, a cada 35 cm
      float q = W.y / 0.35;
      keep = step(fract(q), 0.2) + step(0.5, fwidth(q));
    } else if (uCutout < 2.5) {
      // grade de piso metálico
      vec2 g = uvP / 0.12;
      keep = step(fract(g.x), 0.28) + step(fract(g.y), 0.28) + step(0.45, length(fwidth(g)));
    } else {
      // pichação: traços finos e irregulares
      float s1 = abs(snoise(vec3(uvP * 0.9, uSeed)));
      float s2 = snoise(vec3(uvP * 0.15, uSeed + 3.0));
      keep = step(s1, 0.045 + 0.03 * s2) * step(-0.1, s2);
    }
    if (keep < 0.5) discard;
  }
  #endif

  // ── placas e juntas ──
  vec2 pc = uvP / uPanel;
  vec2 cell = floor(pc);
  vec2 fe = min(fract(pc), 1.0 - fract(pc)) * uPanel;   // distância à junta (m)
  float ed = min(fe.x, fe.y);
  float fw = max(fwidth(ed), 1e-4);
  float seam = 1.0 - smoothstep(0.035, 0.035 + fw * 1.5, ed);
  seam = mix(seam, 0.12, smoothstep(0.03, 0.25, fw / uPanel));   // longe: só um tom médio
  seam *= uSeams;

  // o tom: por placa só onde há placas; senão, manchas largas e contínuas (sem a grade de blocos)
  float tone = mix(0.5 + 0.45 * snoise(vec3(uvP / (uPanel * 3.0), uSeed + 9.0)), hash12(cell + uSeed * 3.1), uSeams);
  float mott = fbmAA(P, length(fwidth(P)));
  // escorrimentos: ruído esticado na vertical (chuva, óleo, séculos)
  float streak = snoise(vec3(W.x * 0.3, W.y * 0.01, W.z * 0.3) + uSeed);
  float stain = smoothstep(0.05, 0.85, streak) * uStreaks * (onY ? 0.3 : 1.0) * (0.45 + 1.1 * age);

  vec3 concrete = uBaseColor * (0.7 + 0.34 * tone + 0.22 * mott);
  if (surfRough >= 0.0) {
    concrete = uBaseColor * (surfCol / 0.5) * (0.88 + 0.16 * tone + 0.1 * mott);
    concrete *= mix(0.72, 1.0, smoothstep(0.3, 0.55, surfH));   // o fundo das juntas e das covas
    // (as juntas grandes das placas continuam as do material: a textura é o detalhe dentro delas)
  }
  concrete = mix(concrete, uAccentColor * (rustTone / 0.5), rust * 0.85);
  concrete *= 1.0 - stain * 0.55;
  // ── os escorridos das bordas (o rework gráfico, etapa 4): a água que desce das quinas e dos beirais
  //    deixa faixas — mais longas nos lugares velhos —, e a sujeira junta logo abaixo da quina ──
  if (vTop < 23.5 && !onY) {
    float u = onX ? W.z : W.x;
    float lane = snoise(vec3(u * 0.35, 0.0, uSeed + 31.0)) * 0.5 + 0.5;   // (faixas de ~3 m: de longe, 1 m virava um borrão)
    float lenN = snoise(vec3(u * 0.13, 1.7, uSeed + 7.0)) * 0.5 + 0.5;
    float L = mix(1.0, 10.0, lenN) * (0.5 + age);
    float fall = 1.0 - smoothstep(0.0, L, vTop + 0.6 * snoise(vec3(u * 3.0, vTop * 0.4, uSeed)));
    float drip = smoothstep(0.5, 0.85, lane) * fall + 0.18 * (1.0 - smoothstep(0.05, 0.3, vTop));
    drip *= 0.3 + 0.7 * uStreaks;
    concrete = mix(concrete, uAccentColor * 0.8, drip * uAccent * 0.5);   // (no metal, a ferrugem escorre junto)
    concrete *= 1.0 - drip * 0.26;
  }
  concrete *= 1.0 - seam * 0.6;
  // poeira depositada clareia o que está virado para cima
  concrete *= 1.0 + 0.2 * smoothstep(0.75, 1.0, vNormalW.y);

  vec3 albedo = concrete;
  vec3 emit = vec3(0.0);

  // ── linhas técnicas (fracas, quase apagadas) ──
  if (uCircuit > 0.001) {
    vec2 uv = uvP * uCircuitScale;
    vec2 cc = floor(uv);
    vec2 fu = fract(uv) - 0.5;
    float h = hash12(cc + uSeed * 7.0);
    float trH = smoothstep(0.035, 0.0, abs(fu.y)) * step(h, 0.4);
    float trV = smoothstep(0.035, 0.0, abs(fu.x)) * step(0.6, h);
    float region = smoothstep(0.2, 0.5, snoise(W * uNoiseScale * 0.35 + 11.0 + uSeed));
    float circuit = max(trH, trV) * region * uCircuit;
    float flow = fract((uv.x + uv.y) * 0.07 - t * 0.2 + h * 7.0);
    flow = smoothstep(0.0, 0.03, flow) * smoothstep(0.15, 0.03, flow);
    albedo *= 1.0 - circuit * 0.35;
    emit += uCircuitColor * circuit * (0.03 + 0.5 * flow) * outagePower(vWorldPos, 0.5) * sectorPower(vWorldPos);
  }

  // ── janelas: milhares de pontos de luz em paredes colossais ──
  if (uWindows > 0.0 && !onY) {
    vec2 wuv = uvP / uWindowSize;
    vec2 wc = floor(wuv);
    vec2 wf = fract(wuv);
    float inside = step(0.36, wf.x) * step(wf.x, 0.64) * step(0.34, wf.y) * step(wf.y, 0.66);
    float hsh = hash12(wc * 1.37 + uSeed * 11.0);
    // bairros inteiros apagados, outros acesos
    float district = smoothstep(-0.3, 0.5, snoise(vec3(wc * uWindowSize * 0.006, uSeed * 0.1)));
    float on = step(1.0 - uWindows * district, hsh);
    float flick = step(0.015, hash12(wc + floor(t * 2.0 + hsh * 50.0)));
    vec3 wcol = mix(uWindowColor, vec3(0.62, 0.72, 0.66), step(0.72, fract(hsh * 7.0)));
    float wfw = length(fwidth(wuv));
    float farW = smoothstep(0.2, 0.9, wfw);
    float near = inside * on * flick * (0.07 + 0.1 * fract(hsh * 13.0));
    emit += wcol * mix(near, uWindows * district * 0.03, farW) * outagePower(vWorldPos, hsh) * sectorPower(vWorldPos);
    albedo *= 1.0 - inside * (1.0 - farW) * 0.45;     // o vão escuro da janela
  }

  // ── molhado: escurece, espelha, ondula ──
  if (uWet > 0.001) {
    albedo *= 1.0 - 0.7 * uWet;
    N = normalize(N + vec3(snoise(W * 2.5 + t * 0.6), 0.0, snoise(W * 2.5 - t * 0.5)) * 0.04 * uWet);
    // as gotas que caem na água parada (o rework gráfico, segunda rodada): anéis que nascem num ponto
    // sorteado de cada célula e se abrem, apagando; nas poças, perto; nos setores inundados, espaçados
    if (uWet > 0.9 && Ng.y > 0.8) {
      #ifdef USE_REFLECTION
        const float RC = 2.6; const float RON = 0.35;
      #else
        const float RC = 0.9; const float RON = 0.8;
      #endif
      vec2 rp = W.xz / RC;
      vec2 cell = floor(rp);
      vec2 gr = vec2(0.0);
      for (int dx = -1; dx <= 1; dx++) {
        for (int dz = -1; dz <= 1; dz++) {
          vec2 cc = cell + vec2(float(dx), float(dz));
          float h1 = fract(sin(dot(cc, vec2(127.1, 311.7))) * 43758.55);
          float h2 = fract(sin(dot(cc, vec2(269.5, 183.3))) * 43758.55);
          if (h1 > RON) continue;
          float ph = fract(t * (0.35 + 0.5 * h2) + h1 * 7.0);
          vec2 d = rp - (cc + vec2(h1, h2) * 0.8 + 0.1);
          float dl = length(d) + 1e-4;
          float w = dl - ph * 0.9;
          float amp = (1.0 - ph) * (1.0 - ph) * exp(-w * w * 120.0);
          gr += d / dl * sin(w * 70.0) * amp;
        }
      }
      N = normalize(N + vec3(gr.x, 0.0, gr.y) * 0.35);
    }
  }

  // ── iluminação ──
  // luz difusa vinda de cima: o que olha para baixo mergulha no escuro
  vec3 lit = uAmbient * (0.3 + 0.7 * (N.y * 0.5 + 0.5)) * (0.8 + 0.4 * mott);
  vec3 spec = vec3(0.0);
  float gloss = mix(10.0, 400.0, uWet);
  float specK = 0.08 + 3.0 * uWet;
  if (surfRough >= 0.0) {
    gloss = mix(mix(120.0, 6.0, surfRough), 400.0, uWet);
    specK = 0.05 + 0.6 * (1.0 - surfRough) + 3.0 * uWet;
  }
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec3 Lv = uLightPos[i] - vWorldPos;
    float d2 = dot(Lv, Lv);
    float d = sqrt(d2);
    vec3 L = Lv / d;
    float att = exp(-uFogDensity * d) / (1.0 + d2);
    vec3 lc = uLightColor[i] * att;
    if (lc.r + lc.g + lc.b < 1e-5) continue; // não contribui: pula o especular
    // (a luminária: o que está acima dela só recebe o pouco que vaza da carcaça)
    if (uLightDown[i] > 0.5) lc *= mix(0.1, 1.0, smoothstep(-0.25, 0.3, L.y));
    float ndl = max(dot(N, L), 0.0);
    // a sombra (só as lâmpadas com mapa — render/shadows.js); o declive da face aumenta a tolerância
    // (a amostra afastada da face pela normal: sem isso a face se sombreia a si mesma)
    vec3 Ps = vWorldPos + Ng * (0.03 + 0.004 * d);
    float sh = shadowFor(float(i), Ps, length(uLightPos[i] - Ps), 1.0 - abs(dot(Ng, L)));
    // a luz rebatida: a lâmpada enche um pouco o espaço em volta (o que está de costas e na sombra
    // não fica preto — o concreto devolve a luz), sem apagar o contraste
    lit += lc * (ndl * sh + 0.06);
    vec3 H = normalize(L + V);
    spec += lc * pow(max(dot(N, H), 0.0), gloss) * sh;
  }

  // a lanterna: um cone com centro forte, anéis do refletor e manchas da lente
  if (uFlashColor.r + uFlashColor.g + uFlashColor.b > 1e-4) {
    vec3 Lv = uFlashPos - vWorldPos;
    float d2 = dot(Lv, Lv);
    float d = sqrt(d2);
    vec3 L = Lv / d;
    // campo próximo suave (a lente tem tamanho) e um teto: de perto clareia, não estoura
    vec3 fc = uFlashColor * flashProfile(-L) * exp(-uFogDensity * 2.0 * d) / (3.0 + d2);
    fc = min(fc, vec3(2.2));
    if (fc.r + fc.g + fc.b > 1e-5) {
      lit += fc * max(dot(N, L), 0.0);
      vec3 H = normalize(L + V);
      spec += fc * pow(max(dot(N, H), 0.0), gloss);
    }
  }

  // o tiro do emissor: luz branca e quente vinda do ponto mais perto do feixe
  if (uShotA.w > 1e-3) {
    vec3 ab = uShotB.xyz - uShotA.xyz;
    float tq = clamp(dot(vWorldPos - uShotA.xyz, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    vec3 Lv = uShotA.xyz + ab * tq - vWorldPos;
    float d2 = dot(Lv, Lv);
    float d = sqrt(d2);
    // (a cor pela sobrecarga — uShotB.w: 0 branco quente … 1 violeta — app/beamfx.js beamColors)
    vec3 sc = mix(vec3(1.0, 0.9, 0.78), vec3(0.55, 0.3, 1.0), clamp(uShotB.w, 0.0, 1.0)) * uShotA.w * exp(-uFogDensity * d) / (1.0 + 0.6 * d2);
    lit += min(sc, vec3(3.0)) * max(dot(N, Lv / max(d, 1e-3)), 0.0);
  }

  // as faces do corte em brasa (só o material 'cut'): branco-alaranjado → vermelho → aço escuro
  // em ~15 s, a partir de quando a detonação passa ali (1500 m/s ao longo do feixe)
  #ifdef USE_HEAT
  for (int i = 0; i < 8; i++) {
    vec4 A = uCutA[i];
    vec4 B = uCutB[i];
    if (B.w < 0.0) continue;
    vec3 ab = B.xyz - A.xyz;
    float L2 = max(dot(ab, ab), 1e-4);
    float tq = clamp(dot(vWorldPos - A.xyz, ab) / L2, 0.0, 1.0);
    float age = uHeatNow - B.w - tq * sqrt(L2) / 1500.0;
    if (age < 0.0 || age > 16.0) continue;
    float d = length(A.xyz + ab * tq - vWorldPos);
    float on = 1.0 - smoothstep(0.2, 0.7, abs(d - A.w));
    if (on <= 0.0) continue;
    // (manchas: o metal esfria desigual — e o calor some primeiro onde a placa é fina)
    // (variação larga e suave — o ruído fino de antes, com a cor de volta, virava pintas de onça)
    float mott = 0.72 + 0.28 * snoise(W * 0.35 + float(i));
    // (cores puras: o filme dessatura tudo para ~38% — app/render.js — e o laranja tem de chegar quente)
    vec3 hc = age < 0.6 ? mix(vec3(1.0, 0.7, 0.35), vec3(1.0, 0.26, 0.02), age / 0.6)
                        : mix(vec3(1.0, 0.26, 0.02), vec3(0.6, 0.02, 0.0), clamp((age - 0.6) / 5.0, 0.0, 1.0));
    emit += hc * on * mott * 3.2 * exp(-age / 2.0) * (1.0 - smoothstep(10.0, 15.0, age));
  }
  #endif

  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 c = albedo * lit + spec * specK + emit;
  c += uFogColorB * fres * uWet * 3.0; // reflexo da poeira iluminada na água
  c += uFogColorB * fres * 0.5;   // borda levemente mais clara → silhueta

  vec3 outc = applyFog(c, vWorldPos, uFogAmount, uFadeRange);
  #ifdef USE_REFLECTION
  // água parada: o reflexo (que já traz a névoa do caminho inteiro) por cima,
  // tremido pelas ondulações; mais espelho em ângulo rasante (Fresnel)
  if (uReflOn > 0.5) {
    vec2 suv = gl_FragCoord.xy / uSilRes;
    vec2 wob = (N.xz - Ng.xz) * 0.25;
    vec3 refl = texture2D(uReflTex, vec2(suv.x, 1.0 - suv.y) + wob).rgb;
    float F = mix(0.3, 1.0, pow(1.0 - max(dot(Ng, V), 0.0), 3.0));
    float far = 1.0 - smoothstep(uFadeRange.x, uFadeRange.y, length(cameraPosition - vWorldPos));
    outc = mix(outc, refl, F * 0.85 * far);
  }
  #endif
  gl_FragColor = vec4(outc, 1.0);
}
`;

/**
 * Superfície da Cidade. Todos os parâmetros são opcionais.
 * @param {object} shared  uniforms de createSharedUniforms()
 */
export function createSurfaceMaterial(shared, params = {}) {
  const p = {
    base: col(0.1, 0.098, 0.092), // concreto
    accent: col(0.11, 0.06, 0.035), // ferrugem
    accentAmount: 0.15,
    panel: 4,
    seams: 0, // a grade de juntas/placas (0..1): só onde o contexto pede — o usuário, 2026-10-09: "tiles em todo lugar"
    streaks: 0.6,
    windows: 0,
    windowColor: col(1.0, 0.55, 0.22),
    windowSize: [3, 4],
    circuit: col(0.35, 0.42, 0.4),
    circuitAmount: 0.0,
    circuitScale: 0.5,
    noiseScale: 0.08,
    seed: 0,
    fogAmount: 1,
    fade: [1e9, 2e9],
    cutout: 0,
    reflect: false, // água parada: lê o reflexo planar (render/reflection.js)
    wet: 0,
    heat: false, // as faces do corte do emissor: em brasa depois do tiro (só o material 'cut')
    surf: null, // { layer, tile, bump, top?: { layer, tile }, rust?: true }: as texturas assadas (render/surfaceBaker.js SURF)
    side: THREE.FrontSide,
    ...params,
  };
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT, ...(p.cutout ? { USE_CUTOUT: 1 } : {}), ...(p.reflect ? { USE_REFLECTION: 1 } : {}), ...(p.heat ? { USE_HEAT: 1 } : {}), ...(p.surf ? { USE_SURF_TEX: 1 } : {}), ...(p.surf?.rust ? { USE_SURF_RUST: 1, SURF_RUST_LAYER: `${SURF.rust.layer}.0`, SURF_RUST_SCALE: `${1 / SURF.rust.tile}` } : {}) },
    uniforms: {
      ...shared,
      uBaseColor: { value: p.base },
      uAccentColor: { value: p.accent },
      uAccent: { value: p.accentAmount },
      uPanel: { value: p.panel },
      uSeams: { value: p.seams },
      uStreaks: { value: p.streaks },
      uWindows: { value: p.windows },
      uWindowColor: { value: p.windowColor },
      uWindowSize: { value: new THREE.Vector2(p.windowSize[0], p.windowSize[1]) },
      uCircuitColor: { value: p.circuit },
      uCircuit: { value: p.circuitAmount },
      uCircuitScale: { value: p.circuitScale },
      uNoiseScale: { value: p.noiseScale },
      uSeed: { value: p.seed },
      uFogAmount: { value: p.fogAmount },
      uFadeRange: { value: new THREE.Vector2(p.fade[0], p.fade[1]) },
      uCutout: { value: p.cutout },
      uWet: { value: p.wet },
      uSurfLayer: { value: p.surf?.layer ?? 0 },
      uSurfScale: { value: p.surf ? 1 / p.surf.tile : 1 },
      uSurfLayerTop: { value: p.surf?.top?.layer ?? p.surf?.layer ?? 0 },
      uSurfScaleTop: { value: p.surf ? 1 / (p.surf.top?.tile ?? p.surf.tile) : 1 },
      uSurfBump: { value: p.surf?.bump ?? 1 },
      uReflTex: { value: null },
      uReflOn: { value: 0 },
      ...(p.heat
        ? {
            uCutA: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
            uCutB: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1)) },
            uHeatNow: { value: 0 },
          }
        : {}),
    },
    vertexShader: SURF_VERT,
    fragmentShader: SURF_FRAG,
    side: p.side,
    clipping: true,
  });
}

/**
 * A variante "presa ao objeto" de um material de superfície: o mesmo programa e os MESMOS uniforms
 * (a luz, a névoa, o tempo continuam vindo de um lugar só), com o desenho calculado nas coordenadas do
 * próprio objeto (USE_OBJECT_PATTERN). Para o que se move. Outros materiais voltam como estão.
 */
const _moving = new WeakMap();
export function movingMaterial(m) {
  if (!m || m.vertexShader !== SURF_VERT) return m;
  let v = _moving.get(m);
  if (!v) {
    v = new THREE.ShaderMaterial({
      defines: { ...m.defines, USE_OBJECT_PATTERN: 1 },
      uniforms: m.uniforms,
      vertexShader: m.vertexShader,
      fragmentShader: m.fragmentShader,
      side: m.side,
      clipping: true,
    });
    _moving.set(m, v);
  }
  return v;
}

/**
 * Uma cópia própria de um material dos lotes (os mesmos uniforms, o mesmo shader) para uma malha COMUM.
 * O three escolhe o programa pelo material e pelo tipo do objeto: o mesmo ShaderMaterial desenhado ora
 * num BatchedMesh (os chunks), ora numa malha comum, troca de programa a cada vez — e cada troca monta
 * a chave do programa com o código inteiro do shader (getProgram/getParameters: ~20% da CPU do quadro,
 * medido com --progswitch e --cpuprofile). world.js aplica isto a toda malha comum da cena.
 */
const _solo = new WeakMap();
export function soloMaterial(m) {
  if (!m?.isShaderMaterial) return m;
  let v = _solo.get(m);
  if (!v) {
    v = m.clone();
    v.uniforms = m.uniforms; // (compartilhados: o mundo muda um, os dois mudam)
    v.name = m.name;
    _solo.set(m, v);
  }
  return v;
}

// ─── Feixes de luz volumétricos ─────────────────────────────────────────────
//  Cilindros abertos com blending aditivo. A coordenada "ao longo do feixe"
//  (0 na fonte, 1 no fim) vem codificada em normal.y pela geometria (ver
//  gen/beams.js). Sem poeira no ar (névoa 0), o feixe quase desaparece.

const BEAM_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vN;
varying float vAlong;
#include <batching_pars_vertex>
void main() {
  vAlong = normal.y;
  mat4 M = modelMatrix;
  #include <batching_vertex>
  #ifdef USE_BATCHING
    M = modelMatrix * batchingMatrix;
  #endif
  vN = normalize(mat3(M) * vec3(normal.x, 0.0, normal.z) + vec3(1e-5));
  vec4 wp = M * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
uniform vec3 uBeamColor;
uniform float uIntensity;
uniform vec2 uFadeRange;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vAlong;
void main() {
  vec3 V = cameraPosition - vWorldPos;
  float dist = length(V);
  V /= dist;
  vec3 n = normalize(vec3(vN.x, 0.0, vN.z));
  vec3 vh = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5));
  float core = pow(abs(dot(n, vh)), 2.0);                         // o miolo do feixe é mais denso
  float along = clamp(vAlong, 0.0, 1.0);
  float fade = pow(1.0 - along, 1.4) * smoothstep(0.0, 0.04, along);
  float motes = 0.65 + 0.35 * snoise((vWorldPos + uOriginMod) * 0.04 + vec3(0.0, -uTime * 0.25, 0.0));
  float T = exp(-uFogDensity * 0.35 * dist);
  float dustAmount = clamp(uFogDensity / 0.0075, 0.08, 1.6);
  float far = 1.0 - smoothstep(uFadeRange.x, uFadeRange.y, dist);
  vec3 c = uBeamColor * uIntensity * core * fade * motes * T * dustAmount * far;
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createBeamMaterial(shared, { color = new THREE.Vector3(0.9, 0.85, 0.75), intensity = 0.06, fade = [1e9, 2e9] } = {}) {
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT },
    uniforms: {
      ...shared,
      uBeamColor: { value: color.clone() },
      uIntensity: { value: intensity },
      uFadeRange: { value: new THREE.Vector2(fade[0], fade[1]) },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ─── Cascatas ───────────────────────────────────────────────────────────────
//  A coluna d'água (gen/cascades.js): três camadas de tubo aberto ao longo da queda — o MIOLO denso,
//  a CORTINA e o SPRAY de fora, cada vez mais largos e mais rasgados (a camada no comprimento de
//  normal.xz: 1, 2, 3); "ao longo" em normal.y. Fios d'água descendo rápido (ruído esticado na
//  vertical), PEDAÇOS de água caindo (bolhas claras que descem mais rápido que os fios), a borda
//  ondulando (o vértice se afasta e volta, pelo ruído) e rasgada nas camadas de fora. A água é
//  translúcida: acende com as lâmpadas próximas e com a lanterna, sem depender da normal. Perto do fim
//  a coluna se desfaz em névoa — nas que caem numa poça, "ao longo" nunca chega lá.
//  A ESPUMA (o pé da queda): um anel baixo e largo de água revolta subindo e se desfazendo
//  (o "ao longo" é a altura). A POÇA: escura e espelhada, com as ondas saindo do ponto onde a água
//  bate e a espuma no meio (a posição em relação ao centro vai em normal.xz; o raio, em normal.y).

const CASCADE_VERT = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vAlong;
varying float vLayer;
#include <batching_pars_vertex>
void main() {
  vAlong = normal.y;
  vLayer = length(normal.xz);
  vec2 rad = normal.xz / max(vLayer, 1e-4);
  mat4 M = modelMatrix;
  #include <batching_vertex>
  #ifdef USE_BATCHING
    M = modelMatrix * batchingMatrix;
  #endif
  // a borda ondula: o vértice se afasta e volta pelo ruído (mais nas camadas de fora, mais embaixo)
  vec3 p = position;
  float wob = snoise(vec3(atan(rad.y, rad.x) * 1.3 + vLayer * 3.1, (p.y + uTime * 18.0) * 0.045, vLayer));
  p.xz += rad * wob * (0.25 + 0.55 * vLayer) * (0.3 + 1.2 * clamp(vAlong, 0.0, 1.0));
  vN = normalize(mat3(M) * vec3(rad.x, 0.0, rad.y) + vec3(1e-5));
  vec4 wp = M * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** A luz que a água translúcida recebe: um pouco de ambiente, as lâmpadas próximas e a lanterna. */
const WATER_LIGHT_GLSL = /* glsl */ `
vec3 waterLight(vec3 P, float bright) {
  vec3 c = uAmbient * 2.2 + uFogColorB * 3.0;
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec3 L = uLightPos[i] - P;
    float d2 = dot(L, L);
    c += uLightColor[i] * (0.6 + 0.8 * bright) / (1.0 + d2) * exp(-uFogDensity * sqrt(d2));
  }
  if (uFlashColor.r + uFlashColor.g + uFlashColor.b > 1e-4) {
    vec3 L = uFlashPos - P;
    float d2 = dot(L, L);
    float cone = smoothstep(0.82, 0.97, dot(-L / sqrt(d2), uFlashDir));
    c += min(uFlashColor * cone * (0.5 + 0.8 * bright) * exp(-uFogDensity * 2.0 * sqrt(d2)) / (3.0 + d2), vec3(1.5));
  }
  return c;
}
`;

const CASCADE_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
${FOG_GLSL}
uniform vec2 uFadeRange;
uniform vec3 uAmbient;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vAlong;
varying float vLayer;
${WATER_LIGHT_GLSL}
void main() {
  vec3 V = cameraPosition - vWorldPos;
  float dist = length(V);
  V /= dist;
  vec3 n = normalize(vec3(vN.x, 0.0, vN.z));
  vec3 vh = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5));
  float core = pow(abs(dot(n, vh)), 1.5);
  float along = clamp(vAlong, 0.0, 1.0);
  float layer = floor(vLayer + 0.5); // 1 o miolo · 2 a cortina · 3 o spray
  vec3 W = vWorldPos + uOriginMod;
  float ang = atan(n.z, n.x);
  // fios d'água: ruído esticado na vertical, descendo (cada camada no seu ritmo)
  float fall = uTime * (22.0 + 6.0 * layer);
  float s1 = snoise(vec3(ang * (2.0 + layer), (W.y + fall) * 0.03, 0.3 + layer * 7.0));
  float s2 = snoise(vec3(ang * (6.0 + 3.0 * layer), (W.y + fall * 1.3) * 0.11, 4.1 + layer));
  float streak = smoothstep(-0.35, 0.75, s1) * (0.65 + 0.35 * s2);
  // os pedaços de água: manchas claras que caem mais rápido que os fios
  float clump = smoothstep(0.55, 0.9, snoise(vec3(ang * 1.4 + layer * 2.0, (W.y + uTime * 46.0) * 0.022, 9.0 + layer)));
  // as camadas de fora: rasgadas (só fiapos e borrifo)
  float tear = layer < 1.5 ? 1.0 : smoothstep(layer < 2.5 ? -0.1 : 0.25, 0.6, snoise(vec3(ang * 3.0, (W.y + fall * 0.8) * 0.018, layer * 3.3)));
  float mist = smoothstep(0.62, 1.0, along); // fim da queda: a água vira névoa
  float dens = layer < 1.5 ? 1.0 : layer < 2.5 ? 0.55 : 0.28;
  float alpha = (0.14 + 0.6 * streak + 0.5 * clump) * mix(0.35, 1.0, core) * tear * dens;
  alpha *= smoothstep(0.0, 0.004, along) * (1.0 - mist);
  vec3 c = waterLight(vWorldPos, streak + clump);
  c = applyFog(c, vWorldPos, 1.0, uFadeRange);
  float far = 1.0 - smoothstep(uFadeRange.x, uFadeRange.y, dist);
  gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0) * far);
}
`;

const FOAM_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
${FOG_GLSL}
uniform vec2 uFadeRange;
uniform vec3 uAmbient;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vAlong;
varying float vLayer;
${WATER_LIGHT_GLSL}
void main() {
  float dist = length(cameraPosition - vWorldPos);
  float h = clamp(vAlong, 0.0, 1.0); // 0 no pé · 1 em cima
  vec3 n = normalize(vec3(vN.x, 0.0, vN.z));
  float ang = atan(n.z, n.x);
  vec3 W = vWorldPos + uOriginMod;
  // a água revolta: bolhas subindo e se abrindo, rasgadas no alto
  float b1 = snoise(vec3(ang * 4.0 + vLayer, (W.y - uTime * 5.0) * 0.5, uTime * 0.6));
  float b2 = snoise(vec3(ang * 11.0, (W.y - uTime * 8.0) * 1.4, 3.0 + uTime * 0.9));
  float foam = smoothstep(-0.2, 0.7, b1) * (0.6 + 0.4 * b2);
  // (o alto rasgado pelo ruído: a borda de cima não vira um disco)
  float top = 1.0 - smoothstep(0.1, 0.75, h + 0.25 * b2);
  float alpha = foam * top * smoothstep(0.0, 0.08, h) * (0.85 - 0.25 * vLayer / 3.0);
  vec3 c = waterLight(vWorldPos, 0.8 + foam) * 1.15;
  c = applyFog(c, vWorldPos, 1.0, uFadeRange);
  float far = 1.0 - smoothstep(uFadeRange.x, uFadeRange.y, dist);
  gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0) * far);
}
`;

const POOL_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vRad;    // a posição em relação ao centro (−1..1 no raio)
varying float vR;     // o raio da poça (m); 0 nas faces de lado
#include <batching_pars_vertex>
void main() {
  bool top = normal.y > 0.5;
  vRad = top ? normal.xz : vec2(0.0);
  vR = top ? (normal.y - 1.0) * 100.0 : 0.0;
  mat4 M = modelMatrix;
  #include <batching_vertex>
  #ifdef USE_BATCHING
    M = modelMatrix * batchingMatrix;
  #endif
  vec4 wp = M * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const POOL_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
${FOG_GLSL}
uniform vec2 uFadeRange;
uniform vec3 uAmbient;
uniform float uCore;  // a fração do raio onde a água bate (a espuma)
varying vec3 vWorldPos;
varying vec2 vRad;
varying float vR;
void main() {
  vec3 V = cameraPosition - vWorldPos;
  float dist = length(V);
  V /= dist;
  float r = length(vRad);
  float rm = r * vR; // m do centro
  vec3 W = vWorldPos + uOriginMod;
  // as ondas: anéis saindo do centro (mais fortes perto, morrendo na borda) e o arrepio do borrifo
  float ring = sin(rm * 2.4 - uTime * 5.0) * exp(-rm * 0.09) + 0.5 * sin(rm * 5.3 - uTime * 7.3 + snoise(W * 0.2) * 2.0) * exp(-rm * 0.18);
  vec2 dir = r > 1e-4 ? vRad / r : vec2(0.0);
  vec2 g = dir * ring * 0.16 + vec2(snoise(vec3(W.xz * 1.7, uTime * 1.3)), snoise(vec3(W.xz * 1.7 + 9.0, uTime * 1.3))) * 0.05;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  // a água escura: o reflexo da névoa iluminada (Fresnel) e as lâmpadas espelhadas
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 c = vec3(0.006, 0.0065, 0.0075) + (uAmbient * 0.25 + uFogColorB * 0.3) * fres; // (o que a água espelha aqui é quase só escuro)
  vec3 R = reflect(-V, N);
  // o reflexo da própria queda: o raio refletido passando perto do eixo da coluna (o centro da poça)
  if (vR > 0.0) {
    vec2 C = vWorldPos.xz - vRad * vR;
    vec2 o = vWorldPos.xz - C;
    vec2 rd = normalize(R.xz + vec2(1e-5));
    float tq = max(-dot(o, rd), 0.0);
    float dax = length(o + rd * tq);
    float up = R.y * tq / max(length(R.xz), 1e-3); // a altura em que o raio passa pelo eixo
    float colR = uCore * vR;
    float hit = exp(-dax * dax / max(colR * colR, 1.0)) * smoothstep(0.0, 4.0, up) * (0.6 + 0.4 * snoise(vec3(dax * 0.5, (up - uTime * 20.0) * 0.05, 1.0)));
    c += (uAmbient * 2.2 + uFogColorB * 3.0) * hit * 0.9 * fres * 3.0;
  }
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec3 L = uLightPos[i] - vWorldPos;
    float d = length(L);
    vec3 lc = uLightColor[i] * exp(-uFogDensity * d) / (1.0 + d * d * 0.02);
    c += lc * pow(max(dot(R, L / d), 0.0), 90.0) * 2.0 + lc * 0.002;
  }
  if (uFlashColor.r + uFlashColor.g + uFlashColor.b > 1e-4) {
    vec3 L = uFlashPos - vWorldPos;
    float d = length(L);
    c += min(uFlashColor * pow(max(dot(R, L / d), 0.0), 60.0) * 3.0 / (1.0 + d * d * 0.05), vec3(2.0));
  }
  // a queda clareia a água em volta dela (a luz que a coluna espalha), mais nas cristas das ondas
  if (vR > 0.0) c += (uAmbient * 2.2 + uFogColorB * 3.0) * 0.55 * exp(-rm / max(uCore * vR * 1.6, 1.0)) * (0.55 + 0.45 * ring);
  // a espuma no meio, onde a água bate: manchas claras que se desfazem para fora
  float fz = 1.0 - smoothstep(uCore * 0.6, uCore * 1.6, r);
  float fn = smoothstep(-0.1, 0.8, snoise(vec3(W.xz * 0.6, uTime * 0.8)) * 0.6 + snoise(vec3(W.xz * 2.1, uTime * 1.7)) * 0.4);
  c = mix(c, vec3(0.32, 0.33, 0.34) * (uAmbient * 2.0 + uFogColorB * 3.0 + 0.04), fz * fn * 0.85);
  c = applyFog(c, vWorldPos, 1.0, uFadeRange);
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createCascadeMaterial(shared, { fade = [1e9, 2e9] } = {}) {
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT },
    uniforms: { ...shared, uFadeRange: { value: new THREE.Vector2(fade[0], fade[1]) } },
    vertexShader: CASCADE_VERT,
    fragmentShader: CASCADE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
/** A espuma no pé da queda (o mesmo vértice da coluna: a borda ondula). */
export function createFoamMaterial(shared, { fade = [1e9, 2e9] } = {}) {
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT },
    uniforms: { ...shared, uFadeRange: { value: new THREE.Vector2(fade[0], fade[1]) } },
    vertexShader: CASCADE_VERT,
    fragmentShader: FOAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
/** A poça no pé da cascata: escura, espelhada, com as ondas e a espuma. */
export function createPoolMaterial(shared, { fade = [1e9, 2e9] } = {}) {
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT },
    uniforms: { ...shared, uFadeRange: { value: new THREE.Vector2(fade[0], fade[1]) }, uCore: { value: 0.3 } },
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
  });
}

// ─── Gotas e vapor ──────────────────────────────────────────────────────────

const DRIP_VERT = /* glsl */ `
uniform float uTime;
attribute vec3 aTop;
attribute float aLen;
attribute float aPhase;
attribute float aRate;
attribute float aEnd;
varying float vA;
void main() {
  float t = fract(uTime * aRate + aPhase);
  float fall = aLen * t * t;                  // cai acelerando
  float speed = 2.0 * aLen * t * aRate;       // m/s aproximado
  vec3 p = aTop - vec3(0.0, fall + aEnd * min(speed * 0.035, 2.5), 0.0);
  vA = (1.0 - aEnd * 0.8) * smoothstep(1.0, 0.9, t) * smoothstep(0.0, 0.05, t);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const DRIP_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor * vA, 1.0);
}
`;

export function createDripMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Vector3(0.22, 0.23, 0.25) } },
    vertexShader: DRIP_VERT,
    fragmentShader: DRIP_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const STEAM_VERT = /* glsl */ `
uniform float uTime;
attribute vec3 aOrigin;
attribute float aPhase;
attribute float aRate;
attribute float aHeight;
varying float vA;
void main() {
  float t = fract(uTime * aRate + aPhase);
  vec3 drift = vec3(sin(aPhase * 40.0 + t * 3.0), 0.0, cos(aPhase * 57.0 + t * 2.3)) * t * aHeight * 0.18;
  vec3 p = aOrigin + vec3(0.0, t * aHeight, 0.0) + drift;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = (40.0 + 260.0 * t) / max(-mv.z, 1.0);
  vA = sin(3.14159 * t) * (1.0 - t * 0.5);
  gl_Position = projectionMatrix * mv;
}
`;

const STEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vA * 0.18;
  gl_FragColor = vec4(uColor, a);
}
`;

export function createSteamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Vector3(0.1, 0.1, 0.1) } },
    vertexShader: STEAM_VERT,
    fragmentShader: STEAM_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

// ─── Céu / infinito ─────────────────────────────────────────────────────────

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // Só a rotação da view: o céu fica "no infinito", preso à câmera.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clip.xyww;   // profundidade = 1 (plano distante)
}
`;

const SKY_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
${FOG_GLSL}
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 rd = normalize(vDir);
  // Não há céu: só mais Cidade, perdida na poeira.
  vec3 c = applyFog(vec3(0.0), cameraPosition + rd * 6000.0, 1.0, vec2(1e9, 2e9));

  // luzes remotíssimas: janelas de estruturas que nunca serão alcançadas
  vec3 d = rd * 160.0;
  vec3 cell = floor(d);
  float h = hash13(cell);
  float spot = smoothstep(0.09, 0.0, length(fract(d) - 0.5)) * step(0.986, h);
  float thin = smoothstep(-0.2, 0.8, abs(rd.y));
  c += mix(vec3(1.0, 0.6, 0.3), vec3(0.7, 0.78, 0.74), step(0.5, fract(h * 17.0))) * spot * 0.05 * thin;

  // o disco: algo escuro e imenso atrás de tudo (a única coisa que não é construída)
  float ang = acos(clamp(dot(rd, uSunDir), -1.0, 1.0));
  float r = 0.16;
  float disk = smoothstep(r + 0.003, r - 0.003, ang);
  float halo = exp(-max(ang - r, 0.0) * 25.0) * (1.0 - disk);
  c = mix(c, c * 0.25, disk);
  c += vec3(0.5, 0.48, 0.44) * halo * 0.035;

  gl_FragColor = vec4(c, 1.0);
}
`;

export function createSkyMaterial(shared) {
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT },
    uniforms: {
      ...shared,
      uSunDir: { value: new THREE.Vector3(0.3, 0.86, -0.42).normalize() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

// ─── Poeira em suspensão ────────────────────────────────────────────────────

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform vec3 uCam;
uniform float uBox;
uniform vec3 uVel;      // velocidade do observador (m/s)
uniform float uStreak;  // duração do rastro (s): 0 parado, ~0,05 em queda livre
uniform vec2 uRes;      // tamanho do buffer de desenho (px)
uniform vec4 uAttract;  // o emissor carregando (app/beamfx.js): ponto (cena), força (< 0 empurra)
varying float vA;
varying vec2 vDir;      // direção do risco na tela
varying float vLen;     // comprimento do risco (fração do sprite)
varying float vBase;    // diâmetro do grão (fração do sprite)
void main() {
  // cada partícula vive numa caixa que "dá a volta" em torno da câmera
  float fallSpeed = 0.12;
  vec3 p = position + vec3(sin(uTime * 0.07 + position.y) * 1.5, -uTime * fallSpeed * 1.5, cos(uTime * 0.05 + position.x) * 1.5);
  p = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  // o emissor dobra o espaço: a poeira perto escorre para o ponto de atração (cada grão
  // num ciclo próprio — chega, some, recomeça de fora)
  if (abs(uAttract.w) > 1e-3) {
    vec3 d = uAttract.xyz - p;
    float L = length(d);
    float ph = fract(uTime * 0.9 + fract(position.x * 12.9898 + position.z * 78.233));
    float pull = abs(uAttract.w) * exp(-L * L / 36.0);
    p += d * min(0.92, pull * (uAttract.w > 0.0 ? ph : 1.0 - ph * 0.5) * sign(uAttract.w) * 1.1);
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float base = uSize * 60.0 / max(dist, 0.5);
  vA = smoothstep(uBox * 0.5, uBox * 0.15, dist) * smoothstep(0.3, 1.5, dist);
  vec4 clip = projectionMatrix * mv;
  // em alta velocidade o grão vira um risco: onde ele estava há uStreak segundos
  // (relativo ao observador) — a névoa "passa rasgando"
  vec2 dpx = vec2(0.0);
  if (uStreak > 0.0) {
    vec4 clip2 = projectionMatrix * viewMatrix * vec4(p + uVel * uStreak, 1.0);
    if (clip2.w > 0.1 && clip.w > 0.1) dpx = (clip2.xy / clip2.w - clip.xy / clip.w) * 0.5 * uRes;
  }
  float len = min(length(dpx), 90.0);
  gl_PointSize = base + len;
  vDir = len > 0.01 ? normalize(dpx) : vec2(1.0, 0.0);
  vLen = len / (base + len);
  vBase = base / (base + len);
  vA *= sqrt(vBase); // a mesma poeira espalhada num risco: mais tênue
  gl_Position = clip;
}
`;

const DUST_FRAG = /* glsl */ `
varying float vA;
varying vec2 vDir;
varying float vLen;
varying float vBase;
void main() {
  // distância ao segmento central do sprite (um ponto quando parado)
  vec2 q = gl_PointCoord - 0.5;
  q.y = -q.y;
  float t = clamp(dot(q, vDir), -vLen * 0.5, vLen * 0.5);
  float d = length(q - vDir * t) / max(vBase, 1e-3);
  float a = smoothstep(0.5, 0.0, d) * vA;
  gl_FragColor = vec4(vec3(0.45, 0.44, 0.42) * a * 0.06, 1.0);
}
`;

/** Nuvem de poeira que acompanha a câmera (dá escala e "ar" ao espaço). */
export function createDust(count = 1800, box = 50) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * box;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 0.22 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: box },
      uVel: { value: new THREE.Vector3() },
      uStreak: { value: 0 },
      uRes: { value: new THREE.Vector2(1920, 1080) },
      uAttract: { value: new THREE.Vector4() },
    },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 10;
  return points;
}
