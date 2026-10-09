// ─────────────────────────────────────────────────────────────────────────────
//  Corpos em MALHA CONTÍNUA (o rework gráfico, segunda rodada — o cofre, Rework-grafico).
//
//  O usuário (2026-10-09): os seres "parecem simplesmente variações do boneco de teste" — cilindros de
//  6 lados pregados num esqueleto. Agora o corpo é UMA superfície: descrito por formas simples presas aos
//  ossos (cápsulas que afinam, elipsoides), fundidas umas nas outras por uma união suave (os músculos
//  correm de uma para a outra, as juntas engrossam), entalhadas por subtrações (costelas, a máscara). A
//  superfície sai de um campo de distância (SDF) por "surface nets" numa grade, e cada vértice é preso
//  aos ossos das formas mais perto dele (pesos suaves: o joelho dobra com a coxa e a canela juntas).
//
//  Tudo pela forma (sem textura nova): o mesmo esqueleto e a mesma animação de world/bodies.js — os
//  ossos são os Bones dele; a malha é uma THREE.SkinnedMesh com os materiais do mundo (com o desenho
//  preso ao corpo — movingMaterial — e o skinning no vertex shader, shaders/materials.js).
//
//  Custo: ~20–40 ms por malha (grade de ~2 cm) → as malhas ficam num cache pela receita (cada tipo tem
//  poucas variantes de corpo; a variedade por indivíduo vem das peças rígidas, do tamanho e da pose).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { meshArrays } from './fleshMesh.js';

const _v = new THREE.Vector3();

/**
 * O construtor de uma camada (pele, roupa…): as formas, em coordenadas do corpo (o grupo, na pose de
 * repouso), cada uma presa a um osso. Os pontos se dão no espaço do osso e são levados ao do corpo.
 */
export class FleshLayer {
  /**
   * bones: [Bone] — o índice é o do esqueleto. chains: para cada osso, a cadeia dele (0 o tronco; cada
   * braço e cada perna a sua). Dentro de uma cadeia as formas se fundem com a suavidade de cada uma;
   * entre cadeias, quase nada (JOIN) — o braço não gruda nas costelas, as coxas não grudam uma na outra.
   */
  constructor(bones, chains = null) {
    this.bones = bones;
    this.chains = chains ?? bones.map(() => 0);
    /** @type {any[]} */
    this.prims = [];
  }
  _toBody(bone, p) {
    _v.set(p[0], p[1], p[2]);
    return bone.localToWorld(_v).toArray(); // (o grupo do corpo está na origem durante a montagem)
  }
  _push(P) {
    P.ch = this.chains[P.bi];
    this.prims.push(P);
  }
  _bi(bone) {
    const i = this.bones.indexOf(bone);
    if (i < 0) throw new Error('flesh: osso fora do esqueleto');
    return i;
  }
  /** Uma cápsula que afina de a (raio ra) até b (raio rb). k: a suavidade da união com o resto. */
  cone(bone, a, b, ra, rb, k = 0.04) {
    this._push({ t: 0, bi: this._bi(bone), a: this._toBody(bone, a), b: this._toBody(bone, b), ra, rb, k, sub: false });
    return this;
  }
  /** Um elipsoide de centro c e semieixos r (no espaço do osso — sem giro). */
  blob(bone, c, r, k = 0.04) {
    this._push({ t: 1, bi: this._bi(bone), a: this._toBody(bone, c), r, k, sub: false });
    return this;
  }
  /** Tira (entalha) uma cápsula: costelas, sulcos, a órbita da máscara. */
  carve(bone, a, b, ra, rb, k = 0.015) {
    this.prims.push({ t: 0, bi: this._bi(bone), a: this._toBody(bone, a), b: this._toBody(bone, b), ra, rb, k, sub: true });
    return this;
  }
  /** Tira um elipsoide. */
  carveBlob(bone, c, r, k = 0.015) {
    this.prims.push({ t: 1, bi: this._bi(bone), a: this._toBody(bone, c), r, k, sub: true });
    return this;
  }
  /** Corta tudo de um lado de um plano (n · p > d some): a barra do casaco, a boca do capuz. */
  cut(bone, point, normal, k = 0.01) {
    const p = this._toBody(bone, point);
    const n = new THREE.Vector3(...normal).transformDirection(bone.matrixWorld).toArray();
    this.prims.push({ t: 2, bi: this._bi(bone), a: p, n, k, sub: true });
    return this;
  }
}

/** As arrays da malha → a geometria (os atributos do skinning). */
function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.sIdx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(m.sW, 4));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius *= 1.35; // (a pose muda o corpo — o golpe estica o braço)
  g.userData.shared = true;
  return g;
}

// ── os workers (dois): a malha sai fora do quadro; o corpo aparece quando todas as camadas chegam ──
const _workers = [];
let _next = 0;
let _seq = 0;
const _wait = new Map();
function worker() {
  if (!_workers.length && typeof Worker !== 'undefined') {
    for (let i = 0; i < 2; i++) {
      const w = new Worker(new URL('./fleshWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const r = _wait.get(e.data.id);
        _wait.delete(e.data.id);
        r?.(e.data.mesh);
      };
      _workers.push(w);
    }
  }
  return _workers.length ? _workers[_next++ % _workers.length] : null;
}
/** Só os números das formas (o que o worker precisa). */
function plain(prims) {
  return prims.map((P) => ({ t: P.t, bi: P.bi, ch: P.ch, a: P.a, b: P.b, ra: P.ra, rb: P.rb, r: P.r, n: P.n, k: P.k, sub: P.sub }));
}

/** O cache das malhas (a mesma receita, a mesma geometria — compartilhada entre os corpos): key → Promise. */
const _cache = new Map();
/**
 * A geometria de uma camada, pela chave: na primeira vez o worker a monta (make() descreve as formas).
 * → Promise<BufferGeometry>
 */
export function layerGeometry(key, make, cell) {
  let p = _cache.get(key);
  if (!p) {
    const layer = make();
    const w = worker();
    const nb = layer.bones.length;
    if (w) {
      const id = ++_seq;
      p = new Promise((res) => _wait.set(id, res)).then(toGeometry);
      w.postMessage({ id, prims: plain(layer.prims), nb, cell });
    } else p = Promise.resolve(toGeometry(meshArrays(layer.prims, nb, cell)));
    _cache.set(key, p);
  }
  return p;
}
/** Uma SkinnedMesh da camada, presa ao esqueleto `skeleton` (os ossos na pose de repouso agora). */
export function skinned(geo, mat, skeleton) {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.bind(skeleton, new THREE.Matrix4());
  m.userData.noCollide = true;
  return m;
}
