// ─────────────────────────────────────────────────────────────────────────────
//  Sombras das lâmpadas (o rework gráfico, frente 2 — luz e atmosfera; o cofre, Rework-grafico).
//
//  Poucas sombras reais (decisão do usuário, 2026-10-09): as SHADOW_COUNT lâmpadas que mais iluminam
//  perto da câmera ganham um mapa de sombra; as outras continuam sem (a luz rebatida e o SSAO dão o resto).
//  As luminárias da Cidade iluminam para BAIXO (a carcaça escura em cima, a lente embaixo — gen/chunkgen.js
//  lamp): cada mapa é uma câmera em perspectiva de 150° olhando para baixo, com a DISTÂNCIA até a luz num
//  alvo half float. O que fica acima da lâmpada não tem sombra (não é visto pela câmera do mapa).
//  Um mapa refeito a cada dois quadros, em rodízio (as lâmpadas não andam; o que anda — seres, vagões — tem a sombra
//  com um quadro ou dois de atraso). Cada mapa tem a sua vista nos lotes (world/batches.js batchView).
//  O shader de superfície (shaders/materials.js shadowFor) compara a distância do ponto com a do mapa.
//  Só a geometria do mundo projeta (as páginas de lotes, na camada SHADOW_LAYER): desenhar também os
//  seres e os objetos soltos custava ~25 ms de CPU na vila (cada um uma chamada de desenho a mais).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const SHADOW_COUNT = 3;
export const SHADOW_LAYER = 2; // (a 1 é a das silhuetas)
const SIZE = 512;
const FAR = 70; // m: além disso a lâmpada já quase não ilumina (1/d² e a névoa)
const FOV = 150;

const DEPTH_VERT = /* glsl */ `
varying vec3 vW;
#include <batching_pars_vertex>
void main() {
  vec3 p = position;
  #ifdef USE_INSTANCING
    p = (instanceMatrix * vec4(p, 1.0)).xyz;
  #endif
  #include <batching_vertex>
  #ifdef USE_BATCHING
    p = (batchingMatrix * vec4(p, 1.0)).xyz;
  #endif
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DEPTH_FRAG = /* glsl */ `
uniform vec3 uLightP;
varying vec3 vW;
void main() {
  gl_FragColor = vec4(length(vW - uLightP), 0.0, 0.0, 1.0);
}
`;

/** Os uniforms compartilhados das sombras (shaders/materials.js createSharedUniforms os inclui). */
export function shadowUniforms() {
  return {
    uShadowMap0: { value: null },
    uShadowMap1: { value: null },
    uShadowMap2: { value: null },
    uShadowIdx: { value: [-1, -1, -1] }, // o índice da luz (uLightPos) de cada mapa; -1 = nenhum
    uShadowVP: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
  };
}

export class ShadowSystem {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} shared  os uniforms compartilhados (com shadowUniforms())
   */
  constructor(renderer, shared) {
    this.renderer = renderer;
    this.shared = shared;
    this.enabled = true;
    this.rts = [];
    this.cams = [];
    this.lightIdx = new Array(SHADOW_COUNT).fill(-1);
    this.next = 0;
    for (let j = 0; j < SHADOW_COUNT; j++) {
      const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      rt.texture.generateMipmaps = false;
      this.rts.push(rt);
      shared[`uShadowMap${j}`].value = rt.texture;
      // (perto de 0,5 m: a carcaça da própria luminária — ou a peça que a segura — não tampa a luz)
      const cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, FAR);
      cam.userData.batchView = 2 + j; // (a lista de recorte própria em cada página de lotes)
      cam.layers.set(SHADOW_LAYER);
      this.cams.push(cam);
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VERT,
      fragmentShader: DEPTH_FRAG,
      uniforms: { uLightP: { value: new THREE.Vector3() } },
      side: THREE.DoubleSide,
    });
    this.clearColor = new THREE.Color(1e4, 0, 0);
  }

  /**
   * Escolhe as lâmpadas e refaz um mapa (o rodízio). Chamado antes da cena (app/render.js renderViews).
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera  a câmera principal
   * @param {number} firstSlot     o primeiro índice de uLightPos que é lâmpada (os fixos — a lanterna, os
   *                               clarões distantes — ficam antes e não têm sombra)
   * @param {THREE.Object3D[]} pages  as páginas de lotes (BatchedMesh) que projetam — as outras saem da camada
   */
  update(scene, camera, firstSlot, pages) {
    const S = this.shared;
    if (!this.enabled) {
      S.uShadowIdx.value.fill(-1);
      return;
    }
    // 1) as lâmpadas que mais iluminam perto da câmera (a força que chega a ela)
    const P = S.uLightPos.value;
    const C = S.uLightColor.value;
    const cand = [];
    for (let i = firstSlot; i < P.length; i++) {
      const c = C[i];
      const lum = c.x + c.y + c.z;
      if (lum < 1e-3) continue;
      const d2 = P[i].distanceToSquared(camera.position);
      if (d2 > FAR * FAR * 0.6) continue;
      cand.push({ i, score: lum / (d2 + 9) });
    }
    cand.sort((a, b) => b.score - a.score);
    const want = new Set(cand.slice(0, SHADOW_COUNT).map((c) => c.i));
    // (estável: quem continua escolhido fica no mesmo mapa)
    const fresh = [];
    for (let j = 0; j < SHADOW_COUNT; j++) {
      if (this.lightIdx[j] >= 0 && want.has(this.lightIdx[j])) want.delete(this.lightIdx[j]);
      else {
        this.lightIdx[j] = -1;
        fresh.push(j);
      }
    }
    for (const i of want) {
      const j = fresh.shift();
      if (j === undefined) break;
      this.lightIdx[j] = i;
      this._render(j, scene); // (o mapa novo já neste quadro)
    }
    // 2) o rodízio: um mapa a cada dois quadros (as lâmpadas não andam; na vila, um por quadro custava ~2 ms)
    this.tick = (this.tick ?? 0) + 1;
    for (let k = 0; k < SHADOW_COUNT && this.tick % 2 === 0; k++) {
      const j = (this.next + k) % SHADOW_COUNT;
      if (this.lightIdx[j] < 0) continue;
      this.next = (j + 1) % SHADOW_COUNT;
      this._render(j, scene);
      break;
    }
    for (let j = 0; j < SHADOW_COUNT; j++) S.uShadowIdx.value[j] = this.lightIdx[j];
  }

  /** As páginas de lotes que projetam ficam na camada das sombras; as outras saem dela. */
  static layerPages(pages, casts) {
    for (const p of pages) {
      if (casts(p.material)) p.layers.enable(SHADOW_LAYER);
      else p.layers.disable(SHADOW_LAYER);
    }
  }

  _render(j, scene) {
    const r = this.renderer;
    const S = this.shared;
    const i = this.lightIdx[j];
    const pos = S.uLightPos.value[i];
    const cam = this.cams[j];
    cam.position.copy(pos);
    cam.up.set(0, 0, 1);
    cam.lookAt(pos.x, pos.y - 1, pos.z);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    S.uShadowVP.value[j].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.mat.uniforms.uLightP.value.copy(pos);
    const prevRT = r.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.mat;
    r.autoClear = true;
    r.setClearColor(this.clearColor, 1);
    r.setRenderTarget(this.rts[j]);
    r.render(scene, cam);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.fog = prevFog;
  }

  dispose() {
    for (const rt of this.rts) rt.dispose();
    this.mat.dispose();
  }
}
