// ─────────────────────────────────────────────────────────────────────────────
//  Corpos dos seres (fase 5) — feitos por código, como o resto do mundo.
//
//  Hoje só existe o CORPO DE TESTE: uma figura humana magra, sem rosto e sem
//  papel (nem Safeguard, nem humano, nem transumano) — serve para provar que
//  um corpo atravessa a Cidade sozinho. Os seres de verdade (fases 6 e 7)
//  reusam o esqueleto e a animação daqui com outras proporções e peças.
//
//  Esqueleto: quadril → tronco → pescoço/cabeça; ombros → braço → antebraço;
//  quadris → coxa → canela → pé. Cada junta é um Group que gira em x.
//  Animação procedural: a fase da passada avança com a distância andada (os
//  pés não "patinam"); parado, tudo volta ao repouso.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const DIMS = {
  hip: 0.95, // altura do quadril
  thigh: 0.47,
  shin: 0.45,
  torso: 0.58,
  shoulderW: 0.2,
  hipW: 0.1,
  upperArm: 0.3,
  forearm: 0.32,
  stride: 1.35, // m por passada completa (dois passos)
};

function limb(len, r0, r1, mat) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 6);
  g.translate(0, -len / 2, 0); // a junta fica no topo
  return new THREE.Mesh(g, mat);
}

function joint(parent, x, y, z) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

/** O corpo de teste: { group, animate(dt, speed, grounded), dispose() }. Os pés ficam em y = 0. */
export function buildTestBody(material) {
  const D = DIMS;
  const group = new THREE.Group();
  const root = joint(group, 0, D.hip, 0); // o quadril (sobe e desce com a passada)
  const meshes = [];
  const add = (parent, mesh) => {
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // bacia e tronco (um pouco inclinado para a frente: anda curvado)
  add(root, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.18), material));
  const spine = joint(root, 0, 0.06, 0);
  spine.rotation.x = 0.08;
  const chest = new THREE.CylinderGeometry(0.19, 0.13, D.torso, 7);
  chest.scale(1, 1, 0.62);
  chest.translate(0, D.torso / 2, 0);
  add(spine, new THREE.Mesh(chest, material));
  // pescoço e cabeça: lisa, sem rosto
  const neck = joint(spine, 0, D.torso, 0.01);
  add(neck, limb(0.1, 0.045, 0.05, material)).position.y = 0.1;
  const head = new THREE.SphereGeometry(0.12, 10, 8);
  head.scale(0.92, 1.28, 1.05);
  head.translate(0, 0.21, 0.02);
  add(neck, new THREE.Mesh(head, material));

  // braços
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(spine, s * D.shoulderW, D.torso - 0.06, 0);
    sh.rotation.z = s * 0.06;
    add(sh, limb(D.upperArm, 0.05, 0.042, material));
    const el = joint(sh, 0, -D.upperArm, 0);
    add(el, limb(D.forearm, 0.04, 0.03, material));
    arms.push({ sh, el, s });
  }

  // pernas
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = joint(root, s * D.hipW, -0.04, 0);
    add(hp, limb(D.thigh, 0.075, 0.055, material));
    const kn = joint(hp, 0, -D.thigh, 0);
    add(kn, limb(D.shin, 0.052, 0.04, material));
    const an = joint(kn, 0, -D.shin, 0);
    const foot = new THREE.BoxGeometry(0.09, 0.06, 0.24);
    foot.translate(0, -0.03, 0.06);
    add(an, new THREE.Mesh(foot, material));
    legs.push({ hp, kn, an, s });
  }
  // de pé, o pé encosta em y = 0: quadril − (coxa + canela) − 0,04 − 0,06 (o pé)
  root.position.y = D.thigh + D.shin + 0.04 + 0.06;

  for (const m of meshes) m.userData.noCollide = true;

  let phase = 0;
  let amt = 0; // 0 parado · 1 andando

  return {
    group,
    animate(dt, speed, grounded) {
      const want = grounded ? Math.min(1, speed / 1.2) : 0.3;
      amt += (want - amt) * Math.min(1, dt * 6);
      phase += (speed * dt * Math.PI * 2) / D.stride;
      const a = amt;
      for (const L of legs) {
        const p = phase + (L.s > 0 ? Math.PI : 0);
        const sw = Math.sin(p);
        L.hp.rotation.x = -sw * 0.42 * a;
        // o joelho dobra na volta da perna (quando ela vem para a frente)
        L.kn.rotation.x = Math.max(0, Math.cos(p)) * 0.95 * a + 0.05;
        L.an.rotation.x = -L.hp.rotation.x * 0.3 - L.kn.rotation.x * 0.4;
      }
      for (const A of arms) {
        const p = phase + (A.s > 0 ? 0 : Math.PI);
        A.sh.rotation.x = -Math.sin(p) * 0.32 * a;
        A.el.rotation.x = -0.25 - Math.max(0, -Math.sin(p)) * 0.3 * a;
      }
      // o quadril fica na altura em que o pé mais baixo encosta no chão (nada de pés no ar)
      let reach = 0;
      for (const L of legs) {
        const h = L.hp.rotation.x;
        reach = Math.max(reach, D.thigh * Math.cos(h) + D.shin * Math.cos(h + L.kn.rotation.x) + 0.06);
      }
      root.position.y = 0.04 + reach;
      spine.rotation.x = 0.08 + 0.06 * a;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
    },
  };
}
