// ─────────────────────────────────────────────────────────────────────────────
//  Colisão contra a geometria real do mundo (para o modo andar).
//
//  Usa three-mesh-bvh: cada malha próxima do jogador ganha uma BVH (árvore de
//  volumes) construída sob demanda — raycasts viram O(log n). A cada frame só
//  entram na lista as malhas cujo volume está perto do jogador.
//
//  Obs.: os shaders deslocam levemente os vértices ("respiração"); a colisão
//  usa a geometria base. Nos materiais andáveis o deslocamento é mínimo.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const _c = new THREE.Vector3();
// Montar a árvore (BVH) de uma malha grande leva vários ms. Cada corpo (jogador, Safeguards,
// moradores…) tem a sua CollisionWorld — mas a árvore fica na geometria, compartilhada; e o
// orçamento por quadro é UM para todos (antes, cada corpo montava até 2 por quadro: com vários
// chegando juntos, travadas de 30+ ms).
const BVH_MS = 4; // ms por quadro, somando todos os corpos
const _bvh = { frame: -1, ms: 0, n: 0 };
const _g = new THREE.Vector3();

export class CollisionWorld {
  constructor(world) {
    /** @type {THREE.Vector3|undefined} onde a lista de malhas foi feita (reaproveitada perto dali) */
    this._at = undefined;
    this._r = 0;
    this._t = 0;
    this.world = world;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.meshes = [];
    this.ready = false;
    this.buildsPerFrame = 2;
  }

  /**
   * Recolhe as malhas perto de `scenePos` e garante BVH nelas.
   * `ready` fica falso se algo por perto ainda não chegou dos workers.
   */
  refresh(scenePos, radius) {
    // a lista ainda serve (o corpo mal saiu do lugar, há pouco): não varre o mundo de novo.
    // Cada corpo (jogador, Safeguards, moradores…) chama isto a cada quadro — varrer todas
    // as malhas de todos os chunks para cada um custava caro com vários seres por perto
    const now = performance.now();
    if (this.ready && this._at && this._at.distanceToSquared(scenePos) < 1 && radius <= this._r && now - this._t < 300) return;
    (this._at ??= new THREE.Vector3()).copy(scenePos);
    this._r = radius;
    this._t = now;
    const w = this.world;
    this.meshes.length = 0;
    let budget = this.buildsPerFrame;
    let ready = true;
    const g = w.toGlobal(scenePos, _g);
    if (!w.chunkLayer.isReadyAround(g, Math.min(radius, 30))) ready = false;

    const consider = (mesh) => {
      if (!mesh.isMesh || mesh.userData.noCollide) return;
      const geom = mesh.geometry;
      // (uma malha que o emissor apagou inteira fica sem triângulos: nada a colidir — e a BVH quebra nela)
      if (!geom.attributes.position?.count) return;
      if (!geom.boundingSphere) geom.computeBoundingSphere();
      _c.copy(geom.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
      if (_c.distanceTo(scenePos) - geom.boundingSphere.radius > radius) return;
      if (!geom.boundsTree) {
        const f = w.frameNo ?? 0;
        if (_bvh.frame !== f) {
          _bvh.frame = f;
          _bvh.ms = 0;
          _bvh.n = 0;
        }
        // sempre ao menos uma por quadro (senão nada anda); depois, até o orçamento
        if (budget <= 0 || (_bvh.n > 0 && _bvh.ms > BVH_MS)) {
          ready = false;
          return;
        }
        const t0 = performance.now();
        geom.boundsTree = new MeshBVH(geom, { maxLeafTris: 12 });
        _bvh.ms += performance.now() - t0;
        _bvh.n++;
        budget--;
      }
      this.meshes.push(mesh);
    };

    for (const layer of [w.chunkLayer, w.macroLayer]) {
      for (const e of layer.chunks.values()) {
        if (!e.group) continue;
        for (const m of e.group.children) consider(m);
      }
    }
    for (const m of w.staticGroup.children) consider(m);
    for (const m of w.elevators?.meshes ?? []) consider(m);
    for (const m of w.transit?.meshes ?? []) consider(m);
    for (const m of w.terminals?.meshes ?? []) consider(m);
    for (const m of w.substations?.meshes ?? []) consider(m);
    for (const m of w.colossi?.meshes ?? []) consider(m);
    // os Construtores: tudo do canteiro é sólido — a obra, os trilhos, o pórtico, o gancho, a carga, os destroços
    for (const s of w.builders?.sites.values() ?? []) {
      for (const m of s.group.children) consider(m);
    }
    this.ready = ready;
  }

  /** Primeiro impacto do raio (ou null). */
  ray(origin, dir, far) {
    if (!this.meshes.length) return null;
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    return hits.length ? hits[0] : null;
  }
}
