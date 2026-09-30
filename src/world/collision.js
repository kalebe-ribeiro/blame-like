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
const _g = new THREE.Vector3();

export class CollisionWorld {
  constructor(world) {
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
    const w = this.world;
    this.meshes.length = 0;
    let budget = this.buildsPerFrame;
    let ready = true;
    const g = w.toGlobal(scenePos, _g);
    if (!w.chunkLayer.isReadyAround(g, Math.min(radius, 30))) ready = false;

    const consider = (mesh) => {
      if (!mesh.isMesh || mesh.userData.noCollide) return;
      const geom = mesh.geometry;
      if (!geom.boundingSphere) geom.computeBoundingSphere();
      _c.copy(geom.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
      if (_c.distanceTo(scenePos) - geom.boundingSphere.radius > radius) return;
      if (!geom.boundsTree) {
        if (budget <= 0) {
          ready = false;
          return;
        }
        geom.boundsTree = new MeshBVH(geom, { maxLeafTris: 12 });
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
    for (const s of w.builders?.sites.values() ?? []) {
      if (s.builtMesh) consider(s.builtMesh);
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
