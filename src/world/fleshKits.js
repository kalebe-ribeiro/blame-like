// ─────────────────────────────────────────────────────────────────────────────
//  As receitas dos corpos em malha contínua (o rework gráfico, segunda rodada — world/flesh.js).
//
//  Cada receita: as proporções (D, para o esqueleto e a animação de world/bodies.js), as camadas de
//  superfície (pele, roupa, couro) descritas por formas presas aos ossos, e as peças rígidas (garras,
//  óculos, armas) presas a eles. A malha fica no cache pela VARIANTE (poucas por tipo: o corpo); a
//  variedade de cada indivíduo vem das peças, do tamanho e do jeito (Referencias-Blame no cofre).
//
//  SAFEGUARD (o Exterminador, *Blame!*): andrógino, pálido, MUITO magro e comprido; a cintura fina, a
//  caixa torácica marcada, as costelas e a coluna aparentes sob a pele; a cabeça lisa e alongada com uma
//  máscara sem expressão (a frente achatada, dois cortes); mãos longas que terminam em garras.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash4 } from '../gen/hash.js';
import { movingMaterial } from '../shaders/materials.js';

function rngOf(id, salt) {
  let n = 0;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
  let k = 0;
  return () => hash4(n, salt, k++, 7, 911);
}
const lerp = (a, b, t) => a + (b - a) * t;
/** Um gerador pela variante (o mesmo número, o mesmo corpo). */
function rngVar(kind, v) {
  let k = 0;
  return () => hash4(kind, v, k++, 3, 577);
}

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.userData.noCollide = true;
  return m;
}

/** Uma garra: 3 dedos longos, em dois segmentos curvados para dentro, e o polegar — rígidos (a ponta dura). */
function clawFingers(el, fa, len, mat, add, s) {
  const seg = (a, b, r0, r1) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const l = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, l, 7);
    g.translate(0, l / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    return g;
  };
  const y0 = -fa - 0.085;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.019;
    const a = new THREE.Vector3(x, y0, 0.004);
    const b = new THREE.Vector3(x * 1.25, y0 - len * 0.5, 0.022);
    const c = new THREE.Vector3(x * 1.4, y0 - len, 0.07);
    add(el, mesh(seg(a, b, 0.0085, 0.0065), mat));
    add(el, mesh(seg(b, c, 0.0065, 0.0012), mat));
  }
  const ta = new THREE.Vector3(-s * 0.03, y0 + 0.03, 0.012);
  const tb = new THREE.Vector3(-s * 0.045, y0 - len * 0.32, 0.05);
  add(el, mesh(seg(ta, tb, 0.008, 0.0015), mat));
}

/**
 * O Safeguard em malha contínua (o estilo aprovado pelo usuário — o mangá, magro e pálido). Os níveis:
 * o médio mais alto e mais grosso, com as ombreiras de osso, a crista e o NÚCLEO no abdômen (uma esfera
 * quente numa moldura escura, que acende antes do golpe); o alto ainda maior, com a couraça no peito, o
 * núcleo grande e as lâminas nos antebraços.
 * → { D, kit } para buildBody (world/bodies.js).
 */
export function safeguardFlesh(level, M, id) {
  const r = rngOf(id, 1);
  const v = Math.floor(r() * 4); // a variante do corpo (a malha)
  const q = rngVar(11, v);
  const L = level === 'high' ? 2 : level === 'mid' ? 1 : 0;
  const scale = [1, 1.17, 1.42][L] * lerp(0.97, 1.04, q());
  const thin = lerp(0.88, 1.08, q());
  const G = [1, 1.18, 1.4][L]; // a grossura dos membros e do tronco
  const D = {
    hip: 1.2 * scale,
    thigh: 0.62 * scale,
    shin: 0.6 * scale,
    torso: 0.72 * scale,
    shoulderW: 0.205 * thin * scale * [1, 1.12, 1.25][L],
    hipW: 0.085 * thin * scale,
    upperArm: 0.44 * scale * lerp(0.96, 1.06, q()),
    forearm: 0.48 * scale * lerp(0.96, 1.1, q()),
    stride: 1.9 * scale,
    girth: 1,
    lean: [0.22, 0.12, 0.04][L] * lerp(0.8, 1.2, r()),
    swing: [1.35, 1.0, 0.6][L],
  };
  const headLen = lerp(1.25, 1.55, q());
  const ribs = 4 + Math.floor(q() * 2);
  const clawLen = [0.24, 0.3, 0.36][L] * lerp(0.9, 1.15, r());
  let coreMat = null;
  const skinMat = movingMaterial(M.pale);
  const dark = M.door;
  const kit = {
    head(neck, add) {
      // os dois cortes da máscara (escuros: o que a forma entalha, a cor confirma)
      for (const s of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.036, 0.007, 0.01);
        g.rotateZ(s * 0.12);
        g.translate(s * 0.032, 0.3 * headLen * 0.92, 0.099);
        add(neck, mesh(g, dark));
      }
    },
    hand(el, s, fa, add) {
      clawFingers(el, fa, clawLen, skinMat, add, s);
      if (L === 2) add(el, mesh(new THREE.BoxGeometry(0.012, fa * 0.95, 0.06).translate(s * 0.045, -fa * 0.5, -0.035), dark)); // a lâmina
    },
    deco({ spine, add }) {
      if (L < 1) return;
      // o núcleo: a esfera quente na moldura escura, embutida no abdômen (a forma tem o encaixe)
      const T = D.torso;
      const cr = L === 2 ? 0.07 : 0.05;
      coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.36).multiplyScalar(0.45) });
      const c = new THREE.SphereGeometry(cr, 14, 10).translate(0, T * 0.28, 0.07 * G);
      add(spine, mesh(c, coreMat));
      const ring = new THREE.TorusGeometry(cr * 1.18, cr * 0.3, 8, 18).translate(0, T * 0.28, 0.07 * G + 0.012);
      add(spine, mesh(ring, dark));
    },
    /** o golpe: o núcleo acende na preparação */
    strike(w) {
      if (coreMat) coreMat.color.setRGB(1.0, 0.5, 0.22).multiplyScalar(0.6 + 3 * w);
    },
    rest() {
      if (coreMat) coreMat.color.setRGB(1.0, 0.5, 0.22).multiplyScalar(0.6);
    },
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso * 1; // (o comprimento do tronco)
      return [
        {
          key: `sg2:${L}:${v}`,
          mat: skinMat,
          cell: 0.016,
          build(F) {
            const S = scale;
            // a bacia: estreita, os ossos do quadril marcados
            F.blob(root, [0, -0.02, 0], [0.11 * thin * S, 0.075 * S, 0.075 * S], 0.05);
            for (const s of [-1, 1]) F.blob(root, [s * 0.085 * thin * S, 0.02, 0.03], [0.03, 0.03, 0.035], 0.04);
            // a cintura fina (o abdômen afundado) e a caixa torácica
            F.cone(spine, [0, 0, 0.0], [0, T * 0.42, 0.01], 0.07 * thin * S * G, 0.085 * thin * S * G, 0.06);
            F.blob(spine, [0, T * 0.66, 0.0], [0.135 * thin * S * G, 0.2 * S, 0.095 * S * G], 0.06);
            // as costelas: sulcos curvos de cada lado, descendo para o esterno
            for (let i = 0; i < ribs; i++) {
              const y = T * (0.78 - i * 0.075);
              for (const s of [-1, 1]) F.carve(spine, [s * 0.14 * thin * S * G, y + 0.02, -0.01], [s * 0.035, y - 0.05, 0.1 * S * G], 0.011 * G, 0.008 * G, 0.02);
            }
            // o esterno e a clavícula; os ombros ossudos
            F.cone(spine, [0, T * 0.5, 0.075 * S * G], [0, T * 0.86, 0.075 * S * G], 0.018, 0.022, 0.03);
            for (const s of [-1, 1]) {
              F.cone(spine, [s * 0.02, T * 0.93, 0.04], [s * D.shoulderW * 0.95, T - 0.05, 0.0], 0.028, 0.03, 0.04);
              F.blob(spine, [s * D.shoulderW, T - 0.06, -0.005], [0.05, 0.045, 0.05], 0.05);
              // as omoplatas
              F.blob(spine, [s * 0.075 * thin * S, T * 0.78, -0.07 * S], [0.06, 0.08, 0.025], 0.05);
            }
            // a coluna: as vértebras saltando nas costas
            for (let i = 0; i < 9; i++) F.blob(spine, [0, T * (0.05 + i * 0.105), -0.075 * S * G - (i > 4 ? 0.01 : 0)], [0.016 * G, 0.022, 0.018 * G], 0.03);
            // o pescoço comprido e fino
            F.cone(neck, [0, -0.03, -0.01], [0, 0.17, 0.0], 0.038, 0.032, 0.05);
            F.cone(neck, [0, 0.0, 0.02], [0, 0.14, 0.03], 0.014, 0.012, 0.03); // (a traqueia)
            // a cabeça: lisa, alongada para cima e para trás; a máscara achatada na frente
            F.blob(neck, [0, 0.27 * headLen * 0.92, -0.01], [0.088, 0.15 * headLen * 0.75, 0.105], 0.05);
            F.blob(neck, [0, 0.3 * headLen, -0.05], [0.075, 0.09 * headLen, 0.09], 0.05); // (o crânio puxado para trás)
            F.carveBlob(neck, [0, 0.27 * headLen * 0.92, 0.215], [0.2, 0.26, 0.11], 0.03); // a face plana
            F.blob(neck, [0, 0.18 * headLen, 0.06], [0.05, 0.035, 0.04], 0.03); // o queixo estreito
            for (const s of [-1, 1]) F.carve(neck, [s * 0.012, 0.3 * headLen * 0.92, 0.102], [s * 0.052, 0.3 * headLen * 0.92 + s * 0.004, 0.096], 0.006, 0.005, 0.008);
            // os braços: magros e longos, o cotovelo ossudo, o antebraço achatado
            for (const A of arms) {
              const ua = A.el.position.y * -1;
              const fa = D.forearm;
              F.cone(A.sh, [0, 0.0, 0], [0, -ua, 0], 0.042 * G, 0.03 * G, 0.05);
              F.blob(A.sh, [0, -ua * 0.35, 0.005], [0.04 * G, ua * 0.28, 0.042 * G], 0.05); // (o deltoide e o bíceps secos)
              F.blob(A.el, [0, 0, -0.02], [0.028, 0.03, 0.03], 0.04); // o cotovelo
              F.cone(A.el, [0, 0, 0], [0, -fa, 0.0], 0.034 * G, 0.022 * G, 0.04);
              F.blob(A.el, [0, -fa * 0.25, 0], [0.038 * G, fa * 0.22, 0.03 * G], 0.05);
              // a mão comprida e estreita (os dedos são as garras, rígidas)
              F.blob(A.el, [0, -fa - 0.045, 0.004], [0.032, 0.05, 0.015], 0.03);
            }
            // as pernas: coxas finas, joelhos marcados, canelas longas, pés compridos
            for (const Lg of legs) {
              const th = D.thigh, sh = D.shin;
              F.blob(Lg.hp, [0, -0.02, 0], [0.055, 0.05, 0.055], 0.05);
              F.cone(Lg.hp, [0, 0, 0], [0, -th, 0.0], 0.06 * thin * G, 0.04 * G, 0.05);
              F.blob(Lg.hp, [0, -th * 0.35, 0.012], [0.058 * thin * G, th * 0.28, 0.06 * G], 0.05);
              F.blob(Lg.kn, [0, 0.0, 0.025], [0.035, 0.035, 0.03], 0.04); // a patela
              F.cone(Lg.kn, [0, 0, 0], [0, -sh, 0], 0.04 * G, 0.026 * G, 0.04);
              F.blob(Lg.kn, [0, -sh * 0.25, -0.02], [0.038 * G, sh * 0.2, 0.04 * G], 0.05); // a panturrilha seca
              F.blob(Lg.an, [0, -0.02, -0.01], [0.03, 0.035, 0.035], 0.03); // o calcanhar
              F.cone(Lg.an, [0, -0.035, 0.0], [0, -0.05, 0.2], 0.032, 0.018, 0.04); // o pé comprido
              for (let t = -1; t <= 1; t++) F.cone(Lg.an, [t * 0.014, -0.05, 0.18], [t * 0.02, -0.058, 0.25], 0.011, 0.008, 0.015); // os dedos
            }
            if (L >= 1) {
              // as ombreiras de osso (cascas lisas sobre os ombros), a crista do crânio, o encaixe do núcleo
              for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW * 1.02, T - 0.03, -0.005], [0.085 * G, 0.055, 0.09 * G], 0.04);
              for (let i = 0; i < 5; i++) F.blob(neck, [0, 0.3 * headLen + 0.02 - i * 0.035, -0.06 - i * 0.03], [0.012, 0.03, 0.03], 0.02);
              F.carveBlob(spine, [0, T * 0.28, 0.07 * G], [L === 2 ? 0.09 : 0.065, L === 2 ? 0.09 : 0.065, 0.05], 0.015);
            }
            if (L === 2) {
              // a couraça do peito (aberta embaixo, onde fica o núcleo) e a placa da bacia
              F.blob(spine, [0, T * 0.72, 0.04], [0.17 * thin * S, 0.16 * S, 0.1 * S], 0.03);
              F.carve(spine, [-0.2, T * 0.6, 0.15 * S], [0.2, T * 0.6, 0.15 * S], 0.01, 0.01, 0.01);
              F.blob(root, [0, 0.0, 0.03], [0.15 * S, 0.08, 0.1 * S], 0.03);
            }
          },
        },
      ];
    },
    dispose() {
      coreMat?.dispose();
    },
  };
  return { D, kit };
}


// ── peças rígidas ────────────────────────────────────────────────────────────

/** Um cilindro que afina de a (raio r0) até b (raio r1) — a geometria já no lugar (espaço do osso). */
function seg(a, b, r0, r1, n = 8) {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(A);
  const l = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, l, n);
  g.translate(0, l / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}
/** Os óculos enormes (os humanos caricatos): dois aros grossos e as lentes escuras. */
function goggles(neck, add, y, z, size, metal, dark) {
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.036 * size, 0.04 * size, 0.03, 14);
    g.rotateX(Math.PI / 2);
    g.translate(s * 0.045 * size, y, z);
    add(neck, mesh(g, metal));
    const lens = new THREE.CircleGeometry(0.029 * size, 14);
    lens.translate(s * 0.045 * size, y, z + 0.0155);
    add(neck, mesh(lens, dark));
  }
}

// ── as partes comuns dos caricatos (formas numa camada F, os ossos de J) ─────

/** As pernas (as calças): coxa e canela, de raios r0 → r1. */
function legsOf(F, J, D, r0, r1, wide = 1) {
  F.blob(J.root, [0, -0.04, 0], [0.11 * wide, 0.07, 0.08], 0.04);
  for (const Lg of J.legs) {
    F.cone(Lg.hp, [0, 0.0, 0], [0, -D.thigh, 0.0], r0, (r0 + r1) / 2, 0.03);
    F.cone(Lg.kn, [0, 0, 0], [0, -D.shin * 0.75, 0], (r0 + r1) / 2, r1, 0.03);
  }
}
/** As botas grandes e arredondadas (size: a escala). */
function bootsOf(F, J, D, size = 1) {
  for (const Lg of J.legs) {
    F.cone(Lg.kn, [0, -D.shin * 0.55, 0], [0, -D.shin, 0.0], 0.056 * size, 0.062 * size, 0.03);
    F.blob(Lg.an, [0, -0.035, 0.04], [0.065 * size, 0.055 * size, 0.115 * size], 0.04);
    F.cut(Lg.an, [0, -0.075, 0], [0, -1, 0], 0.01);
  }
}
/** As mãos em luva grossa (mitenes com o polegar). sides: quais braços (s). */
function mittensOf(F, J, D, size = 1, sides = [-1, 1]) {
  for (const A of J.arms) {
    if (!sides.includes(A.s) || A.extra) continue;
    const fa = D.forearm;
    F.blob(A.el, [0, -fa - 0.04 * size, 0.008], [0.042 * size, 0.055 * size, 0.03 * size], 0.03);
    F.cone(A.el, [-A.s * 0.028 * size, -fa - 0.02, 0.02], [-A.s * 0.045 * size, -fa - 0.06 * size, 0.045 * size], 0.016 * size, 0.014 * size, 0.02);
  }
}
/** As mangas (r0 no ombro, r1 no cotovelo, r2 no punho). sides: quais braços. */
function sleevesOf(F, J, D, r0, r1, r2, sides = [-1, 1], len = 0.92) {
  for (const A of J.arms) {
    if (!sides.includes(A.s) || A.extra) continue;
    const ua = -A.el.position.y;
    F.cone(A.sh, [0, 0.0, 0], [0, -ua, 0], r0, r1, 0.03);
    F.cone(A.el, [0, 0.01, 0], [0, -D.forearm * len, 0.0], r1, r2, 0.03);
  }
}
/** A cabeça redonda (o rosto quase sem feições — os óculos ou o capacete fazem o rosto). */
function headOf(F, neck, HR, y = 0.18) {
  F.blob(neck, [0, y, 0.012], [HR * 0.9, HR * 0.95, HR * 0.92], 0.03);
  F.blob(neck, [0, y - 0.015, HR * 0.9], [0.018, 0.016, 0.016], 0.02); // o nariz (um botão)
}
/** Um membro de máquina (a prótese, a vida de silício): segmentos de metal com as juntas em bola. */
function mechArm(F, A, D, r = 0.04) {
  const ua = -A.el.position.y;
  F.blob(A.sh, [0, 0.0, 0], [r * 1.5, r * 1.4, r * 1.5], 0.02); // o encaixe do ombro
  F.cone(A.sh, [0, -0.03, 0], [0, -ua + 0.03, 0], r, r * 0.85, 0.01);
  F.blob(A.el, [0, 0, 0], [r * 1.1, r * 1.1, r * 1.1], 0.01); // o cotovelo
  F.cone(A.el, [0, -0.03, 0], [0, -D.forearm + 0.02, 0], r * 0.9, r * 1.05, 0.01);
  F.blob(A.el, [0, -D.forearm + 0.01, 0], [r * 1.15, r * 0.6, r * 1.15], 0.01); // o punho
}
/** A pinça de máquina (rígida): dois dedos grossos que se fecham. */
function clamp(el, D, add, metal, size = 1) {
  const y = -D.forearm - 0.02;
  for (const s of [-1, 1]) {
    add(el, mesh(seg([s * 0.025 * size, y, 0], [s * 0.04 * size, y - 0.08 * size, 0.01], 0.016 * size, 0.012 * size, 6), metal));
    add(el, mesh(seg([s * 0.04 * size, y - 0.08 * size, 0.01], [s * 0.012 * size, y - 0.13 * size, 0.02], 0.012 * size, 0.006 * size, 6), metal));
  }
}

/**
 * Os humanos — CARICATOS (o usuário, 2026-10-09: "nao precisa tentar ir pro lado realista… um approach
 * mais caricato/cartoon"; as roupas sem cor por enquanto). Um povo por vila (world/kits.js tribeOf),
 * cada um com a sua silhueta:
 *   abrigado     a cabeça grande num capuz pontudo, óculos enormes, casaco em sino, luvas, botas
 *   armadura     (eletropescadores/tecnômades) baixo e estufado: capacete redondo com o visor, ombreiras
 *                redondas, peitoral, o tanque nas costas e o fuzil-lança atravessado
 *   seco         (Homens Secos) comprido e magro, curvado: a cabeça em ovo com órbitas fundas, as
 *                rachaduras simétricas na pele, panos enrolados, pés e mãos grandes, a lança retorcida
 *   trabalhador  grandalhão: o tronco em barril, a cabeça pequena de capacete, braços enormes — um (ou
 *                os dois) de máquina com pinça —, macacão e avental, botas enormes
 * → { D, kit }
 */
export function humanFlesh(tribe, M, id) {
  if (tribe === 'armadura') return armorFlesh(M, id);
  if (tribe === 'seco') return dryFlesh(M, id);
  if (tribe === 'trabalhador') return laborerFlesh(M, id);
  return shelteredFlesh(M, id);
}

/** Os materiais dos corpos (o desenho preso ao corpo). */
function mats(M) {
  return {
    skin: movingMaterial(M.skin),
    pale: movingMaterial(M.pale),
    coat: movingMaterial(M.garb),
    dim: movingMaterial(M.mantle),
    leather: movingMaterial(M.leather),
    metal: movingMaterial(M.machine),
    rigid: M.machine,
    dark: M.door,
  };
}

function shelteredFlesh(M, id) {
  const r = rngOf(id, 3);
  const v = Math.floor(r() * 4);
  const q = rngVar(29, v);
  const h = lerp(0.95, 1.06, q());
  const wide = lerp(0.92, 1.15, q());
  const D = {
    hip: 0.74 * h, thigh: 0.33 * h, shin: 0.31 * h, torso: 0.42 * h, shoulderW: 0.15 * wide, hipW: 0.075 * wide,
    upperArm: 0.23 * h, forearm: 0.21 * h, stride: 1.05 * h, girth: 1, lean: 0.12, swing: 0.9,
  };
  const X = mats(M);
  const coatLen = lerp(0.12, 0.26, q());
  const scarf = v !== 1;
  const pack = v === 0 || v === 3;
  const resp = r() < 0.4;
  const HR = 0.115;
  const K = (n) => `hu2:abrigado:${n}:${v}`;
  const kit = {
    head(neck, add) {
      goggles(neck, add, 0.2, HR * 0.92, 1, X.rigid, X.dark);
      if (resp) {
        const g = new THREE.CylinderGeometry(0.035, 0.045, 0.06, 10);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0.125, HR * 0.85);
        add(neck, mesh(g, X.rigid));
        const f = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12);
        f.rotateX(Math.PI / 2);
        f.translate(0, 0.125, HR * 0.85 + 0.04);
        add(neck, mesh(f, X.dark));
      }
    },
    hand() {},
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck } = J;
      const T = D.torso;
      const layers = [
        { key: K('skin'), mat: X.skin, cell: 0.016, build: (F) => headOf(F, neck, HR) },
        { key: K('gloves'), mat: X.leather, cell: 0.014, build: (F) => mittensOf(F, J, D) },
        {
          // o casaco em sino, a fenda da frente, os botões, o cachecol; as mangas que abrem no punho
          key: K('coat'),
          mat: X.coat,
          cell: 0.018,
          build(F) {
            F.blob(spine, [0, T * 0.62, 0], [0.15 * wide, T * 0.5, 0.115], 0.06);
            F.cone(spine, [0, T * 0.6, -0.005], [0, -0.02, -0.01], 0.15 * wide, 0.165 * wide, 0.06);
            F.cone(root, [0, 0.02, -0.01], [0, -coatLen, -0.02], 0.165 * wide, 0.215 * wide, 0.06);
            F.cut(root, [0, -coatLen + 0.01, 0], [0, -1, 0], 0.012);
            F.carve(root, [0, -coatLen - 0.05, 0.22], [0, -0.02, 0.17], 0.035, 0.012, 0.02);
            F.carveBlob(root, [0, -coatLen, 0], [0.11 * wide, 0.12, 0.1], 0.02);
            for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW, T - 0.05, 0], [0.055, 0.05, 0.06], 0.05);
            for (let i = 0; i < 3; i++) F.blob(spine, [0.03, T * (0.25 + i * 0.22), 0.118], [0.014, 0.014, 0.01], 0.006);
            if (scarf) {
              for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                F.blob(neck, [Math.sin(a) * 0.075, 0.02 + (i % 2) * 0.012, Math.cos(a) * 0.07 - 0.005], [0.042, 0.04, 0.042], 0.03);
              }
              F.cone(spine, [0.05, T, 0.1], [0.07, T * 0.55, 0.13], 0.03, 0.035, 0.03);
            }
            sleevesOf(F, J, D, 0.048, 0.045, 0.058);
            for (const A of J.arms) F.carveBlob(A.el, [0, -D.forearm * 0.95, 0], [0.04, 0.05, 0.04], 0.01);
          },
        },
        {
          // o capuz pontudo, a ponta caindo para trás
          key: K('hood'),
          mat: X.dim,
          cell: 0.016,
          build(F) {
            F.blob(neck, [0, 0.19, -0.005], [HR + 0.03, HR + 0.035, HR + 0.03], 0.04);
            F.cone(neck, [0, 0.24, -0.06], [0, 0.29 + 0.03 * v, -0.2], 0.075, 0.018, 0.06);
            F.blob(neck, [0, 0.03, -0.02], [0.13 * wide, 0.05, 0.11], 0.05);
            F.carveBlob(neck, [0, 0.18, HR + 0.05], [HR * 0.82, HR * 0.9, 0.08], 0.015);
            F.carveBlob(neck, [0, 0.18, 0.01], [HR + 0.005, HR + 0.01, HR + 0.005], 0.01);
          },
        },
        { key: K('legs'), mat: X.coat, cell: 0.016, build: (F) => legsOf(F, J, D, 0.055, 0.04, wide) },
        { key: K('boots'), mat: X.leather, cell: 0.016, build: (F) => bootsOf(F, J, D) },
      ];
      if (pack)
        layers.push({
          key: K('pack'),
          mat: X.dim,
          cell: 0.018,
          build(F) {
            F.blob(spine, [0, T * 0.5, -0.19], [0.13 * wide, 0.15, 0.08], 0.03);
            F.cone(spine, [-0.15 * wide, T * 0.75, -0.2], [0.15 * wide, T * 0.75, -0.2], 0.055, 0.055, 0.01);
          },
        });
      return layers;
    },
    dispose() {},
  };
  return { D, kit };
}

function armorFlesh(M, id) {
  const r = rngOf(id, 5);
  const v = Math.floor(r() * 4);
  const q = rngVar(31, v);
  const h = lerp(0.95, 1.05, q());
  const wide = lerp(1.0, 1.18, q());
  const D = {
    hip: 0.76 * h, thigh: 0.34 * h, shin: 0.32 * h, torso: 0.44 * h, shoulderW: 0.21 * wide, hipW: 0.085 * wide,
    upperArm: 0.24 * h, forearm: 0.22 * h, stride: 1.1 * h, girth: 1, lean: 0.04, swing: 0.55, armOut: 0.16,
  };
  const X = mats(M);
  const HR = 0.1;
  const antenna = r() < 0.5;
  const tank = v !== 2;
  const K = (n) => `hu2:armadura:${n}:${v}`;
  const kit = {
    head(neck, add) {
      // o visor: uma faixa escura atravessando o capacete; às vezes a antena
      const g = new THREE.CylinderGeometry(HR + 0.052, HR + 0.052, 0.035, 20, 1, true, -0.95, 1.9);
      g.translate(0, 0.19, 0.0);
      add(neck, mesh(g, X.dark));
      if (antenna) add(neck, mesh(seg([0.09, 0.26, -0.03], [0.12, 0.5, -0.06], 0.006, 0.003, 5), X.rigid));
    },
    hand() {},
    strike() {},
    rest() {},
    deco({ spine, add }) {
      // o fuzil-lança atravessado nas costas: o cano longo, a coronha, as duas lanças
      const T = D.torso;
      add(spine, mesh(seg([-0.25, T * 0.1, -0.2], [0.3, T * 1.25, -0.2], 0.018, 0.014, 8), X.rigid));
      add(spine, mesh(seg([-0.18, T * 0.25, -0.215], [-0.05, T * 0.55, -0.215], 0.04, 0.035, 6), X.dark));
      for (const s of [-1, 1]) add(spine, mesh(seg([0.3 + s * 0.012, T * 1.25, -0.2], [0.36 + s * 0.012, T * 1.42, -0.2], 0.007, 0.001, 5), X.rigid));
    },
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso;
      const layers = [
        {
          // o macacão acolchoado por baixo da armadura
          key: K('suit'),
          mat: X.coat,
          cell: 0.018,
          build(F) {
            F.blob(spine, [0, T * 0.68, 0], [0.16 * wide, T * 0.36, 0.11], 0.05); // o peito largo
            F.cone(spine, [0, T * 0.5, 0], [0, 0.0, 0], 0.13 * wide, 0.11 * wide, 0.05); // a cintura
            F.blob(root, [0, -0.02, 0], [0.12 * wide, 0.09, 0.09], 0.05);
            sleevesOf(F, J, D, 0.055, 0.05, 0.05, [-1, 1], 0.8);
            legsOf(F, J, D, 0.068, 0.055, wide);
          },
        },
        {
          // a armadura: o capacete redondo, o peitoral, as ombreiras redondas, as manoplas, as joelheiras
          key: K('armor'),
          mat: X.metal,
          cell: 0.016,
          build(F) {
            F.blob(neck, [0, 0.18, 0.0], [HR + 0.05, HR + 0.05, HR + 0.055], 0.03); // o capacete
            F.blob(neck, [0, 0.07, -0.01], [0.09, 0.05, 0.085], 0.03); // a gola do capacete
            F.blob(spine, [0, T * 0.7, 0.06], [0.15 * wide, T * 0.3, 0.075], 0.03); // o peitoral (só na frente)
            F.carve(spine, [-0.2, T * 0.7, 0.14], [0.2, T * 0.7, 0.14], 0.01, 0.01, 0.008); // (a junta das placas)
            F.blob(spine, [0, T * 0.68, -0.06], [0.14 * wide, T * 0.28, 0.06], 0.03); // a placa das costas
            for (const A of arms) {
              F.blob(A.sh, [0, 0.0, 0], [0.085, 0.07, 0.085], 0.02); // a ombreira redonda
              F.cone(A.el, [0, -0.03, 0], [0, -D.forearm * 0.9, 0], 0.058, 0.066, 0.02); // a manopla
              F.blob(A.el, [0, -D.forearm - 0.035, 0.005], [0.048, 0.055, 0.035], 0.02); // a mão blindada
            }
            for (const Lg of legs) F.blob(Lg.kn, [0, 0.0, 0.04], [0.055, 0.06, 0.035], 0.015); // a joelheira
            bootsOf(F, J, D, 1.12);
          },
        },
        {
          // o cinturão com as bolsas e, às vezes, o tanque nas costas
          key: K('gear'),
          mat: X.leather,
          cell: 0.016,
          build(F) {
            F.cone(root, [0, 0.03, 0], [0, -0.03, 0], 0.16 * wide, 0.165 * wide, 0.01);
            for (const s of [-1, 1]) F.blob(root, [s * 0.12 * wide, -0.02, 0.09], [0.04, 0.045, 0.035], 0.01);
            if (tank) F.cone(spine, [0, T * 0.2, -0.17], [0, T * 0.85, -0.17], 0.075, 0.075, 0.02);
          },
        },
      ];
      return layers;
    },
    dispose() {},
  };
  return { D, kit };
}

function dryFlesh(M, id) {
  const r = rngOf(id, 6);
  const v = Math.floor(r() * 4);
  const q = rngVar(37, v);
  const h = lerp(0.96, 1.08, q());
  const D = {
    hip: 0.96 * h, thigh: 0.46 * h, shin: 0.46 * h, torso: 0.46 * h, shoulderW: 0.14, hipW: 0.07,
    upperArm: 0.33 * h, forearm: 0.33 * h, stride: 1.5 * h, girth: 1, lean: 0.28, swing: 1.3,
  };
  const X = mats(M);
  const HR = 0.09;
  const K = (n) => `hu2:seco:${n}:${v}`;
  const kit = {
    head() {},
    hand(el, s, fa, add) {
      // a lança de metal retorcido, na mão direita (de pé ao lado do corpo)
      if (s < 0) return;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 6;
        const b = ((i + 1) / n) * Math.PI * 6;
        const y0 = -fa - 0.05 + 0.75 - i * 0.12;
        add(el, mesh(seg([Math.cos(a) * 0.012, y0, 0.03 + Math.sin(a) * 0.012], [Math.cos(b) * 0.012, y0 - 0.12, 0.03 + Math.sin(b) * 0.012], 0.011, 0.011, 5), X.rigid));
      }
      add(el, mesh(seg([0, -fa - 0.05 + 0.75, 0.03], [0, -fa + 0.95, 0.03], 0.016, 0.001, 5), X.rigid)); // a ponta
    },
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso;
      return [
        {
          // a pele: magra e comprida, a cabeça em ovo com as órbitas fundas e a boca rasgada; as
          // rachaduras simétricas (no rosto, no peito, nos braços); mãos e pés grandes
          key: K('skin'),
          mat: X.skin,
          cell: 0.014,
          build(F) {
            F.blob(neck, [0, 0.2, 0.0], [HR, HR * 1.45, HR * 1.05], 0.03); // a cabeça em ovo
            F.cone(neck, [0, -0.02, -0.01], [0, 0.1, 0.0], 0.035, 0.03, 0.03);
            for (const s of [-1, 1]) {
              F.carveBlob(neck, [s * 0.035, 0.225, 0.085], [0.028, 0.035, 0.03], 0.012); // as órbitas fundas
              F.carve(neck, [s * 0.035, 0.19, 0.093], [s * 0.05, 0.1, 0.07], 0.004, 0.003, 0.004); // a rachadura do rosto
              F.carve(spine, [s * 0.02, T * 0.95, 0.075], [s * 0.1, T * 0.35, 0.07], 0.005, 0.004, 0.004); // as do peito
            }
            F.carve(neck, [-0.035, 0.115, 0.085], [0.035, 0.115, 0.085], 0.006, 0.006, 0.006); // a boca
            F.blob(spine, [0, T * 0.62, 0], [0.12, T * 0.45, 0.08], 0.05); // o peito estreito
            F.cone(spine, [0, T * 0.4, -0.005], [0, -0.02, 0], 0.08, 0.075, 0.05); // a barriga funda
            F.blob(root, [0, -0.01, 0], [0.09, 0.07, 0.07], 0.04);
            for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW, T - 0.04, 0], [0.04, 0.035, 0.04], 0.04);
            for (const A of arms) {
              const ua = -A.el.position.y;
              F.cone(A.sh, [0, 0, 0], [0, -ua, 0], 0.03, 0.025, 0.03);
              F.blob(A.el, [0, 0, -0.01], [0.028, 0.028, 0.028], 0.02);
              F.cone(A.el, [0, 0, 0], [0, -D.forearm, 0], 0.026, 0.022, 0.03);
              F.carve(A.el, [-0.03, -D.forearm * 0.4, 0.02], [0.03, -D.forearm * 0.5, 0.02], 0.004, 0.004, 0.004);
              // a mão grande, os dedos compridos
              F.blob(A.el, [0, -D.forearm - 0.045, 0.006], [0.04, 0.055, 0.018], 0.02);
              for (let i = 0; i < 4; i++) F.cone(A.el, [(i - 1.5) * 0.018, -D.forearm - 0.09, 0.01], [(i - 1.5) * 0.024, -D.forearm - 0.16, 0.035], 0.008, 0.006, 0.01);
            }
            for (const Lg of legs) {
              F.cone(Lg.hp, [0, 0, 0], [0, -D.thigh, 0], 0.045, 0.032, 0.03);
              F.blob(Lg.kn, [0, 0, 0.012], [0.033, 0.035, 0.033], 0.02);
              F.cone(Lg.kn, [0, 0, 0], [0, -D.shin, 0], 0.032, 0.024, 0.03);
              F.cone(Lg.an, [0, -0.035, -0.03], [0, -0.05, 0.15], 0.04, 0.03, 0.03); // o pé grande e chato
              F.cut(Lg.an, [0, -0.075, 0], [0, -1, 0], 0.008);
            }
          },
        },
        {
          // os panos enrolados: a tanga, a faixa atravessada no peito, as tiras nos antebraços e canelas
          key: K('wraps'),
          mat: X.coat,
          cell: 0.014,
          build(F) {
            F.cone(root, [0, 0.02, 0], [0, -0.14, 0.0], 0.1, 0.12, 0.03);
            F.cut(root, [0, -0.13, 0], [0, -1, 0], 0.01);
            F.carveBlob(root, [0, -0.15, 0.0], [0.07, 0.08, 0.09], 0.01);
            F.cone(spine, [-D.shoulderW, T * 0.98, 0.0], [0.1, T * 0.1, 0.0], 0.09, 0.085, 0.02);
            F.carveBlob(spine, [0, T * 0.55, 0], [0.12, T * 0.6, 0.078], 0.004); // (rente ao corpo)
            for (const A of arms) for (let i = 0; i < 3; i++) F.blob(A.el, [0, -D.forearm * (0.45 + i * 0.13), 0], [0.031, 0.022, 0.031], 0.01);
            for (const Lg of legs) for (let i = 0; i < 3; i++) F.blob(Lg.kn, [0, -D.shin * (0.5 + i * 0.13), 0], [0.035, 0.024, 0.035], 0.01);
          },
        },
      ];
    },
    dispose() {},
  };
  return { D, kit };
}

function laborerFlesh(M, id) {
  const r = rngOf(id, 7);
  const v = Math.floor(r() * 4);
  const q = rngVar(41, v);
  const h = lerp(1.0, 1.1, q());
  const wide = lerp(1.0, 1.2, q());
  const D = {
    hip: 0.8 * h, thigh: 0.36 * h, shin: 0.33 * h, torso: 0.56 * h, shoulderW: 0.3 * wide, hipW: 0.1 * wide,
    upperArm: 0.3 * h, forearm: 0.3 * h, stride: 1.2 * h, girth: 1, lean: 0.1, swing: 0.7, armOut: 0.2,
  };
  const X = mats(M);
  const HR = 0.085;
  const mech = v === 3 ? [-1, 1] : [1]; // os braços de máquina
  const flesh = [-1, 1].filter((s) => !mech.includes(s));
  const K = (n) => `hu2:trabalhador:${n}:${v}`;
  const kit = {
    head(neck, add) {
      goggles(neck, add, 0.19, HR * 0.95, 0.8, X.rigid, X.dark);
    },
    hand(el, s, fa, add) {
      if (mech.includes(s)) clamp(el, D, add, X.rigid, 1.4);
    },
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, arms } = J;
      const T = D.torso;
      return [
        {
          // a cabeça pequena, o pescoço grosso, a mão de carne (grande)
          key: K('skin'),
          mat: X.skin,
          cell: 0.014,
          build(F) {
            headOf(F, neck, HR, 0.17);
            F.cone(neck, [0, -0.03, 0], [0, 0.1, 0.0], 0.07, 0.06, 0.03);
            for (const A of arms) if (flesh.includes(A.s)) F.blob(A.el, [0, -D.forearm * 0.6, 0], [0.05, D.forearm * 0.3, 0.05], 0.03); // o antebraço grosso
          },
        },
        { key: K('gloves'), mat: X.leather, cell: 0.016, build: (F) => mittensOf(F, J, D, 1.35, flesh) },
        {
          // o macacão: o tronco em barril, os ombros largos, as mangas arregaçadas, as pernas grossas
          key: K('overalls'),
          mat: X.coat,
          cell: 0.018,
          build(F) {
            F.blob(spine, [0, T * 0.55, 0.02], [0.2 * wide, T * 0.5, 0.16], 0.06); // o barril
            F.cone(spine, [-D.shoulderW, T - 0.06, 0], [D.shoulderW, T - 0.06, 0], 0.075, 0.075, 0.05); // os ombros largos
            F.blob(root, [0, -0.03, 0.01], [0.17 * wide, 0.11, 0.13], 0.06);
            for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW * 0.9, T - 0.06, 0], [0.09, 0.07, 0.08], 0.05);
            sleevesOf(F, J, D, 0.07, 0.065, 0.065, flesh, 0.25);
            legsOf(F, J, D, 0.08, 0.065, wide);
          },
        },
        {
          // o avental de couro na frente, as botas enormes
          key: K('apron'),
          mat: X.leather,
          cell: 0.016,
          build(F) {
            F.blob(spine, [0, T * 0.45, 0.13], [0.15 * wide, T * 0.55, 0.06], 0.02);
            F.blob(root, [0, -0.1, 0.12], [0.14 * wide, 0.15, 0.05], 0.02);
            F.cut(root, [0, -0.24, 0], [0, -1, 0], 0.01);
            F.carveBlob(spine, [0, T * 0.5, 0.02], [0.19 * wide, T * 0.53, 0.155], 0.005);
            bootsOf(F, J, D, 1.3);
          },
        },
        {
          // o braço de máquina (às vezes os dois)
          key: K('machine'),
          mat: X.metal,
          cell: 0.016,
          build(F) {
            for (const A of arms) if (mech.includes(A.s)) mechArm(F, A, D, 0.055);
          },
        },
        {
          // o capacete de obra, com a aba (à parte: o corte de baixo dele não pega o resto)
          key: K('helmet'),
          mat: X.metal,
          cell: 0.014,
          build(F) {
            F.blob(neck, [0, 0.215, 0.0], [HR + 0.035, 0.065, HR + 0.04], 0.02);
            F.cut(neck, [0, 0.18, 0], [0, -1, 0], 0.006);
            F.blob(neck, [0, 0.185, 0.02], [HR + 0.06, 0.012, HR + 0.07], 0.01); // a aba
          },
        },
      ];
    },
    dispose() {},
  };
  return { D, kit };
}

/**
 * O andarilho transumano — caricato: o viajante de casaco comprido e capuz baixado, com 1–3 próteses
 * próprias (o braço de máquina com a pinça — às vezes os dois —, a perna de máquina, o meio rosto de
 * metal) e o olho de lente. As próteses vêm da identidade (a malha, pela combinação delas).
 */
export function transhumanFlesh(M, id) {
  const r = rngOf(id, 8);
  const armR = r() < 0.75;
  const armL = !armR || r() < 0.3;
  const legP = r() < 0.4;
  const face = r() < 0.6;
  const v = (armR ? 1 : 0) + (armL ? 2 : 0) + (legP ? 4 : 0);
  const q = rngVar(43, v);
  const h = lerp(1.0, 1.08, q());
  const D = {
    hip: 0.8 * h, thigh: 0.36 * h, shin: 0.34 * h, torso: 0.45 * h, shoulderW: 0.155, hipW: 0.08,
    upperArm: 0.25 * h, forearm: 0.23 * h, stride: 1.2 * h, girth: 1, lean: 0.18, swing: 1.0,
  };
  const X = mats(M);
  const HR = 0.105;
  const mechSides = [...(armR ? [1] : []), ...(armL ? [-1] : [])];
  const fleshSides = [-1, 1].filter((s) => !mechSides.includes(s));
  const K = (n) => `tr2:${n}:${v}`;
  const kit = {
    head(neck, add) {
      // o olho de lente (do lado da placa, se houver)
      const g = new THREE.CylinderGeometry(0.024, 0.03, 0.05, 12);
      g.rotateX(Math.PI / 2);
      g.translate(0.04, 0.19, HR * 0.95);
      add(neck, mesh(g, X.rigid));
      const lens = new THREE.CircleGeometry(0.02, 12);
      lens.translate(0.04, 0.19, HR * 0.95 + 0.026);
      add(neck, mesh(lens, X.dark));
      if (face) {
        // o meio rosto de metal
        const p = new THREE.SphereGeometry(HR * 0.97, 14, 10, Math.PI / 2, Math.PI / 2, Math.PI * 0.15, Math.PI * 0.7);
        p.translate(0, 0.175, 0.014);
        add(neck, mesh(p, X.rigid));
      }
    },
    hand(el, s, fa, add) {
      if (mechSides.includes(s)) clamp(el, D, add, X.rigid, 1.1);
    },
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, legs } = J;
      const T = D.torso;
      return [
        {
          key: K('skin'),
          mat: X.skin,
          cell: 0.016,
          build(F) {
            headOf(F, neck, HR);
            F.cone(neck, [0, -0.02, 0], [0, 0.1, 0.0], 0.045, 0.04, 0.03);
          },
        },
        { key: K('gloves'), mat: X.leather, cell: 0.014, build: (F) => mittensOf(F, J, D, 1, fleshSides) },
        {
          // o casaco comprido (até o joelho), aberto na frente; o capuz baixado; as mangas só nos braços de carne
          key: K('coat'),
          mat: X.coat,
          cell: 0.018,
          build(F) {
            F.blob(spine, [0, T * 0.62, 0], [0.145, T * 0.5, 0.11], 0.05);
            F.cone(spine, [0, T * 0.6, -0.005], [0, -0.02, -0.01], 0.14, 0.155, 0.05);
            F.cone(root, [0, 0.02, -0.01], [0, -D.thigh - 0.06, -0.04], 0.155, 0.23, 0.05);
            F.cut(root, [0, -D.thigh - 0.05, 0], [0, -1, 0], 0.012);
            F.carve(root, [0, -D.thigh - 0.12, 0.24], [0, 0.0, 0.17], 0.06, 0.02, 0.02);
            F.carveBlob(root, [0, -D.thigh, 0], [0.12, 0.3, 0.11], 0.02);
            for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW, T - 0.05, 0], [0.055, 0.05, 0.06], 0.05);
            F.blob(neck, [0, 0.0, -0.06], [0.13, 0.06, 0.07], 0.04); // o capuz baixado
            sleevesOf(F, J, D, 0.05, 0.046, 0.05, fleshSides);
          },
        },
        {
          key: K('legs'),
          mat: X.coat,
          cell: 0.016,
          build(F) {
            F.blob(root, [0, -0.04, 0], [0.1, 0.07, 0.08], 0.04);
            for (const [i, Lg] of legs.entries()) {
              F.cone(Lg.hp, [0, 0, 0], [0, -D.thigh, 0], 0.055, 0.047, 0.03);
              if (!(legP && i === 0)) F.cone(Lg.kn, [0, 0, 0], [0, -D.shin * 0.75, 0], 0.047, 0.04, 0.03);
            }
          },
        },
        {
          key: K('boots'),
          mat: X.leather,
          cell: 0.016,
          build(F) {
            for (const [i, Lg] of legs.entries()) {
              if (legP && i === 0) continue;
              F.cone(Lg.kn, [0, -D.shin * 0.55, 0], [0, -D.shin, 0.0], 0.056, 0.062, 0.03);
              F.blob(Lg.an, [0, -0.035, 0.04], [0.065, 0.055, 0.115], 0.04);
            }
            F.cut(root, [0, -D.hip + 0.005, 0], [0, -1, 0], 0.01);
          },
        },
        {
          // as próteses: os braços de máquina, a perna de máquina (a canela e o pé em garra)
          key: K('mech'),
          mat: X.metal,
          cell: 0.015,
          build(F) {
            for (const A of J.arms) if (mechSides.includes(A.s)) mechArm(F, A, D, 0.04);
            if (legP) {
              const Lg = legs[0];
              F.blob(Lg.kn, [0, 0, 0], [0.05, 0.05, 0.05], 0.01);
              F.cone(Lg.kn, [0, -0.03, 0], [0, -D.shin + 0.02, 0], 0.035, 0.03, 0.01);
              F.blob(Lg.an, [0, -0.01, 0], [0.04, 0.035, 0.04], 0.01);
              for (const t of [-1, 0, 1]) F.cone(Lg.an, [0, -0.03, 0.0], [t * 0.05, -0.06, 0.13], 0.02, 0.012, 0.01);
            }
            // a placa da coluna (o suporte das próteses) nas costas
            F.blob(spine, [0, T * 0.6, -0.12], [0.06, T * 0.4, 0.035], 0.02);
          },
        },
      ];
    },
    dispose() {},
  };
  return { D, kit };
}

/**
 * A vida de silício — a cabeça humana (caricata, careca, o símbolo na testa, as órbitas fundas) num corpo
 * de MÁQUINA: a armação de metal (a bacia, a coluna em vértebras, a gaiola das costelas em barras), membros
 * de barra com juntas em bola, os pés em garra; um braço-arma (o cano no lugar da mão).
 *   baixo  esguia, o cano no braço direito, a pinça no esquerdo
 *   médio  maior, os cabos caindo da cabeça como cabelo, as ombreiras, a lâmina no braço esquerdo
 *   alto   a massa de membros: dois pares de braços, a cabeça pequena afundada entre os ombros
 */
export function siliconFlesh(level, M, id) {
  const r = rngOf(id, 9);
  const v = Math.floor(r() * 3);
  const q = rngVar(47, v);
  const L = level === 'high' ? 2 : level === 'mid' ? 1 : 0;
  const S = [1, 1.18, 1.42][L] * lerp(0.97, 1.04, q());
  const D = {
    hip: 0.96 * S, thigh: 0.46 * S, shin: 0.44 * S, torso: 0.5 * S, shoulderW: [0.17, 0.21, 0.27][L] * S, hipW: 0.085 * S,
    upperArm: 0.32 * S, forearm: 0.32 * S, stride: 1.5 * S, girth: 1, lean: [0.25, 0.18, 0.32][L], swing: [1.1, 0.9, 0.6][L],
    extraArms: L === 2 ? 1 : 0,
  };
  const X = mats(M);
  const HR = 0.1;
  const headY = L === 2 ? 0.05 : 0.17; // (o alto: a cabeça afundada entre os ombros)
  const K = (n) => `si2:${L}:${n}:${v}`;
  const kit = {
    head(neck, add) {
      // o símbolo na testa: uma cruz escura com o traço de baixo
      add(neck, mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008).translate(0, headY + 0.085, HR * 0.86), X.dark));
      add(neck, mesh(new THREE.BoxGeometry(0.008, 0.045, 0.008).translate(0, headY + 0.085, HR * 0.86), X.dark));
    },
    hand(el, s, fa, add, extra) {
      if (s > 0 && !extra) {
        // o braço-arma: o cano grosso no lugar da mão
        add(el, mesh(seg([0, -fa + 0.02, 0], [0, -fa - 0.2 * S, 0.01], 0.034 * S, 0.026 * S, 10), X.rigid));
        const m = new THREE.CircleGeometry(0.018 * S, 10);
        m.rotateX(Math.PI / 2);
        m.translate(0, -fa - 0.2 * S - 0.001, 0.01);
        add(el, mesh(m, X.dark));
      } else if (L === 1 && s < 0 && !extra) {
        add(el, mesh(new THREE.BoxGeometry(0.01, 0.42 * S, 0.06).translate(0, -fa - 0.18 * S, 0.01), X.rigid)); // a lâmina
      } else clamp(el, D, add, X.rigid, S);
    },
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso;
      const layers = [
        {
          // a cabeça humana: careca, as órbitas fundas, a boca rasgada; o pescoço de cabos
          key: K('head'),
          mat: X.skin,
          cell: 0.014,
          build(F) {
            F.blob(neck, [0, headY, 0.01], [HR * 0.92, HR * 1.05, HR * 0.95], 0.03);
            for (const s of [-1, 1]) F.carveBlob(neck, [s * 0.035, headY + 0.02, HR * 0.86], [0.024, 0.02, 0.022], 0.01);
            F.carve(neck, [-0.03, headY - 0.05, HR * 0.85], [0.03, headY - 0.05, HR * 0.85], 0.005, 0.005, 0.005);
          },
        },
        {
          // a armação de máquina
          key: K('frame'),
          mat: X.metal,
          cell: 0.016,
          build(F) {
            // a bacia e a coluna em vértebras
            F.blob(root, [0, -0.02, 0], [0.13 * S, 0.07 * S, 0.09 * S], 0.02);
            for (let i = 0; i < 7; i++) F.blob(spine, [0, T * (0.04 + i * 0.13), -0.03], [0.04 * S, 0.03 * S, 0.04 * S], 0.015);
            // a gaiola das costelas: barras curvas dos dois lados
            for (let i = 0; i < 4; i++) {
              const y = T * (0.5 + i * 0.12);
              for (const s of [-1, 1]) {
                F.cone(spine, [0, y, -0.04], [s * 0.13 * S, y - 0.02, 0.0], 0.013 * S, 0.013 * S, 0.01);
                F.cone(spine, [s * 0.13 * S, y - 0.02, 0.0], [s * 0.04, y - 0.06, 0.1 * S], 0.013 * S, 0.011 * S, 0.01);
              }
            }
            F.blob(spine, [0, T * 0.62, 0.0], [0.06 * S, 0.1 * S, 0.06 * S], 0.02); // o bloco do peito (dentro da gaiola)
            // a cintura de ombros: a barra e os encaixes
            F.cone(spine, [-D.shoulderW, T - 0.05, -0.01], [D.shoulderW, T - 0.05, -0.01], 0.03 * S, 0.03 * S, 0.02);
            if (L >= 1) for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW, T - 0.02, 0], [0.1 * S, 0.06 * S, 0.1 * S], 0.02); // as ombreiras
            if (L === 2) F.blob(spine, [0, T * 0.95, -0.06], [0.22 * S, 0.14 * S, 0.14 * S], 0.04); // o ombro em massa (a cabeça afundada)
            F.cone(neck, [0, -0.03, -0.01], [0, headY - 0.06, 0.0], 0.03, 0.025, 0.01); // o pescoço de cabos
            for (const A of arms) mechArm(F, A, D, (A.extra ? 0.028 : 0.033) * S);
            for (const Lg of legs) {
              F.blob(Lg.hp, [0, 0, 0], [0.045 * S, 0.045 * S, 0.045 * S], 0.01);
              F.cone(Lg.hp, [0, -0.03, 0], [0, -D.thigh + 0.03, 0], 0.035 * S, 0.03 * S, 0.01);
              F.blob(Lg.kn, [0, 0, 0], [0.04 * S, 0.04 * S, 0.04 * S], 0.01);
              F.cone(Lg.kn, [0, -0.03, 0], [0, -D.shin + 0.03, 0], 0.03 * S, 0.028 * S, 0.01);
              F.blob(Lg.an, [0, -0.01, 0], [0.035 * S, 0.03 * S, 0.035 * S], 0.01);
              for (const t of [-1, 0, 1]) F.cone(Lg.an, [0, -0.03, 0.0], [t * 0.06 * S, -0.06, 0.15 * S], 0.02 * S, 0.01 * S, 0.01); // o pé em garra
            }
          },
        },
      ];
      if (L >= 1)
        layers.push({
          // os cabos longos caindo da cabeça como cabelo
          key: K('cables'),
          mat: X.leather,
          cell: 0.012,
          build(F) {
            for (let i = 0; i < 9; i++) {
              const a = ((i - 4) / 4) * 1.2;
              F.cone(neck, [Math.sin(a) * HR * 0.8, headY + 0.06, -Math.cos(a) * HR * 0.7], [Math.sin(a) * 0.16, headY - 0.45 - (i % 3) * 0.08, -0.12 - Math.cos(a) * 0.08], 0.012, 0.009, 0.004);
            }
          },
        });
      return layers;
    },
    dispose() {},
  };
  return { D, kit };
}
