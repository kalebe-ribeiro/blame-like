// ─────────────────────────────────────────────────────────────────────────────
//  O emissor nas estruturas ATIVAS (pedido do usuário, 2026-10-04): os colossos, os vagões, os carros
//  dos elevadores, o pórtico dos Construtores. O corte é de verdade (o mesmo CSG da geração — gen/cut.js
//  cutPiece), na geometria do PRÓPRIO objeto, nas coordenadas dele: o furo anda junto, as faces novas
//  em brasa (o material 'cut'). A máquina continua funcionando cortada, a menos que:
//    · um corte atinja um PONTO ESSENCIAL dela (o motor, os truques, o núcleo, as pernas…), ou
//    · a resistência dela acabe — cada corte que pega gasta uma parte (mais com o furo maior): uma
//      "barra de vida" própria; depois de vários cortes, ela se desfaz.
//  Então ela PARA (cada sistema decide o que é parar — onDead). Os cortes, a resistência e o fim ficam no
//  mundo salvo (worldState 'dyn:<id>') e são refeitos quando o objeto volta a existir perto.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as CSGLIB from '../lib/three-bvh-csg.js';
import { cutPiece, setCSG } from '../gen/cut.js';
import { movingMaterial } from '../shaders/materials.js';

setCSG(CSGLIB); // (aqui, no jogo: os workers têm a sua cópia)

/** O quanto um corte de raio r gasta da resistência (0..1): ~3–6 tiros cheios; o colapso, de uma vez. */
export function wearOf(r) {
  return Math.min(1, 0.12 + 0.06 * r);
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Distância de p ao segmento ab. */
function segPoint(p, a, b) {
  const ab = _c.copy(b).sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

export class DynamicCuts {
  constructor(world) {
    this.world = world;
    /** id → { id, root, meshes, essential, onDead, st } */
    this.objs = new Map();
    this.stats = { cuts: 0, essential: 0, worn: 0 };
  }

  _key(id) {
    return `dyn:${id}`;
  }

  _state(id) {
    const ws = this.world.worldState;
    const saved = ws?.get(this._key(id));
    return saved ? { cuts: saved.cuts.slice(), hp: saved.hp, dead: saved.dead ?? null } : { cuts: [], hp: 1, dead: null };
  }

  _save(o) {
    this.world.worldState?.set(this._key(o.id), { cuts: o.st.cuts, hp: o.st.hp, dead: o.st.dead });
  }

  /**
   * Um objeto ativo passa a receber cortes. root: o Object3D cujo frame guarda os cortes (o que se move);
   * meshes: as malhas dele (filhas, a qualquer profundidade); essential: [{ x, y, z, r }] no frame do
   * root; onDead(reason, replay): parar ('essential' | 'worn'). Refaz os cortes e o fim já salvos.
   */
  attach(id, { root, meshes, essential = [], onDead = (_why, _replay) => {} }) {
    const o = { id, root, meshes, essential, onDead, st: this._state(id) };
    this.objs.set(id, o);
    if (o.st.cuts.length) {
      root.updateMatrixWorld(true);
      this._apply(o, o.st.cuts);
    }
    if (o.st.dead) onDead(o.st.dead, true);
    return o;
  }

  detach(id) {
    this.objs.delete(id);
  }

  /** A vida de um objeto (0..1), e se ele parou (os testes, o futuro aparelho). */
  info(id) {
    const o = this.objs.get(id);
    return o ? { hp: o.st.hp, dead: o.st.dead, cuts: o.st.cuts.length } : null;
  }

  /** Um corte novo (GLOBAL — world.addCut): nos objetos que ele atravessa. */
  onCut(cut) {
    const origin = this.world.origin;
    for (const o of this.objs.values()) {
      const root = o.root;
      if (!root.parent) continue;
      root.updateMatrixWorld(true);
      // o corte no frame do root
      _inv.copy(root.matrixWorld).invert();
      const a = new THREE.Vector3(cut.a[0], cut.a[1], cut.a[2]).sub(origin).applyMatrix4(_inv);
      const b = new THREE.Vector3(cut.b[0], cut.b[1], cut.b[2]).sub(origin).applyMatrix4(_inv);
      const local = { id: cut.id, a: a.toArray(), b: b.toArray(), r: cut.r };
      if (!this._apply(o, [local])) continue;
      this.stats.cuts++;
      o.st.cuts.push(local);
      if (!o.st.dead) {
        // um ponto essencial? (o eixo do corte passa a menos de r + o raio do ponto)
        const hitEss = o.essential.some((p) => segPoint(new THREE.Vector3(p.x, p.y, p.z), a, b) < cut.r + p.r);
        o.st.hp = Math.max(0, o.st.hp - wearOf(cut.r));
        if (hitEss || o.st.hp <= 0) {
          o.st.dead = hitEss ? 'essential' : 'worn';
          if (hitEss) this.stats.essential++;
          else this.stats.worn++;
          o.onDead(o.st.dead, false);
          this.world.bus?.emit('structure:dead', { id: o.id, reason: o.st.dead });
        } else this.world.bus?.emit('structure:hit', { id: o.id, hp: o.st.hp });
      }
      this._save(o);
    }
  }

  /** Corta as malhas do objeto pelos cortes (no frame do root). true = alguma malha mudou. */
  _apply(o, cuts) {
    let changed = false;
    _inv.copy(o.root.matrixWorld).invert();
    for (const mesh of o.meshes) {
      // o frame da malha a partir do do root
      mesh.updateMatrixWorld(true);
      _m.copy(_inv).multiply(mesh.matrixWorld); // malha → root
      const toMesh = _m.clone().invert(); // root → malha
      const local = cuts.map((c) => ({
        id: c.id,
        a: _a.fromArray(c.a).applyMatrix4(toMesh).toArray(),
        b: _b.fromArray(c.b).applyMatrix4(toMesh).toArray(),
        r: c.r,
      }));
      const g = mesh.geometry;
      const r = cutPiece(g, local, { maxEdge: 1.2 });
      if (r.mode === 'none') continue;
      changed = true;
      mesh.geometry = r.kept ?? new THREE.BufferGeometry();
      if (r.caps) {
        // as faces do corte: em brasa, presas à malha (andam com ela)
        const caps = new THREE.Mesh(r.caps, movingMaterial(this.world.materials.cut));
        caps.userData.noCollide = true;
        caps.userData.cutCaps = true;
        mesh.add(caps);
      }
    }
    return changed;
  }
}
