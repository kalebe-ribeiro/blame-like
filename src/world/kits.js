// ─────────────────────────────────────────────────────────────────────────────
//  Os corpos dos hostis por nível (o rework gráfico, frente 5 — o cofre, Rework-grafico e
//  Referencias-Blame). Procedurais e articulados: o esqueleto e a animação de world/bodies.js, e aqui
//  as proporções, a cabeça, as mãos e as peças de cada tipo e nível — variando pela identidade do ser
//  (dois do mesmo nível nunca são cópias). Ler o perigo de longe: o tamanho e a silhueta crescem com o
//  nível (Referencias-Blame: "mais alto = maior e mais alto, com um núcleo no abdômen").
//
//  SAFEGUARD (o Exterminador): pálido, magro, andrógino; a cabeça lisa, uma máscara sem expressão com
//  dois cortes escuros; mãos em GARRAS longas; costelas e a crista da coluna aparentes.
//    baixo  ~2,3 m, fino, numeroso
//    médio  ~2,7 m, ombros largos, placas nos ombros, o NÚCLEO no abdômen (uma esfera quente numa
//           moldura escura) — acende antes do golpe
//    alto   ~3,3 m, pesado, couraças, núcleo grande numa gaiola de costelas, lâminas nos antebraços
//  VIDA DE SILÍCIO (ciborgue): a cabeça humana num corpo de máquina — o grau de máquina cresce com o nível.
//    baixo  esguia, tronco de armação e pistões, um braço-arma, o símbolo na testa
//    médio  maior, os dois braços de máquina, cabos longos caindo da cabeça como cabelo, uma lâmina
//    alto   uma massa de membros: dois pares de braços, a cabeça pequena afundada entre os ombros
//
//  Nada flutua, nada é mágico (a regra do projeto): o núcleo é uma câmara presa ao corpo, a luz dele
//  tem fonte (é ele).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash4 } from '../gen/hash.js';

/** Um gerador pela identidade do ser (o mesmo id, o mesmo corpo). */
function rngOf(id, salt) {
  let n = 0;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
  let k = 0;
  return () => hash4(n, salt, k++, 7, 911);
}
const lerp = (a, b, t) => a + (b - a) * t;

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.userData.noCollide = true;
  return m;
}

/** Um cilindro de a até b (no espaço do pai). */
function rod(r0, r1, a, b, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.translate(0, len / 2, 0);
  const m = mesh(g, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len || 1));
  return m;
}

/** A garra: uma palma estreita e 3 dedos longos curvados para dentro, e um polegar (pendurada em −y). */
function claw(len, mat) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.035).translate(0, -0.04, 0), mat));
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set((i - 1) * 0.022, -0.075, 0);
    f.rotation.x = 0.25;
    f.add(mesh(new THREE.CylinderGeometry(0.004, 0.009, len * 0.55, 5).translate(0, -len * 0.275, 0), mat));
    const tip = new THREE.Group();
    tip.position.y = -len * 0.55;
    tip.rotation.x = 0.45;
    tip.add(mesh(new THREE.ConeGeometry(0.006, len * 0.45, 5).rotateX(Math.PI).translate(0, -len * 0.225, 0), mat));
    f.add(tip);
    g.add(f);
  }
  const th = new THREE.Group();
  th.position.set(0.033, -0.04, 0.012);
  th.rotation.set(0.5, 0, -0.6);
  th.add(mesh(new THREE.CylinderGeometry(0.004, 0.008, len * 0.4, 5).translate(0, -len * 0.2, 0), mat));
  g.add(th);
  return g;
}

/** O núcleo (Safeguards médio e alto): a esfera quente numa moldura escura. → { group, mat } */
function core(r, dark) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.36).multiplyScalar(0.45) });
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(r, 12, 10), mat));
  const ring = mesh(new THREE.TorusGeometry(r * 1.15, r * 0.28, 6, 16), dark);
  g.add(ring);
  return { group: g, mat };
}

/**
 * O kit do Safeguard. level 'low' | 'mid' | 'high'; M os materiais do mundo; id a identidade.
 * → { D, kit } para buildBody (world/bodies.js).
 */
export function safeguardKit(level, M, id) {
  const r = rngOf(id, 1);
  const L = level === 'high' ? 2 : level === 'mid' ? 1 : 0;
  const scale = [1, 1.17, 1.42][L] * lerp(0.95, 1.05, r());
  const lean = lerp(0.9, 1.1, r()); // mais magro ou mais largo
  const D = {
    hip: 1.2 * scale,
    thigh: 0.6 * scale,
    shin: 0.58 * scale,
    torso: 0.7 * scale,
    shoulderW: [0.22, 0.28, 0.34][L] * lean,
    hipW: 0.1 * lean * (1 + 0.15 * L),
    upperArm: 0.42 * scale * lerp(0.95, 1.08, r()),
    forearm: 0.46 * scale * lerp(0.95, 1.12, r()),
    stride: 1.9 * scale,
    girth: [1, 1.25, 1.6][L] * lean, // a grossura do tronco e dos membros
  };
  const skin = M.pale;
  const dark = M.door;
  const clawLen = [0.22, 0.3, 0.36][L] * lerp(0.9, 1.15, r());
  const headStretch = lerp(1.35, 1.7, r());
  let coreMat = null;
  const kit = {
    head(neck, add) {
      // o crânio liso e alongado; a máscara um pouco achatada na frente; dois cortes escuros
      const h = new THREE.SphereGeometry(0.12, 12, 10);
      h.scale(0.9, headStretch, 1.05);
      h.translate(0, 0.24, 0.0);
      add(neck, mesh(h, skin));
      const face = new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
      face.rotateX(Math.PI / 2);
      face.scale(0.85, 1.3, 0.35);
      face.translate(0, 0.22, 0.085);
      add(neck, mesh(face, skin));
      for (const s of [-1, 1]) add(neck, mesh(new THREE.BoxGeometry(0.035, 0.008, 0.012).translate(s * 0.033, 0.26, 0.118), dark));
      if (L >= 1) add(neck, mesh(new THREE.BoxGeometry(0.018, 0.05, 0.2).translate(0, 0.24 + 0.12 * headStretch, -0.01), skin)); // a crista
    },
    hand(el, s, fa, add) {
      const c = claw(clawLen, skin);
      c.position.y = -fa;
      add(el, c);
      if (L === 2) add(el, mesh(new THREE.BoxGeometry(0.012, fa * 0.9, 0.05).translate(s * 0.045, -fa * 0.55, -0.03), dark)); // a lâmina
    },
    deco({ spine, root, add }) {
      const T = D.torso;
      // as costelas aparentes (3) e a crista da coluna (5 vértebras)
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.TorusGeometry(0.145 * D.girth * (1 - i * 0.08), 0.009, 4, 14, Math.PI * 0.9);
        rib.rotateX(Math.PI / 2);
        rib.rotateY(Math.PI * 0.55);
        rib.scale(1, 1, 0.62);
        rib.translate(0, T * (0.55 + i * 0.13), 0.01);
        add(spine, mesh(rib, skin));
      }
      for (let i = 0; i < 5; i++) add(spine, mesh(new THREE.BoxGeometry(0.03, 0.05, 0.04).translate(0, T * (0.15 + i * 0.17), -0.09 * D.girth), skin));
      if (L >= 1) {
        // as ombreiras: cascas arredondadas
        for (const s of [-1, 1]) add(spine, mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.6, 1.2).translate(s * D.shoulderW * 0.95, T - 0.01, 0), skin));
        const k = core(L === 2 ? 0.075 : 0.055, dark);
        k.group.position.set(0, T * 0.24, 0.09 * D.girth);
        add(spine, k.group);
        coreMat = k.mat;
      }
      if (L === 2) {
        // as couraças: uma casca em volta do peito (aberta embaixo, onde fica o núcleo) e a placa da bacia
        const shell = new THREE.CylinderGeometry(0.21 * D.girth, 0.16 * D.girth, T * 0.5, 9, 1, true);
        shell.scale(1, 1, 0.7);
        shell.translate(0, T * 0.72, 0.005);
        add(spine, mesh(shell, skin));
        add(root, mesh(new THREE.CylinderGeometry(0.17 * D.girth, 0.14 * D.girth, 0.13, 9).scale(1, 1, 0.7), skin));
      }
    },
    /** o golpe: o núcleo acende na preparação */
    strike(w) {
      if (coreMat) coreMat.color.setRGB(1.0, 0.5, 0.22).multiplyScalar(0.6 + 3 * w);
    },
    rest() {
      if (coreMat) coreMat.color.setRGB(1.0, 0.5, 0.22).multiplyScalar(0.6);
    },
    dispose() {
      coreMat?.dispose();
    },
  };
  return { D, kit };
}

/** O kit da vida de silício (revelada). */
export function siliconKit(level, M, id) {
  const r = rngOf(id, 2);
  const L = level === 'high' ? 2 : level === 'mid' ? 1 : 0;
  const scale = [1, 1.15, 1.35][L] * lerp(0.95, 1.06, r());
  const D = {
    hip: 1.1 * scale,
    thigh: 0.56 * scale,
    shin: 0.56 * scale,
    torso: 0.62 * scale,
    shoulderW: [0.17, 0.24, 0.34][L],
    hipW: [0.09, 0.11, 0.15][L],
    upperArm: 0.5 * scale,
    forearm: 0.58 * scale,
    stride: 1.8 * scale,
    girth: [1, 1.35, 1.8][L],
    extraArms: L === 2 ? 1 : 0,
    headDrop: L === 2 ? 0.22 : 0, // a cabeça afundada entre os ombros
  };
  const metal = M.machine;
  const frame = M.monolith;
  const skin = M.cloth; // (a pele: um tom apagado — nenhum rosto vivo de verdade)
  const weaponSide = r() < 0.5 ? -1 : 1;
  const cables = L >= 1 ? 3 + Math.floor(r() * 4) : 0;
  const kit = {
    head(neck, add) {
      // a cabeça humana, pequena; o símbolo na testa (Referencias-Blame)
      const h = new THREE.SphereGeometry(0.1, 12, 10);
      h.scale(0.85, 1.12, 0.95);
      h.translate(0, 0.17 - D.headDrop, 0.02);
      add(neck, mesh(h, skin));
      add(neck, mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01).translate(0, 0.22 - D.headDrop, 0.112), M.door));
      // a placa da mandíbula / o colar de máquina
      add(neck, mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.07, 8).translate(0, 0.07 - D.headDrop, 0), metal));
      for (let i = 0; i < cables; i++) {
        const a = -0.6 + (i / Math.max(1, cables - 1)) * 1.2;
        const top = new THREE.Vector3(Math.sin(a) * 0.08, 0.24 - D.headDrop, -0.05);
        const end = new THREE.Vector3(Math.sin(a) * 0.14, -0.35 - r() * 0.35, -0.16 - r() * 0.08);
        add(neck, rod(0.012, 0.008, top, end, frame, 5));
      }
    },
    hand(el, s, fa, add) {
      if (s === weaponSide) {
        // o braço-arma: o cano no lugar da mão
        const g = new THREE.Group();
        g.position.y = -fa;
        g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 8).translate(0, -0.06, 0), metal));
        g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 8).translate(0, -0.27, 0), frame));
        add(el, g);
      } else if (L >= 1) {
        // a lâmina
        add(el, mesh(new THREE.BoxGeometry(0.01, 0.5, 0.07).translate(0, -fa - 0.22, 0), metal));
      } else {
        const c = claw(0.16, metal);
        c.position.y = -fa;
        add(el, c);
      }
    },
    deco({ spine, root, add }) {
      const T = D.torso;
      // a armação do tronco: duas barras e os pistões
      for (const s of [-1, 1]) {
        add(spine, rod(0.025 * D.girth, 0.02 * D.girth, new THREE.Vector3(s * 0.09 * D.girth, 0.02, 0.03), new THREE.Vector3(s * 0.12 * D.girth, T, 0.0), metal, 6));
        add(spine, rod(0.016, 0.016, new THREE.Vector3(s * 0.05, 0.05, -0.08), new THREE.Vector3(s * 0.11 * D.girth, T * 0.85, -0.06), frame, 5));
      }
      add(spine, mesh(new THREE.BoxGeometry(0.22 * D.girth, T * 0.35, 0.16 * D.girth).translate(0, T * 0.72, 0), frame)); // o bloco do peito
      add(root, mesh(new THREE.CylinderGeometry(0.1 * D.girth, 0.12 * D.girth, 0.14, 8), metal)); // a bacia de máquina
    },
    strike() {},
    rest() {},
    dispose() {},
  };
  return { D, kit };
}

// ── os humanos (o rework gráfico, frente 6): grupos que divergiram por milhares de anos, cada vila de um ──
//  (Referencias-Blame: eletropescadores/tecnômades de armadura, os Homens Secos, os Trabalhadores; e os
//   abrigados de capuz e manto). Dentro do grupo: altura, corpo, peças e desgaste variam por pessoa.
export const TRIBES = ['armadura', 'seco', 'trabalhador', 'abrigado'];

/** O grupo de uma vila pela identidade dela (o mesmo mundo, a mesma vila, o mesmo povo). */
export function tribeOf(villageId) {
  const r = rngOf(villageId, 3);
  return TRIBES[Math.floor(r() * TRIBES.length) % TRIBES.length];
}

/** O kit de um humano do grupo `tribe`. */
export function humanKit(tribe, M, id) {
  const r = rngOf(id, 4);
  const h = lerp(0.9, 1.08, r()) * (tribe === 'trabalhador' ? 1.18 : tribe === 'seco' ? 1.04 : 1);
  const G = tribe === 'armadura' ? 1.3 : tribe === 'trabalhador' ? 1.4 : tribe === 'seco' ? 0.82 : lerp(0.95, 1.15, r());
  const D = {
    hip: 0.86 * h,
    thigh: 0.42 * h,
    shin: 0.4 * h,
    torso: 0.5 * h,
    shoulderW: 0.18 * h * (tribe === 'trabalhador' ? 1.3 : 1),
    hipW: 0.09 * h,
    upperArm: 0.27 * h,
    forearm: 0.28 * h,
    stride: 1.15 * h,
    girth: G,
  };
  const cloth = M.cloth;
  const metal = M.machine;
  const dark = M.door;
  const skin = M.cloth; // (a pele no mesmo tom apagado: na penumbra da Cidade quase não se distingue)
  const hooded = tribe === 'abrigado' ? r() < 0.8 : false;
  const mechArms = tribe === 'trabalhador' ? (r() < 0.4 ? 2 : 1) : 0;
  const kit = {
    head(neck, add) {
      if (tribe === 'armadura') {
        // o capacete fechado, a faixa escura do visor
        add(neck, mesh(new THREE.SphereGeometry(0.14, 12, 10).scale(1, 1.05, 1.1).translate(0, 0.21, 0.01), metal));
        add(neck, mesh(new THREE.BoxGeometry(0.2, 0.045, 0.06).translate(0, 0.22, 0.11), dark));
        if (r() < 0.6) add(neck, mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4).translate(0.09, 0.34, -0.04), metal)); // a antena do rádio
        return;
      }
      const head = new THREE.SphereGeometry(0.11, 12, 10).scale(0.92, 1.18, 1.02).translate(0, 0.2, 0.02);
      add(neck, mesh(head, skin));
      if (tribe === 'seco') {
        // as rachaduras simétricas da pele (no rosto: duas linhas que descem dos olhos)
        for (const s of [-1, 1]) add(neck, mesh(new THREE.BoxGeometry(0.006, 0.09, 0.006).translate(s * 0.035, 0.17, 0.112), dark));
        return;
      }
      if (tribe === 'trabalhador') {
        add(neck, mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05).translate(0, 0.22, 0.1), dark)); // o visor de trabalho
        add(neck, mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.06, 10).translate(0, 0.3, 0), metal)); // o capacete
        return;
      }
      // os abrigados: capuz (ou só um lenço), os óculos e às vezes o respirador
      if (hooded) {
        const hood = new THREE.SphereGeometry(0.17, 12, 8, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.75);
        hood.scale(1, 1.2, 1.1).translate(0, 0.22, -0.01);
        add(neck, mesh(hood, cloth));
      } else add(neck, mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10).translate(0, 0.1, 0), cloth)); // o lenço
      for (const s of [-1, 1]) add(neck, mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8).rotateX(Math.PI / 2).translate(s * 0.04, 0.22, 0.105), dark));
      if (r() < 0.5) add(neck, mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05).translate(0, 0.14, 0.11), metal)); // o respirador
    },
    hand(el, s, fa, add) {
      const mech = mechArms === 2 || (mechArms === 1 && s > 0);
      if (mech) {
        // o braço de máquina do trabalhador: o antebraço grosso e a pinça
        add(el, mesh(new THREE.BoxGeometry(0.09, fa * 0.8, 0.09).translate(0, -fa * 0.45, 0), metal));
        for (const k of [-1, 1]) add(el, mesh(new THREE.BoxGeometry(0.02, 0.12, 0.05).translate(k * 0.03, -fa - 0.06, 0), metal));
        return;
      }
      add(el, mesh(new THREE.BoxGeometry(0.055, 0.08, 0.03).translate(0, -fa - 0.04, 0), tribe === 'armadura' ? metal : skin)); // a mão (ou a luva)
      if (tribe === 'seco' && s > 0) {
        // a lança de metal retorcido
        const g = new THREE.Group();
        g.position.y = -fa - 0.05;
        g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 5).translate(0, 0.35, 0), metal));
        g.add(mesh(new THREE.ConeGeometry(0.03, 0.22, 4).rotateZ(0.3).translate(0.03, 1.38, 0), metal));
        add(el, g);
      }
    },
    deco({ spine, root, add }) {
      const T = D.torso;
      if (tribe === 'armadura') {
        for (const s of [-1, 1]) add(spine, mesh(new THREE.BoxGeometry(0.13, 0.06, 0.16).translate(s * D.shoulderW, T - 0.02, 0), metal)); // as ombreiras
        add(spine, mesh(new THREE.BoxGeometry(0.26, 0.32, 0.14).translate(0, T * 0.55, -0.13 * G), metal)); // a mochila
        // o fuzil-lança atravessado nas costas
        add(spine, rod(0.016, 0.016, new THREE.Vector3(-0.22, T * 0.2, -0.2), new THREE.Vector3(0.24, T * 1.15, -0.2), dark, 6));
        add(root, mesh(new THREE.BoxGeometry(0.3 * G, 0.1, 0.22).translate(0, -0.03, 0), metal)); // o cinturão
      } else if (tribe === 'seco') {
        // as rachaduras no tronco (simétricas) e as faixas de pano
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) add(spine, mesh(new THREE.BoxGeometry(0.006, T * 0.22, 0.006).translate(s * (0.05 + i * 0.03), T * (0.3 + i * 0.15), 0.11 * G), dark));
        }
        add(root, mesh(new THREE.CylinderGeometry(0.17 * G, 0.19 * G, 0.18, 9, 1, true).translate(0, -0.06, 0), cloth));
      } else if (tribe === 'trabalhador') {
        // o arreio de trabalho: o colete e as barras pelos ombros
        add(spine, mesh(new THREE.BoxGeometry(0.34 * G * 0.75, T * 0.6, 0.2 * G * 0.75).translate(0, T * 0.55, 0), cloth));
        for (const s of [-1, 1]) add(spine, rod(0.018, 0.018, new THREE.Vector3(s * 0.1, T * 0.2, 0.12), new THREE.Vector3(s * 0.14, T, 0.02), metal, 5));
      } else {
        // o manto (comprimento por pessoa) e a bolsa
        const drop = lerp(0.3, 0.6, r());
        const cloak = new THREE.CylinderGeometry(0.19 * G, 0.26 * G, T + drop, 9, 1, true);
        cloak.translate(0, T - (T + drop) / 2 + 0.05, -0.01);
        add(spine, mesh(cloak, cloth));
        if (r() < 0.6) add(spine, mesh(new THREE.BoxGeometry(0.16, 0.18, 0.08).translate(0.16, T * 0.15, 0.06), cloth));
      }
    },
    strike() {},
    rest() {},
    dispose() {},
  };
  return { D, kit };
}

/** O andarilho transumano: um corpo de gente com 1–3 próteses diferentes (cada um o seu). */
export function transhumanKit(M, id) {
  const r = rngOf(id, 5);
  const h = lerp(0.95, 1.1, r());
  const D = { hip: 0.95 * h, thigh: 0.47 * h, shin: 0.45 * h, torso: 0.58 * h, shoulderW: 0.2 * h, hipW: 0.1 * h, upperArm: 0.3 * h, forearm: 0.32 * h, stride: 1.35 * h, girth: lerp(0.9, 1.15, r()) };
  const metal = M.machine;
  const cloth = M.cloth;
  const dark = M.door;
  const mechArm = r() < 0.5 ? 1 : -1;
  const both = r() < 0.25;
  const facePlate = r() < 0.55;
  const spineRig = r() < 0.5;
  const kit = {
    head(neck, add) {
      add(neck, mesh(new THREE.SphereGeometry(0.11, 12, 10).scale(0.92, 1.2, 1).translate(0, 0.2, 0.02), cloth));
      if (facePlate) add(neck, mesh(new THREE.SphereGeometry(0.105, 10, 8, Math.PI / 2, Math.PI, 0, Math.PI).scale(1.02, 1.22, 1.02).translate(0, 0.2, 0.025), metal)); // meio rosto de metal
      add(neck, mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 10).translate(0, 0.09, 0), cloth)); // a gola do manto
      add(neck, mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012).translate(facePlate ? -0.04 : 0.04, 0.22, 0.115), dark)); // o olho de lente
    },
    hand(el, s, fa, add) {
      if (s === mechArm || both) {
        add(el, mesh(new THREE.CylinderGeometry(0.045, 0.035, fa * 0.85, 8).translate(0, -fa * 0.45, 0), metal));
        const c = claw(0.12, metal);
        c.position.y = -fa;
        add(el, c);
      } else add(el, mesh(new THREE.BoxGeometry(0.055, 0.08, 0.03).translate(0, -fa - 0.04, 0), cloth));
    },
    deco({ spine, add }) {
      const T = D.torso;
      const cloak = new THREE.CylinderGeometry(0.21, 0.3, T + 0.18, 9, 1, true);
      cloak.translate(0, T - (T + 0.18) / 2 + 0.05, -0.01);
      add(spine, mesh(cloak, cloth));
      if (spineRig) for (let i = 0; i < 4; i++) add(spine, mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05).translate(0, T * (0.2 + i * 0.22), -0.13), metal)); // a coluna de máquina
    },
    strike() {},
    rest() {},
    dispose() {},
  };
  return { D, kit };
}
