// ─────────────────────────────────────────────────────────────────────────────
//  Silhuetas colossais: estruturas a 7–45 km, vistas só como sombras mais
//  escuras dentro da poeira. Nunca podem ser alcançadas — ao se aproximar
//  (< ~7 km) elas se dissolvem na névoa, e o mundo real (carregado até ~4 km)
//  assume. São determinísticas (seed + célula): voltar a um lugar mostra as
//  mesmas silhuetas no mesmo lugar.
//
//  Tipos: torres infinitas (atravessam tudo, de baixo a cima), lajes de
//  quilômetros suspensas em faixas de altura, vigas-ponte de dezenas de km.
//
//  Desenho: uma única InstancedMesh de caixas subdivididas. O vertex shader
//  traz cada vértice, ao longo do próprio raio, para 6–9 km da câmera (dentro
//  do plano "far") com uma função monótona da distância real — a direção (o que
//  a projeção vê) fica exata e a ordem de profundidade entre elas se mantém.
//  Elas não entram na cena: são desenhadas numa MÁSCARA de meia resolução, e o
//  cálculo de névoa de todos os materiais (shaders/chunks.js → applyFog)
//  escurece a cor da névoa onde a máscara indica uma sombra atrás. Assim o céu,
//  a geometria distante já dissolvida na névoa e as silhuetas concordam — sem
//  recortes onde uma estrutura real (invisível de tão longe) passa na frente.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash4 } from '../gen/hash.js';

const CELL = 5000; // grade horizontal (m)
const BAND = 7000; // grade vertical das lajes e vigas (m)
const RADIUS = 45000; // até onde existem
const NEAR = 7000; // mais perto que isso, não (o mundo real está lá)
const TOWER_SPAN = 60000; // torres: altura total (sempre maior que a vista)
const MAX = 900;
const REBUILD_AT = 1500; // reconstrói quando o observador anda isto

const VERT = /* glsl */ `
varying vec3 vDir;
varying float vDist;
varying vec3 vW;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 rel = wp.xyz - cameraPosition;
  float d = length(rel);
  vDir = rel / d;
  vDist = d;
  vW = wp.xyz;
  vN = normalize(mat3(instanceMatrix) * normal);
  // distância comprimida: 6 km + até 3 km, monótona (preserva a ordem)
  float s = 6000.0 + 3000.0 * (1.0 - exp(-max(d - 6000.0, 0.0) / 15000.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + vDir * s, 1.0);
}
`;

// A máscara: 1 = névoa livre; menor = sombra de algo colossal atrás da névoa.
// Mais escura quanto mais perto (perspectiva aérea); some ao se aproximar.
const FRAG = /* glsl */ `
varying vec3 vDir;
varying float vDist;
varying vec3 vW;
varying vec3 vN;
void main() {
  float far = smoothstep(${NEAR.toFixed(1)}, 42000.0, vDist);
  float shade = mix(0.42, 0.86, far);
  float fade = smoothstep(${(NEAR - 500).toFixed(1)}, ${(NEAR + 2500).toFixed(1)}, vDist) * (1.0 - smoothstep(38000.0, 45000.0, vDist));
  float side = 0.94 + 0.06 * abs(vN.x) - 0.04 * abs(vN.z); // volume, não recorte
  gl_FragColor = vec4(vec3(mix(1.0, shade * side, fade)), 1.0);
}
`;

export class SilhouetteSystem {
  constructor(parent, shared, seed) {
    this.seed = seed;
    this.center = null; // centro GLOBAL da última construção
    const geo = new THREE.BoxGeometry(1, 1, 1, 4, 16, 4);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.FrontSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'silhuetas';
    this.mesh.layers.set(1); // fora da cena principal: só entra na máscara
    parent.add(this.mesh);
    // máscara em meia resolução, lida pela névoa de todos os materiais
    this.shared = shared;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, format: THREE.RedFormat });
    shared.uSilMask.value = this.rt.texture;
    shared.uSilOn.value = 1;
    this._layers = new THREE.Layers();
  }

  /** Tamanho da tela em pixels (o da cena). */
  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    this.shared.uSilRes.value.set(w, h);
  }

  /** Desenha a máscara (antes da cena). */
  renderMask(renderer, camera) {
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    this._layers.mask = camera.layers.mask;
    camera.layers.set(1);
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(this.mesh, camera);
    camera.layers.mask = this._layers.mask;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  /** @param {THREE.Vector3} g posição GLOBAL do observador */
  update(g, origin) {
    if (!this.center || this.center.distanceTo(g) > REBUILD_AT) this._build(g);
    this.mesh.position.set(this.center.x - origin.x, this.center.y - origin.y, this.center.z - origin.z);
    this.mesh.updateMatrixWorld();
  }

  _build(g) {
    this.center = g.clone();
    const seed = this.seed;
    const m = new THREE.Matrix4();
    let n = 0;
    const put = (x, y, z, sx, sy, sz) => {
      if (n >= MAX) return;
      // nada que chegue perto do mundo real
      const dx = Math.max(Math.abs(x - g.x) - sx / 2, 0);
      const dy = Math.max(Math.abs(y - g.y) - sy / 2, 0);
      const dz = Math.max(Math.abs(z - g.z) - sz / 2, 0);
      if (Math.hypot(dx, dy, dz) < NEAR) return;
      m.makeScale(sx, sy, sz).setPosition(x - g.x, y - g.y, z - g.z);
      this.mesh.setMatrixAt(n++, m);
    };
    const R = Math.ceil(RADIUS / CELL);
    const ci = Math.floor(g.x / CELL);
    const ck = Math.floor(g.z / CELL);
    const b0 = Math.round(g.y / BAND);
    for (let i = ci - R; i <= ci + R; i++) {
      for (let k = ck - R; k <= ck + R; k++) {
        const cx = (i + 0.5) * CELL;
        const cz = (k + 0.5) * CELL;
        if (Math.hypot(cx - g.x, cz - g.z) > RADIUS) continue;
        const h = hash4(seed, i, 0, k, 900);
        const r = (s) => hash4(seed, i, s, k, 901);
        // torres infinitas (às vezes em grupo)
        if (h < 0.2) {
          const count = r(1) < 0.3 ? 2 + Math.floor(r(2) * 3) : 1;
          for (let q = 0; q < count; q++) {
            const w = 250 + r(10 + q) * (count > 1 ? 500 : 1500);
            const d = w * (0.6 + r(20 + q) * 0.9);
            put(cx + (r(30 + q) - 0.5) * CELL * 0.6, g.y, cz + (r(40 + q) - 0.5) * CELL * 0.6, w, TOWER_SPAN, d);
          }
        }
        // lajes e vigas nas faixas de altura
        for (let b = b0 - 3; b <= b0 + 3; b++) {
          const hb = hash4(seed, i, b, k, 902);
          const y = b * BAND + (hash4(seed, i, b, k, 903) - 0.5) * 3000;
          if (hb < 0.03) {
            const sx = 3000 + hash4(seed, i, b, k, 904) * 9000;
            const sz = 3000 + hash4(seed, i, b, k, 905) * 9000;
            put(cx, y, cz, sx, 150 + hash4(seed, i, b, k, 906) * 450, sz);
          } else if (hb < 0.055) {
            const len = 8000 + hash4(seed, i, b, k, 907) * 22000;
            const t = 120 + hash4(seed, i, b, k, 908) * 380;
            if (hash4(seed, i, b, k, 909) < 0.5) put(cx, y, cz, len, t, t * 1.4);
            else put(cx, y, cz, t * 1.4, t, len);
          }
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.rt.dispose();
    this.shared.uSilOn.value = 0;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
