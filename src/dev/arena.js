// ─────────────────────────────────────────────────────────────────────────────
//  Uma arena preparada para os testes (só desenvolvimento): no vão de um poço (gen/field.js shaft),
//  longe de tudo, uma plataforma de chapa com uma PAREDE alta num lado e uma BORDA no outro, e
//  um piso largo 70 m abaixo da borda. Malhas fixas (world.staticGroup — coordenadas GLOBAIS, a
//  colisão as vê de imediato), para os casos que antes dependiam de achar a geometria certa no
//  lugar sorteado (o choque contra a parede, o golpe na borda, o golpe contra a parede).
//
//    platform  24 × 24 m, o tampo em y0
//    wall      no lado +x: 6 m de altura, a face em x = c.x + 12
//    edge      o lado −x (aberto); embaixo, o piso em y0 − 70 (60 × 60 m)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Leva o jogador (voando) ao vão do poço mais perto, monta a arena e põe o jogador nela. → arena */
export async function buildArena(ctx) {
  const { world, controls } = ctx;
  const F = world.field;
  // um poço perto da origem, e um ponto no meio do vão, entre as camadas
  let c = null;
  for (let r = 0; r <= 4 && !c; r++) {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x0 = (dx * r * 3200);
      const z0 = (dz * r * 3200);
      for (const s of F.shaftsNear(x0, z0)) {
        for (const y of [300, -400, 900]) {
          if (F.inBarrier(y, 120) || F.inBarrier(y - 80, 20)) continue;
          if (F.insideVoid(s.x, y, s.z) && F.insideVoid(s.x, y - 75, s.z) && F.insideVoid(s.x + 35, y, s.z) && F.insideVoid(s.x - 35, y, s.z)) {
            c = new THREE.Vector3(s.x, y, s.z);
            break;
          }
        }
        if (c) break;
      }
      if (c) break;
    }
  }
  if (!c) return null;
  const couldFly = controls.canFly;
  controls.canFly = true;
  controls.setMode('fly');
  controls.setView({ pos: c.clone().setY(c.y + 3).sub(world.origin), yaw: 0, pitch: 0, scale: 1 });
  await sleep(9000);
  const mat = world.materials.machine;
  const meshes = [];
  const box = (x, y, z, sx, sy, sz, kind) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); // (GLOBAL: o grupo fixo anda com a origem)
    m.userData.mat = 'machine';
    m.userData.arena = kind;
    world.staticGroup.add(m);
    m.updateMatrixWorld(true);
    meshes.push(m);
  };
  const y0 = c.y;
  box(c.x, y0 - 0.5, c.z, 24, 1, 24, 'platform');
  box(c.x + 12.5, y0 + 3, c.z, 1, 6, 24, 'wall');
  box(c.x, y0 - 70.5, c.z, 60, 1, 60, 'floor');
  controls.setMode('walk');
  controls.canFly = couldFly;
  controls.placeFeet(new THREE.Vector3(c.x, y0, c.z).sub(world.origin));
  await sleep(800);
  return {
    c,
    y0,
    /** a face da parede (x) e a borda (x) */
    wallX: c.x + 12,
    edgeX: c.x - 12,
    floorY: y0 - 70,
    /** põe o jogador de pé num ponto (GLOBAL x, z) do tampo, olhando yaw */
    place(x, z, yaw = 0) {
      controls.setMode('walk');
      controls.placeFeet(new THREE.Vector3(x, y0, z).sub(world.origin));
      controls.yaw = yaw;
      controls.pitch = 0;
    },
    remove() {
      for (const m of meshes) {
        world.staticGroup.remove(m);
        m.geometry.dispose();
      }
    },
  };
}
