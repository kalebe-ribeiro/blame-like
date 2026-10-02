// ─────────────────────────────────────────────────────────────────────────────
//  Os buracos que o emissor de feixe gravitacional (a arma de Killy) deixa —
//  o método "de shader" decidido (ver o cofre, Arma-do-Killy):
//
//    • cada tiro guarda um CILINDRO (a → b, raio r), em coordenadas GLOBAIS;
//    • os shaders das superfícies descartam o que está dentro dele e escurecem
//      a borda (fundida) — um furo redondo e limpo em tudo o que o feixe passou;
//    • a colisão (world/collision.js) ignora o que está dentro: dá para passar.
//    • MAS nunca dentro das camadas intransponíveis nem das estruturas únicas
//      (as "caixas guardadas", KEEP_MAX perto): um feixe largo rente a uma camada
//      não abre o piso dela, nem morde a parede de uma única.
//
//  Os mais perto da câmera (até MAX) vão para os shaders a cada quadro. Os
//  buracos ficam no mundo salvo (slot.holes — app/beam.js), até LIMIT.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const HOLE_MAX = 12; // no shader (tem de bater com HOLE_N em shaders/chunks.js)
const KEEP_MAX = 6; // caixas guardadas no shader (uKeepMin/uKeepMax)
const BIG = 1e7;
const LIMIT = 200; // guardados no mundo
const _v = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _p = new THREE.Vector3(); // (o ponto consultado: nunca o mesmo vetor que dist() usa por dentro)

export class HoleSystem {
  constructor(shared) {
    this.shared = shared;
    this.list = []; // { a: Vector3, b: Vector3, r } GLOBAIS
    this.near = []; // os enviados ao shader neste quadro (cena)
    this.keep = []; // { mn: Vector3, mx: Vector3 } GLOBAIS — o que o feixe não fura
    this._keepAt = null;
  }

  /** As caixas guardadas perto de g (GLOBAL): as faixas das camadas e as únicas. */
  _refreshKeep(F, g) {
    if (this._keepAt && this._keepAt.distanceTo(g) < 30) return;
    this._keepAt = g.clone();
    const keep = [];
    for (const b of F.barriersNear(g.y)) keep.push({ d: Math.abs(g.y - (b.top + b.bottom) / 2), mn: new THREE.Vector3(-BIG, b.bottom - 0.15, -BIG), mx: new THREE.Vector3(BIG, b.top + 0.15, BIG) });
    for (const u of F.uniquesNear(g.x, g.y, g.z, 500)) {
      const top = u.y + u.h + (u.kind === 'antenna' ? 130 : 6);
      keep.push({ d: Math.hypot(u.x - g.x, u.z - g.z), mn: new THREE.Vector3(u.x - u.hx - 0.3, u.y - 2, u.z - u.hz - 0.3), mx: new THREE.Vector3(u.x + u.hx + 0.3, top, u.z + u.hz + 0.3) });
    }
    keep.sort((x, y) => x.d - y.d);
    this.keep = keep.slice(0, KEEP_MAX);
  }

  _kept(gp) {
    for (const k of this.keep) if (gp.x > k.mn.x && gp.y > k.mn.y && gp.z > k.mn.z && gp.x < k.mx.x && gp.y < k.mx.y && gp.z < k.mx.z) return true;
    return false;
  }

  load(arr) {
    this._keepAt = null;
    this.list = (arr ?? []).map((h) => ({ a: new THREE.Vector3(...h.a), b: new THREE.Vector3(...h.b), r: h.r }));
  }

  serialize() {
    const q = (v) => [v.x, v.y, v.z].map((x) => Math.round(x * 100) / 100);
    return this.list.map((h) => ({ a: q(h.a), b: q(h.b), r: h.r }));
  }

  add(a, b, r) {
    this._keepAt = null;
    this.list.push({ a: a.clone(), b: b.clone(), r });
    if (this.list.length > LIMIT) this.list.shift();
  }

  /** Distância de um ponto (GLOBAL) ao segmento de um buraco; t: onde, ao longo dele (0..1). */
  static dist(h, p) {
    _ab.subVectors(h.b, h.a);
    const L2 = _ab.lengthSq() || 1;
    const t = _v.subVectors(p, h.a).dot(_ab) / L2;
    if (t < 0 || t > 1) return { d: Infinity, t };
    _v.copy(h.a).addScaledVector(_ab, t);
    return { d: _v.distanceTo(p), t };
  }

  /** O ponto (CENA) está dentro de algum buraco perto? (a colisão passa por ele) */
  insideScene(p, origin) {
    if (!this.near.length) return false;
    _p.copy(p).add(origin);
    if (this._kept(_p)) return false;
    for (const h of this.near) if (HoleSystem.dist(h, _p).d < h.r) return true;
    return false;
  }

  update(g, origin, F) {
    if (F && this.list.length) this._refreshKeep(F, g);
    const KA = this.shared.uKeepMin.value;
    const KB = this.shared.uKeepMax.value;
    for (let i = 0; i < KEEP_MAX; i++) {
      const k = this.keep[i];
      if (!k) KA[i].set(0, 0, 0, 0);
      else {
        KA[i].set(k.mn.x - origin.x, k.mn.y - origin.y, k.mn.z - origin.z, 1);
        KB[i].set(k.mx.x - origin.x, k.mx.y - origin.y, k.mx.z - origin.z);
      }
    }
    // os mais perto do observador (pela distância ao segmento, ou às pontas)
    const scored = this.list.map((h) => {
      const { d } = HoleSystem.dist(h, g);
      return { h, d: Math.min(d, h.a.distanceTo(g), h.b.distanceTo(g)) };
    });
    scored.sort((x, y) => x.d - y.d);
    this.near = scored.slice(0, HOLE_MAX).filter((s) => s.d < 800).map((s) => s.h);
    const A = this.shared.uHoleA.value;
    const B = this.shared.uHoleB.value;
    for (let i = 0; i < HOLE_MAX; i++) {
      const h = this.near[i];
      if (!h) {
        A[i].set(0, 0, 0, 0);
        B[i].set(0, 0, 0, 0);
        continue;
      }
      A[i].set(h.a.x - origin.x, h.a.y - origin.y, h.a.z - origin.z, h.r);
      B[i].set(h.b.x - origin.x, h.b.y - origin.y, h.b.z - origin.z, 1);
    }
  }
}
