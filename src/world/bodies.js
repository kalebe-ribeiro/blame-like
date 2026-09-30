// ─────────────────────────────────────────────────────────────────────────────
//  Corpos dos seres (fase 5) — feitos por código, como o resto do mundo.
//
//  CORPO DE TESTE (fase 5): uma figura humana magra, sem rosto e sem papel —
//  serve para provar que um corpo atravessa a Cidade sozinho.
//  SAFEGUARD (fase 6): o mesmo esqueleto, esticado — alto (~2,3 m), magro,
//  pálido, sem rosto: uma fenda escura onde seria o rosto. Os NPCs (fase 7)
//  reusam o esqueleto com outras proporções e peças.
//
//  Esqueleto: quadril → tronco → pescoço/cabeça; ombros → braço → antebraço;
//  quadris → coxa → canela → pé. Cada junta é um Group que gira em x.
//  Animação procedural: a fase da passada avança com a distância andada (os
//  pés não "patinam"); parado, tudo volta ao repouso.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const TEST = {
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

/** O Safeguard: mais alto, membros longos, passada maior. */
const SAFEGUARD = {
  hip: 1.2,
  thigh: 0.6,
  shin: 0.58,
  torso: 0.7,
  shoulderW: 0.22,
  hipW: 0.1,
  upperArm: 0.42,
  forearm: 0.46,
  stride: 1.9,
};

/** O corpo de teste: { group, animate(dt, speed, grounded), dispose() }. Os pés ficam em y = 0. */
export function buildTestBody(material) {
  return buildBody(material, TEST);
}

/** Um humano (fase 7): mais baixo, curvado, de capuz e manto (`cloth`); o rosto some no escuro do capuz. */
const HUMAN = {
  hip: 0.86,
  thigh: 0.42,
  shin: 0.4,
  torso: 0.5,
  shoulderW: 0.18,
  hipW: 0.09,
  upperArm: 0.27,
  forearm: 0.28,
  stride: 1.15,
};

export function buildHumanBody(material, cloth, dark) {
  return buildBody(material, HUMAN, null, { cloth, dark });
}

/** Um andarilho transumano (fase 7): proporções de gente, um braço de máquina mais longo, capuz. */
export function buildTranshumanBody(cloth, machine, dark) {
  return buildBody(cloth, TEST, null, { cloth, dark, mech: machine, short: true });
}

/** A vida de silício, revelada: magra, escura, braços longos demais, cabeça pequena e alongada. */
const SILICON = {
  hip: 1.1,
  thigh: 0.56,
  shin: 0.56,
  torso: 0.62,
  shoulderW: 0.16,
  hipW: 0.09,
  upperArm: 0.55,
  forearm: 0.66,
  stride: 1.8,
};

export function buildSiliconBody(dark) {
  return buildBody(dark, SILICON, null, { silicon: true });
}

/** O Safeguard (pálido; `slit`: o material escuro da fenda no rosto). */
export function buildSafeguardBody(material, slit) {
  return buildBody(material, SAFEGUARD, slit);
}

function buildBody(material, D, slitMat = null, dress = null) {
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
  head.scale(0.92, slitMat ? 1.55 : 1.28, 1.05);
  head.translate(0, slitMat ? 0.24 : 0.21, 0.02);
  // dentro do capuz a cabeça é só escuro (nenhum rosto)
  if (dress?.silicon) head.scale(0.7, 1.25, 0.85);
  add(neck, new THREE.Mesh(head, dress?.dark ?? material));
  if (dress?.cloth) {
    // o capuz (aberto na frente: dentro, só escuro) e o manto caindo dos ombros até os joelhos
    // aberto na frente (+z é φ = π/2 no SphereGeometry): uma abertura de ~100°
    const hood = new THREE.SphereGeometry(0.17, 12, 8, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.75);
    hood.scale(1, 1.2, 1.1);
    hood.translate(0, 0.22, -0.01);
    add(neck, new THREE.Mesh(hood, dress.cloth));
    const drop = dress.short ? 0.2 : 0.55; // o do andarilho é mais curto (anda muito)
    const cloak = new THREE.CylinderGeometry(0.2, 0.34, D.torso + drop, 9, 1, true);
    cloak.translate(0, D.torso - (D.torso + drop) / 2 + 0.05, -0.01);
    add(spine, new THREE.Mesh(cloak, dress.cloth));
  }
  if (slitMat) {
    // a fenda: uma placa escura rente à frente da cabeça, na vertical
    const slit = new THREE.BoxGeometry(0.018, 0.2, 0.02);
    slit.translate(0, 0.26, 0.143);
    add(neck, new THREE.Mesh(slit, slitMat));
  }

  // braços
  const arms = [];
  for (const s of [-1, 1]) {
    // o braço de máquina do transumano (o direito): mais longo, de aço
    const mech = dress?.mech && s > 0;
    const ua = D.upperArm * (mech ? 1.12 : 1);
    const fa = D.forearm * (mech ? 1.3 : 1);
    const mat = mech ? dress.mech : material;
    const sh = joint(spine, s * D.shoulderW, D.torso - 0.06, 0);
    sh.rotation.z = s * 0.06;
    add(sh, limb(ua, mech ? 0.06 : 0.05, 0.042, mat));
    const el = joint(sh, 0, -ua, 0);
    add(el, limb(fa, mech ? 0.05 : 0.04, 0.03, mat));
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
