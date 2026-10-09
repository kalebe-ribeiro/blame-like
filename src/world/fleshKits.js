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
 * O Safeguard em malha contínua. Por enquanto o baixo (o protótipo da segunda rodada).
 * → { D, kit } para buildBody (world/bodies.js).
 */
export function safeguardFlesh(level, M, id) {
  const r = rngOf(id, 1);
  const v = Math.floor(r() * 4); // a variante do corpo (a malha)
  const q = rngVar(11, v);
  const L = level === 'high' ? 2 : level === 'mid' ? 1 : 0;
  const scale = [1, 1.17, 1.42][L] * lerp(0.97, 1.04, q());
  const thin = lerp(0.88, 1.08, q());
  const D = {
    hip: 1.2 * scale,
    thigh: 0.62 * scale,
    shin: 0.6 * scale,
    torso: 0.72 * scale,
    shoulderW: 0.205 * thin * scale,
    hipW: 0.085 * thin * scale,
    upperArm: 0.44 * scale * lerp(0.96, 1.06, q()),
    forearm: 0.48 * scale * lerp(0.96, 1.1, q()),
    stride: 1.9 * scale,
    girth: 1,
    lean: 0.22 * lerp(0.8, 1.2, r()),
    swing: 1.35,
  };
  const headLen = lerp(1.25, 1.55, q());
  const ribs = 4 + Math.floor(q() * 2);
  const clawLen = 0.24 * lerp(0.9, 1.15, r());
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
    },
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso * 1; // (o comprimento do tronco)
      return [
        {
          key: `sg:${L}:${v}`,
          mat: skinMat,
          cell: 0.016,
          build(F) {
            const S = scale;
            // a bacia: estreita, os ossos do quadril marcados
            F.blob(root, [0, -0.02, 0], [0.11 * thin * S, 0.075 * S, 0.075 * S], 0.05);
            for (const s of [-1, 1]) F.blob(root, [s * 0.085 * thin * S, 0.02, 0.03], [0.03, 0.03, 0.035], 0.04);
            // a cintura fina (o abdômen afundado) e a caixa torácica
            F.cone(spine, [0, 0, 0.0], [0, T * 0.42, 0.01], 0.07 * thin * S, 0.085 * thin * S, 0.06);
            F.blob(spine, [0, T * 0.66, 0.0], [0.135 * thin * S, 0.2 * S, 0.095 * S], 0.06);
            // as costelas: sulcos curvos de cada lado, descendo para o esterno
            for (let i = 0; i < ribs; i++) {
              const y = T * (0.78 - i * 0.075);
              for (const s of [-1, 1]) F.carve(spine, [s * 0.14 * thin * S, y + 0.02, -0.01], [s * 0.035, y - 0.05, 0.1 * S], 0.011, 0.008, 0.02);
            }
            // o esterno e a clavícula; os ombros ossudos
            F.cone(spine, [0, T * 0.5, 0.075 * S], [0, T * 0.86, 0.075 * S], 0.018, 0.022, 0.03);
            for (const s of [-1, 1]) {
              F.cone(spine, [s * 0.02, T * 0.93, 0.04], [s * D.shoulderW * 0.95, T - 0.05, 0.0], 0.028, 0.03, 0.04);
              F.blob(spine, [s * D.shoulderW, T - 0.06, -0.005], [0.05, 0.045, 0.05], 0.05);
              // as omoplatas
              F.blob(spine, [s * 0.075 * thin * S, T * 0.78, -0.07 * S], [0.06, 0.08, 0.025], 0.05);
            }
            // a coluna: as vértebras saltando nas costas
            for (let i = 0; i < 9; i++) F.blob(spine, [0, T * (0.05 + i * 0.105), -0.075 * S - (i > 4 ? 0.01 : 0)], [0.016, 0.022, 0.018], 0.03);
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
              F.cone(A.sh, [0, 0.0, 0], [0, -ua, 0], 0.042, 0.03, 0.05);
              F.blob(A.sh, [0, -ua * 0.35, 0.005], [0.04, ua * 0.28, 0.042], 0.05); // (o deltoide e o bíceps secos)
              F.blob(A.el, [0, 0, -0.02], [0.028, 0.03, 0.03], 0.04); // o cotovelo
              F.cone(A.el, [0, 0, 0], [0, -fa, 0.0], 0.034, 0.022, 0.04);
              F.blob(A.el, [0, -fa * 0.25, 0], [0.038, fa * 0.22, 0.03], 0.05);
              // a mão comprida e estreita (os dedos são as garras, rígidas)
              F.blob(A.el, [0, -fa - 0.045, 0.004], [0.032, 0.05, 0.015], 0.03);
            }
            // as pernas: coxas finas, joelhos marcados, canelas longas, pés compridos
            for (const Lg of legs) {
              const th = D.thigh, sh = D.shin;
              F.blob(Lg.hp, [0, -0.02, 0], [0.055, 0.05, 0.055], 0.05);
              F.cone(Lg.hp, [0, 0, 0], [0, -th, 0.0], 0.06 * thin, 0.04, 0.05);
              F.blob(Lg.hp, [0, -th * 0.35, 0.012], [0.058 * thin, th * 0.28, 0.06], 0.05);
              F.blob(Lg.kn, [0, 0.0, 0.025], [0.035, 0.035, 0.03], 0.04); // a patela
              F.cone(Lg.kn, [0, 0, 0], [0, -sh, 0], 0.04, 0.026, 0.04);
              F.blob(Lg.kn, [0, -sh * 0.25, -0.02], [0.038, sh * 0.2, 0.04], 0.05); // a panturrilha seca
              F.blob(Lg.an, [0, -0.02, -0.01], [0.03, 0.035, 0.035], 0.03); // o calcanhar
              F.cone(Lg.an, [0, -0.035, 0.0], [0, -0.05, 0.2], 0.032, 0.018, 0.04); // o pé comprido
              for (let t = -1; t <= 1; t++) F.cone(Lg.an, [t * 0.014, -0.05, 0.18], [t * 0.02, -0.058, 0.25], 0.011, 0.008, 0.015); // os dedos
            }
          },
        },
      ];
    },
    dispose() {},
  };
  return { D, kit };
}

/**
 * Um humano em malha contínua — o protótipo: o povo "abrigado" (capuz, manto, óculos/respirador).
 * → { D, kit }
 */
export function humanFlesh(tribe, M, id) {
  const r = rngOf(id, 3);
  const v = Math.floor(r() * 4);
  const q = rngVar(23, v);
  const h = lerp(0.94, 1.06, q());
  const wide = lerp(0.9, 1.12, q());
  const D = {
    hip: 0.93 * h,
    thigh: 0.44 * h,
    shin: 0.42 * h,
    torso: 0.52 * h,
    shoulderW: 0.185 * wide,
    hipW: 0.09 * wide,
    upperArm: 0.28 * h,
    forearm: 0.27 * h,
    stride: 1.3 * h,
    girth: 1,
    lean: 0.16,
    swing: 0.8,
  };
  const skin = movingMaterial(M.skin);
  const cloth = movingMaterial(M.garb);
  const mantle = movingMaterial(M.mantle);
  const leather = movingMaterial(M.leather);
  const metal = M.machine;
  const dark = M.door;
  const hem = lerp(0.35, 0.85, q()); // o comprimento do manto (0: na cintura · 1: abaixo do joelho)
  const resp = r() < 0.5; // respirador ou óculos e lenço
  const scarf = q() < 0.6;
  const kit = {
    head(neck, add) {
      // os óculos de proteção (duas lentes redondas num aro) e, às vezes, o respirador
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(0.022, 0.024, 0.022, 10);
        g.rotateX(Math.PI / 2);
        g.translate(s * 0.034, 0.215, 0.088);
        add(neck, mesh(g, metal));
        const lens = new THREE.CircleGeometry(0.017, 10);
        lens.translate(s * 0.034, 0.215, 0.1);
        add(neck, mesh(lens, dark));
      }
      if (resp) {
        const g = new THREE.CylinderGeometry(0.03, 0.038, 0.05, 8);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0.145, 0.095);
        add(neck, mesh(g, metal));
        for (const s of [-1, 1]) {
          const c = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8);
          c.rotateZ(Math.PI / 2);
          c.translate(s * 0.05, 0.135, 0.085);
          add(neck, mesh(c, metal));
        }
      }
    },
    hand() {},
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso;
      const capeLen = lerp(0.45, 0.95, hem); // a capa: das omoplatas até a cintura ou o quadril
      const hood = v !== 2; // o capuz levantado (uma variante anda de cabeça descoberta, o lenço no pescoço)
      return [
        {
          // a pele: só o que aparece — o rosto e as mãos
          key: `hu:abrigado:skin:${v}`,
          mat: skin,
          cell: 0.012,
          build(F) {
            F.blob(neck, [0, 0.215, 0.0], [0.078, 0.104, 0.092], 0.03); // o crânio
            F.blob(neck, [0, 0.165, 0.018], [0.064, 0.062, 0.068], 0.03); // as maçãs e o maxilar
            F.blob(neck, [0, 0.128, 0.04], [0.032, 0.026, 0.03], 0.025); // o queixo
            F.cone(neck, [0, 0.205, 0.084], [0, 0.17, 0.098], 0.011, 0.014, 0.012); // o nariz
            for (const s of [-1, 1]) {
              F.carveBlob(neck, [s * 0.032, 0.215, 0.093], [0.02, 0.012, 0.015], 0.012); // as órbitas
              F.blob(neck, [s * 0.075, 0.195, -0.005], [0.012, 0.025, 0.018], 0.015); // as orelhas
            }
            F.cone(neck, [0, 0.0, -0.01], [0, 0.13, -0.005], 0.045, 0.04, 0.03);
            for (const A of arms) {
              const fa = D.forearm;
              F.blob(A.el, [0, -fa - 0.045, 0.005], [0.038, 0.05, 0.017], 0.02); // a palma
              for (let i = 0; i < 4; i++) {
                const x = (i - 1.5) * 0.0175;
                F.cone(A.el, [x, -fa - 0.085, 0.006], [x * 1.05, -fa - 0.12, 0.016], 0.0085, 0.0078, 0.008);
                F.cone(A.el, [x * 1.05, -fa - 0.12, 0.016], [x * 1.08, -fa - 0.145 + Math.abs(i - 1.5) * 0.008, 0.038], 0.0078, 0.0068, 0.008);
              }
              F.cone(A.el, [-A.s * 0.03, -fa - 0.03, 0.012], [-A.s * 0.048, -fa - 0.08, 0.045], 0.0105, 0.0085, 0.012); // o polegar
            }
          },
        },
        {
          // a jaqueta justa no corpo: a anatomia por baixo (peito, cintura, ombros), a gola alta, a carcela,
          // os bolsos, as mangas com punho; às vezes o lenço
          key: `hu:abrigado:cloth:${v}`,
          mat: cloth,
          cell: 0.014,
          build(F) {
            F.blob(root, [0, -0.03, 0], [0.135 * wide, 0.1, 0.095], 0.04); // a bacia
            F.cone(root, [0, -0.02, 0.0], [0, -0.16, 0.0], 0.14 * wide, 0.15 * wide, 0.03); // a aba
            F.cut(root, [0, -0.17, 0], [0, -1, 0], 0.008);
            F.cone(spine, [0, 0.0, 0.0], [0, T * 0.45, 0.01], 0.12 * wide, 0.13 * wide, 0.05); // a cintura
            F.blob(spine, [0, T * 0.67, 0.012], [0.14 * wide, 0.15, 0.095], 0.05); // o peito
            for (const s of [-1, 1]) {
              F.cone(spine, [s * 0.05, T * 0.9, 0.0], [s * D.shoulderW * 0.92, T - 0.04, -0.005], 0.05, 0.05, 0.04); // o trapézio
              F.blob(spine, [s * D.shoulderW * 0.95, T - 0.06, 0], [0.052, 0.05, 0.055], 0.04); // o ombro
              F.blob(spine, [s * 0.075, T * 0.6, 0.09], [0.04, 0.04, 0.018], 0.01); // o bolso do peito
            }
            F.cone(spine, [0.012, T * 0.08, 0.11], [0.012, T * 0.95, 0.09], 0.01, 0.01, 0.01); // a carcela
            // a gola alta, aberta na frente
            F.cone(neck, [0, -0.02, -0.005], [0, 0.07, -0.01], 0.07, 0.062, 0.03);
            F.carveBlob(neck, [0, 0.07, 0.07], [0.035, 0.05, 0.04], 0.01);
            if (scarf) for (let i = 0; i < 9; i++) {
              const a = (i / 9) * Math.PI * 2;
              F.blob(neck, [Math.sin(a) * 0.055, 0.05 + (i % 2) * 0.014, Math.cos(a) * 0.05], [0.03, 0.026, 0.03], 0.02);
            }
            // as mangas, com o punho e o cotovelo
            for (const A of arms) {
              const ua = -A.el.position.y;
              F.cone(A.sh, [0, 0.0, 0], [0, -ua, 0], 0.05, 0.043, 0.03);
              F.blob(A.el, [0, 0, -0.012], [0.043, 0.04, 0.042], 0.02);
              F.cone(A.el, [0, 0.01, 0], [0, -D.forearm * 0.85, 0.0], 0.042, 0.037, 0.03);
              F.blob(A.el, [0, -D.forearm * 0.82, 0], [0.043, 0.028, 0.04], 0.01); // o punho
            }
          },
        },
        {
          // a capa curta com o capuz (à parte: o corte da barra e a abertura da frente só valem para ela)
          key: `hu:abrigado:cape:${v}`,
          mat: mantle,
          cell: 0.016,
          build(F) {
            // a gola do capuz: o pano caído em volta do pescoço e sobre o alto dos ombros
            F.blob(spine, [0, T * 0.97, -0.03], [0.13 * wide, 0.05, 0.1], 0.04);
            F.carveBlob(spine, [0, T * 0.97, 0.1], [0.06, 0.07, 0.06], 0.01);
            if (hood) {
              // o capuz: em volta da cabeça, mais fundo atrás, a boca aberta na frente
              F.blob(neck, [0, 0.215, -0.02], [0.102, 0.128, 0.122], 0.05);
              F.blob(neck, [0, 0.26, -0.085], [0.055, 0.06, 0.055], 0.04); // a ponta caída atrás
              F.carveBlob(neck, [0, 0.19, 0.12], [0.078, 0.11, 0.1], 0.02);
              F.carveBlob(neck, [0, 0.2, 0.0], [0.082, 0.105, 0.098], 0.01); // (oco: a cabeça dentro)
            } else {
              F.blob(neck, [0, 0.03, -0.075], [0.11, 0.045, 0.06], 0.04); // o capuz baixado nas costas
            }
          },
        },
        {
          // as calças: folgadas, com joelheiras (à parte: os cortes da jaqueta e da capa não as pegam)
          key: `hu:abrigado:legs:${v}`,
          mat: cloth,
          cell: 0.016,
          build(F) {
            F.blob(root, [0, -0.06, 0], [0.13 * wide, 0.09, 0.095], 0.04);
            for (const Lg of legs) {
              F.cone(Lg.hp, [0, 0.0, 0], [0, -D.thigh, 0.0], 0.08, 0.06, 0.04);
              F.cone(Lg.kn, [0, 0, 0], [0, -D.shin * 0.75, 0], 0.058, 0.05, 0.04);
            }
          },
        },
        {
          // o couro: as botas, o cinto com as bolsas, a alça atravessada no peito, as joelheiras
          key: `hu:abrigado:leather:${v}`,
          mat: leather,
          cell: 0.014,
          build(F) {
            F.cone(root, [0, 0.0, 0], [0, -0.045, 0.0], 0.158 * wide, 0.16 * wide, 0.01);
            for (const s of [-1, 1]) F.blob(root, [s * 0.13 * wide, -0.06, 0.06], [0.04, 0.05, 0.03], 0.012); // as bolsas
            F.blob(root, [0.02, -0.06, -0.13], [0.06, 0.045, 0.03], 0.012);
            F.cone(spine, [-D.shoulderW * 0.85, T * 0.95, 0.06], [0.12 * wide, T * 0.05, 0.13], 0.013, 0.013, 0.008); // a alça
            F.cone(spine, [-D.shoulderW * 0.85, T * 0.95, -0.05], [0.12 * wide, T * 0.05, -0.12], 0.013, 0.013, 0.008);
            for (const Lg of legs) {
              F.blob(Lg.kn, [0, -0.01, 0.055], [0.045, 0.055, 0.02], 0.012); // a joelheira
              F.cone(Lg.kn, [0, -D.shin * 0.6, 0], [0, -D.shin, 0.0], 0.06, 0.054, 0.03);
              F.cone(Lg.an, [0, -0.03, -0.04], [0, -0.04, 0.13], 0.054, 0.046, 0.03);
              F.cut(Lg.an, [0, -0.085, 0], [0, -1, 0], 0.008); // a sola reta
            }
          },
        },
      ];
    },
    dispose() {},
  };
  return { D, kit };
}
