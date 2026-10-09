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
import { safeguardKit, siliconKit, humanKit, transhumanKit, tribeOf } from './kits.js';

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

/** O corpo de teste: { group, animate(dt, speed, grounded), dispose() }. Os pés ficam em y = 0. */
export function buildTestBody(material) {
  return buildBody(material, TEST);
}

/** Os hostis por nível (o rework gráfico, frente 5 — world/kits.js): M os materiais, level, id. */
export function buildSafeguardLevel(M, level, id) {
  const { D, kit } = safeguardKit(level, M, id);
  return buildBody(M.pale, D, null, null, kit);
}
/** Um morador: o grupo vem da vila (o id `vl:<vila>:<n>` — world/npcs.js); sem vila, um abrigado. */
export function buildHumanOf(M, id, tribe = null) {
  const s = String(id ?? '');
  const vid = s.startsWith('vl:') ? s.slice(3, s.lastIndexOf(':')) : '';
  const { D, kit } = humanKit(tribe ?? (vid ? tribeOf(vid) : 'abrigado'), M, id);
  return buildBody(M.cloth, D, null, null, kit);
}
/** Um andarilho transumano (as próteses dele). */
export function buildTranshumanOf(M, id) {
  const { D, kit } = transhumanKit(M, id);
  return buildBody(M.cloth, D, null, null, kit);
}
export function buildSiliconLevel(M, level, id) {
  const { D, kit } = siliconKit(level, M, id);
  return buildBody(M.monolith, D, null, null, kit);
}

/**
 * kit (opcional — world/kits.js): head(neck, add) no lugar da cabeça; hand(el, lado, antebraço, add) na
 * ponta de cada braço; deco({ root, spine, neck, add }) as peças do corpo; strike(w)/rest() a reação ao
 * golpe (o núcleo); dispose(). D.girth engrossa tronco e membros; D.extraArms pares de braços a mais.
 */
function buildBody(material, D, slitMat = null, dress = null, kit = null) {
  const G = D.girth ?? 1;
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
  const chest = new THREE.CylinderGeometry(0.19 * G, 0.13 * G, D.torso, 7);
  chest.scale(1, 1, 0.62);
  chest.translate(0, D.torso / 2, 0);
  add(spine, new THREE.Mesh(chest, material));
  // pescoço e cabeça: lisa, sem rosto
  const neck = joint(spine, 0, D.torso, 0.01);
  add(neck, limb(0.1, 0.045 * G, 0.05 * G, material)).position.y = 0.1;
  if (kit?.head) kit.head(neck, add);
  else {
    const head = new THREE.SphereGeometry(0.12, 10, 8);
    head.scale(0.92, slitMat ? 1.55 : 1.28, 1.05);
    head.translate(0, slitMat ? 0.24 : 0.21, 0.02);
    // dentro do capuz a cabeça é só escuro (nenhum rosto)
    if (dress?.silicon) head.scale(0.7, 1.25, 0.85);
    add(neck, new THREE.Mesh(head, dress?.dark ?? material));
  }
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

  // braços (e os pares a mais — a vida de silício alta: uma massa de membros)
  const arms = [];
  for (let pair = 0; pair <= (D.extraArms ?? 0); pair++) {
    const k = pair ? 0.85 : 1;
    for (const s of [-1, 1]) {
      // o braço de máquina do transumano (o direito): mais longo, de aço
      const mech = dress?.mech && s > 0;
      const ua = D.upperArm * (mech ? 1.12 : 1) * k;
      const fa = D.forearm * (mech ? 1.3 : 1) * k;
      const mat = mech ? dress.mech : material;
      const sh = joint(spine, s * D.shoulderW * (pair ? 0.85 : 1), D.torso * (pair ? 0.62 : 1) - 0.06, 0);
      sh.rotation.z = s * 0.06;
      add(sh, limb(ua, (mech ? 0.06 : 0.05) * G, 0.042 * G, mat));
      const el = joint(sh, 0, -ua, 0);
      add(el, limb(fa, (mech ? 0.05 : 0.04) * G, 0.03 * G, mat));
      if (kit?.hand) kit.hand(el, s, fa, add);
      arms.push({ sh, el, s, extra: pair > 0 });
    }
  }

  // pernas
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = joint(root, s * D.hipW, -0.04, 0);
    add(hp, limb(D.thigh, 0.075 * G, 0.055 * G, material));
    const kn = joint(hp, 0, -D.thigh, 0);
    add(kn, limb(D.shin, 0.052 * G, 0.04 * G, material));
    const an = joint(kn, 0, -D.shin, 0);
    const foot = new THREE.BoxGeometry(0.09, 0.06, 0.24);
    foot.translate(0, -0.03, 0.06);
    add(an, new THREE.Mesh(foot, material));
    legs.push({ hp, kn, an, s });
  }
  // de pé, o pé encosta em y = 0: quadril − (coxa + canela) − 0,04 − 0,06 (o pé)
  root.position.y = D.thigh + D.shin + 0.04 + 0.06;
  kit?.deco?.({ root, spine, neck, add });

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
        const p = phase + (A.s > 0 ? 0 : Math.PI) + (A.extra ? Math.PI * 0.5 : 0);
        A.sh.rotation.x = -Math.sin(p) * 0.32 * a * (D.swing ?? 1);
        A.sh.rotation.z = A.s * (A.extra ? 0.35 : 0.06);
        A.el.rotation.x = -0.25 - Math.max(0, -Math.sin(p)) * 0.3 * a;
      }
      kit?.rest?.();
      // o quadril fica na altura em que o pé mais baixo encosta no chão (nada de pés no ar)
      let reach = 0;
      for (const L of legs) {
        const h = L.hp.rotation.x;
        reach = Math.max(reach, D.thigh * Math.cos(h) + D.shin * Math.cos(h + L.kn.rotation.x) + 0.06);
      }
      root.position.y = 0.04 + reach;
      root.position.z = 0;
      spine.rotation.x = 0.08 + (D.lean ?? 0) + 0.06 * a;
      spine.rotation.y = 0; // (o golpe torce o tronco — strike)
      neck.rotation.x = 0;
    },
    /** Agarrando (k 0..1): os dois braços erguidos para a frente, o tronco e a cabeça inclinados para quem é pego. */
    grab(k) {
      for (const A of arms) {
        A.sh.rotation.x = -1.45 * k + A.sh.rotation.x * (1 - k);
        A.sh.rotation.z = A.s * (0.06 - 0.22 * k); // as mãos se fecham na frente
        A.el.rotation.x = -0.35 * k + A.el.rotation.x * (1 - k);
      }
      spine.rotation.x += 0.3 * k;
      neck.rotation.x = 0.25 * k;
    },
    /** Ferido (k 0..1): o tronco recua, a cabeça cai para trás, os braços abrem (o cofre, Dano-do-emissor §4). */
    stagger(k) {
      for (const A of arms) {
        A.sh.rotation.x += 0.5 * k;
        A.sh.rotation.z = A.s * (0.06 + 0.45 * k);
        A.el.rotation.x -= 0.4 * k;
      }
      spine.rotation.x -= 0.35 * k;
      neck.rotation.x = -0.3 * k;
    },
    /**
     * O golpe: w (0..1) a preparação; s (0..1) o golpe vindo. kind (o rework gráfico — a variedade):
     *   'swing'    o braço direito recolhe para trás, o tronco torce, o braço vem de lado (o arremesso)
     *   'overhead' os dois braços sobem e descem juntos, o tronco se curva
     *   'lunge'    o braço direito recua junto ao corpo e estoca reto para a frente, o corpo avança
     *   'low'      o alvo está mais baixo: o tronco se dobra e a garra varre de cima para baixo
     */
    strike(w, s, kind = 'swing') {
      const A = arms.find((a) => a.s > 0);
      const B = arms.find((a) => a.s < 0);
      if (kind === 'overhead') {
        for (const X of arms) {
          X.sh.rotation.x = -2.6 * w * (1 - s) - 0.6 * s;
          X.sh.rotation.z = X.s * (0.06 + 0.25 * w * (1 - s));
          X.el.rotation.x = -0.6 * w * (1 - s) - 0.1 * s;
        }
        spine.rotation.x += -0.15 * w * (1 - s) + 0.45 * s;
        neck.rotation.x = 0.2 * s;
        kit?.strike?.(w);
        return;
      }
      if (kind === 'lunge' && A) {
        A.sh.rotation.x = 0.35 * w * (1 - s) - 1.55 * s;
        A.sh.rotation.z = A.s * 0.06;
        A.el.rotation.x = -1.6 * w * (1 - s);
        if (B) {
          B.sh.rotation.x = 0.4 * w;
          B.el.rotation.x = -0.5 * w;
        }
        spine.rotation.x += 0.1 * w + 0.25 * s;
        root.position.z = 0.25 * s;
        kit?.strike?.(w);
        return;
      }
      if (kind === 'low' && A) {
        A.sh.rotation.x = -1.8 * w * (1 - s) - 0.4 * s;
        A.sh.rotation.z = A.s * (0.1 + 0.3 * w);
        A.el.rotation.x = -0.9 * w * (1 - s) - 0.2 * s;
        spine.rotation.x += 0.35 * w + 0.5 * s;
        neck.rotation.x = 0.35 * (w + s) * 0.5;
        for (const L of legs) L.kn.rotation.x += 0.35 * w;
        kit?.strike?.(w);
        return;
      }
      if (A) {
        A.sh.rotation.x = 0.9 * w * (1 - s) - 1.5 * s;
        A.sh.rotation.z = A.s * (0.06 + 0.5 * w * (1 - s) - 0.25 * s);
        A.el.rotation.x = -1.2 * w * (1 - s) - 0.15 * s;
      }
      if (B) {
        B.sh.rotation.x = -0.5 * w;
        B.el.rotation.x = -0.8 * w;
      }
      spine.rotation.y = 0.45 * w * (1 - s) - 0.35 * s;
      spine.rotation.x += 0.2 * w;
      neck.rotation.x = 0.15 * w;
      kit?.strike?.(w);
    },
    /** Morrendo / morto (k 0..1): o corpo amolece — braços abertos e soltos, joelhos dobrados, a cabeça caída. */
    slump(k) {
      for (const A of arms) {
        A.sh.rotation.x = 0.5 * k;
        A.sh.rotation.z = A.s * (0.06 + 1.1 * k);
        A.el.rotation.x = -0.6 * k;
      }
      for (const L of legs) {
        L.hp.rotation.x = -0.25 * k * L.s;
        L.kn.rotation.x = 0.7 * k;
      }
      spine.rotation.x = 0.08 - 0.15 * k;
      neck.rotation.x = -0.5 * k;
      root.position.z = 0;
      kit?.rest?.();
    },
    dispose() {
      group.traverse((/** @type {any} */ o) => o.geometry?.dispose?.());
      kit?.dispose?.();
    },
  };
}
