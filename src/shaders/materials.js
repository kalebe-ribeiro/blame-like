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

#include <clipping_planes_pars_vertex>
#include <batching_pars_vertex>

void main() {
  vec3 p = position;
  vec3 n = normal;
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
  #else
    vPatPos = wp.xyz + uOriginMod;   // posição "global": os padrões contínuos na origem flutuante
    vPatN = vNormalW;
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

#include <clipping_planes_pars_fragment>

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

  float tone = hash12(cell + uSeed * 3.1);
  float mott = fbmAA(P, length(fwidth(P)));
  // escorrimentos: ruído esticado na vertical (chuva, óleo, séculos)
  float streak = snoise(vec3(W.x * 0.3, W.y * 0.01, W.z * 0.3) + uSeed);
  float stain = smoothstep(0.05, 0.85, streak) * uStreaks * (onY ? 0.3 : 1.0);
  float rust = smoothstep(0.25, 0.75, snoise(W * uNoiseScale * 0.6 + 5.0)) * uAccent;

  vec3 concrete = uBaseColor * (0.7 + 0.34 * tone + 0.22 * mott);
  concrete = mix(concrete, uAccentColor, rust * 0.85);
  concrete *= 1.0 - stain * 0.55;
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
  }

  // ── iluminação ──
  // luz difusa vinda de cima: o que olha para baixo mergulha no escuro
  vec3 lit = uAmbient * (0.3 + 0.7 * (N.y * 0.5 + 0.5)) * (0.8 + 0.4 * mott);
  vec3 spec = vec3(0.0);
  float gloss = mix(10.0, 400.0, uWet);
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec3 Lv = uLightPos[i] - vWorldPos;
    float d2 = dot(Lv, Lv);
    float d = sqrt(d2);
    vec3 L = Lv / d;
    float att = exp(-uFogDensity * d) / (1.0 + d2);
    vec3 lc = uLightColor[i] * att;
    if (lc.r + lc.g + lc.b < 1e-5) continue; // não contribui: pula o especular
    float ndl = max(dot(N, L), 0.0);
    lit += lc * ndl;
    vec3 H = normalize(L + V);
    spec += lc * pow(max(dot(N, H), 0.0), gloss);
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
  vec3 c = albedo * lit + spec * (0.08 + 3.0 * uWet) + emit;
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
    side: THREE.FrontSide,
    ...params,
  };
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT, ...(p.cutout ? { USE_CUTOUT: 1 } : {}), ...(p.reflect ? { USE_REFLECTION: 1 } : {}), ...(p.heat ? { USE_HEAT: 1 } : {}) },
    uniforms: {
      ...shared,
      uBaseColor: { value: p.base },
      uAccentColor: { value: p.accent },
      uAccent: { value: p.accentAmount },
      uPanel: { value: p.panel },
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
//  Tubo aberto ao longo da queda (gen/cascades.js); "ao longo" em normal.y.
//  Fios d'água escorrendo (ruído esticado na vertical, descendo rápido),
//  mais densos no miolo, iluminados pelas lâmpadas próximas (a água é
//  translúcida: acende sem depender da normal). Perto do fim a coluna se
//  desfaz em névoa — nas que caem numa poça, "ao longo" nunca chega lá.

const CASCADE_FRAG = /* glsl */ `
${SHARED_UNIFORMS_GLSL}
${NOISE_GLSL}
${FOG_GLSL}
uniform vec2 uFadeRange;
uniform vec3 uAmbient;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vAlong;
void main() {
  vec3 V = cameraPosition - vWorldPos;
  float dist = length(V);
  V /= dist;
  vec3 n = normalize(vec3(vN.x, 0.0, vN.z));
  vec3 vh = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5));
  float core = pow(abs(dot(n, vh)), 1.5);
  float along = clamp(vAlong, 0.0, 1.0);
  vec3 W = vWorldPos + uOriginMod;
  // fios d'água: ruído esticado na vertical, descendo
  float ang = atan(n.z, n.x);
  float s1 = snoise(vec3(ang * 2.0, (W.y + uTime * 24.0) * 0.03, 0.3));
  float s2 = snoise(vec3(ang * 6.0, (W.y + uTime * 31.0) * 0.11, 4.1));
  float streak = smoothstep(-0.35, 0.75, s1) * (0.7 + 0.3 * s2);
  float mist = smoothstep(0.62, 1.0, along); // fim da queda: a água vira névoa
  float alpha = (0.18 + 0.62 * streak) * mix(0.35, 1.0, core);
  alpha *= smoothstep(0.0, 0.004, along) * (1.0 - mist);
  // luz: um pouco de ambiente, a poeira iluminada e as lâmpadas próximas
  vec3 c = uAmbient * 2.2 + uFogColorB * 3.0;
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec3 L = uLightPos[i] - vWorldPos;
    float d2 = dot(L, L);
    c += uLightColor[i] * (0.6 + 0.8 * streak) / (1.0 + d2) * exp(-uFogDensity * sqrt(d2));
  }
  c = applyFog(c, vWorldPos, 1.0, uFadeRange);
  float far = 1.0 - smoothstep(uFadeRange.x, uFadeRange.y, dist);
  gl_FragColor = vec4(c, alpha * far);
}
`;

export function createCascadeMaterial(shared, { fade = [1e9, 2e9] } = {}) {
  return new THREE.ShaderMaterial({
    defines: { LIGHT_COUNT },
    uniforms: { ...shared, uFadeRange: { value: new THREE.Vector2(fade[0], fade[1]) } },
    vertexShader: BEAM_VERT,
    fragmentShader: CASCADE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
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
