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
 * Um humano em malha contínua — CARICATO (o usuário, 2026-10-09: "nao precisa tentar ir pro lado
 * realista… um approach mais caricato/cartoon"; as roupas sem cor por enquanto). O povo "abrigado":
 * a cabeça grande num capuz pontudo que cai para trás, o rosto redondo com óculos enormes, o corpo
 * pequeno num casaco em sino até o meio da coxa (aberto na frente para as pernas), mangas que abrem no
 * punho, luvas grossas, pernas finas e botas grandes; às vezes cachecol, mochila com o rolo de dormir.
 * → { D, kit }
 */
export function humanFlesh(tribe, M, id) {
  const r = rngOf(id, 3);
  const v = Math.floor(r() * 4);
  const q = rngVar(29, v);
  const h = lerp(0.95, 1.06, q());
  const wide = lerp(0.92, 1.15, q());
  const D = {
    hip: 0.74 * h,
    thigh: 0.33 * h,
    shin: 0.31 * h,
    torso: 0.42 * h,
    shoulderW: 0.15 * wide,
    hipW: 0.075 * wide,
    upperArm: 0.23 * h,
    forearm: 0.21 * h,
    stride: 1.05 * h,
    girth: 1,
    lean: 0.12,
    swing: 0.9,
  };
  const skin = movingMaterial(M.skin);
  const coat = movingMaterial(M.garb);
  const hoodM = movingMaterial(M.mantle);
  const leather = movingMaterial(M.leather);
  const metal = M.machine;
  const dark = M.door;
  const coatLen = lerp(0.12, 0.26, q()); // m abaixo do quadril
  const scarf = v !== 1;
  const pack = v === 0 || v === 3;
  const resp = r() < 0.4;
  const HR = 0.115; // o raio da cabeça (grande)
  const kit = {
    head(neck, add) {
      // os óculos enormes: dois aros grossos com lentes escuras
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(0.036, 0.04, 0.03, 14);
        g.rotateX(Math.PI / 2);
        g.translate(s * 0.045, 0.2, HR * 0.92);
        add(neck, mesh(g, metal));
        const lens = new THREE.CircleGeometry(0.029, 14);
        lens.translate(s * 0.045, 0.2, HR * 0.92 + 0.0155);
        add(neck, mesh(lens, dark));
      }
      if (resp) {
        // o respirador: um focinho curto com o filtro redondo
        const g = new THREE.CylinderGeometry(0.035, 0.045, 0.06, 10);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0.125, HR * 0.85);
        add(neck, mesh(g, metal));
        const f = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12);
        f.rotateX(Math.PI / 2);
        f.translate(0, 0.125, HR * 0.85 + 0.04);
        add(neck, mesh(f, dark));
      }
    },
    hand() {},
    strike() {},
    rest() {},
    flesh(J) {
      const { root, spine, neck, arms, legs } = J;
      const T = D.torso;
      const layers = [
        {
          // o rosto (redondo, quase sem feições: os óculos fazem o rosto)
          key: `hu2:skin:${v}`,
          mat: skin,
          cell: 0.016,
          build(F) {
            F.blob(neck, [0, 0.18, 0.012], [HR * 0.9, HR * 0.95, HR * 0.92], 0.03);
            F.blob(neck, [0, 0.165, HR * 0.9], [0.018, 0.016, 0.016], 0.02); // o nariz (um botão)
          },
        },
        {
          // as luvas: mitenes grossas com o polegar
          key: `hu2:gloves:${v}`,
          mat: leather,
          cell: 0.014,
          build(F) {
            for (const A of arms) {
              const fa = D.forearm;
              F.blob(A.el, [0, -fa - 0.04, 0.008], [0.042, 0.055, 0.03], 0.03);
              F.cone(A.el, [-A.s * 0.028, -fa - 0.02, 0.02], [-A.s * 0.045, -fa - 0.06, 0.045], 0.016, 0.014, 0.02);
            }
          },
        },
        {
          // o casaco em sino: os ombros caídos, o corpo alargando até a barra; mangas que abrem no punho;
          // a fenda da frente (as pernas passam); às vezes o cachecol grosso
          key: `hu2:coat:${v}`,
          mat: coat,
          cell: 0.018,
          build(F) {
            F.blob(spine, [0, T * 0.62, 0], [0.15 * wide, T * 0.5, 0.115], 0.06); // o peito
            F.cone(spine, [0, T * 0.6, -0.005], [0, -0.02, -0.01], 0.15 * wide, 0.165 * wide, 0.06);
            F.cone(root, [0, 0.02, -0.01], [0, -coatLen, -0.02], 0.165 * wide, 0.215 * wide, 0.06); // a saia do casaco
            F.cut(root, [0, -coatLen + 0.01, 0], [0, -1, 0], 0.012);
            F.carve(root, [0, -coatLen - 0.05, 0.22], [0, -0.02, 0.17], 0.035, 0.012, 0.02); // a fenda da frente
            F.carveBlob(root, [0, -coatLen, 0], [0.11 * wide, 0.12, 0.1], 0.02); // (por baixo: oco — as coxas dentro)
            for (const s of [-1, 1]) F.blob(spine, [s * D.shoulderW, T - 0.05, 0], [0.055, 0.05, 0.06], 0.05); // os ombros caídos
            for (let i = 0; i < 3; i++) F.blob(spine, [0.03, T * (0.25 + i * 0.22), 0.118], [0.014, 0.014, 0.01], 0.006); // os botões
            if (scarf) {
              for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                F.blob(neck, [Math.sin(a) * 0.075, 0.02 + (i % 2) * 0.012, Math.cos(a) * 0.07 - 0.005], [0.042, 0.04, 0.042], 0.03);
              }
              F.cone(spine, [0.05, T, 0.1], [0.07, T * 0.55, 0.13], 0.03, 0.035, 0.03); // a ponta caindo na frente
            }
            for (const A of arms) {
              const ua = -A.el.position.y;
              F.cone(A.sh, [0, 0.0, 0], [0, -ua, 0], 0.048, 0.045, 0.03);
              F.cone(A.el, [0, 0.01, 0], [0, -D.forearm * 0.92, 0.0], 0.045, 0.058, 0.03); // abre no punho
              F.carveBlob(A.el, [0, -D.forearm * 0.95, 0], [0.04, 0.05, 0.04], 0.01); // (a boca da manga)
            }
          },
        },
        {
          // o capuz pontudo: em volta da cabeça grande, a ponta caindo para trás; a boca redonda na frente
          key: `hu2:hood:${v}`,
          mat: hoodM,
          cell: 0.016,
          build(F) {
            F.blob(neck, [0, 0.19, -0.005], [HR + 0.03, HR + 0.035, HR + 0.03], 0.04);
            F.cone(neck, [0, 0.24, -0.06], [0, 0.29 + 0.03 * v, -0.2], 0.075, 0.018, 0.06); // a ponta
            F.blob(neck, [0, 0.03, -0.02], [0.13 * wide, 0.05, 0.11], 0.05); // a gola do capuz nos ombros
            F.carveBlob(neck, [0, 0.18, HR + 0.05], [HR * 0.82, HR * 0.9, 0.08], 0.015); // a boca do capuz
            F.carveBlob(neck, [0, 0.18, 0.01], [HR + 0.005, HR + 0.01, HR + 0.005], 0.01); // (oco: a cabeça dentro)
          },
        },
        {
          // as pernas finas (as calças)
          key: `hu2:legs:${v}`,
          mat: coat,
          cell: 0.016,
          build(F) {
            F.blob(root, [0, -0.04, 0], [0.11 * wide, 0.07, 0.08], 0.04);
            for (const Lg of legs) {
              F.cone(Lg.hp, [0, 0.0, 0], [0, -D.thigh, 0.0], 0.055, 0.045, 0.03);
              F.cone(Lg.kn, [0, 0, 0], [0, -D.shin * 0.7, 0], 0.045, 0.04, 0.03);
            }
          },
        },
        {
          // as botas grandes e o cinto largo
          key: `hu2:boots:${v}`,
          mat: leather,
          cell: 0.016,
          build(F) {
            for (const Lg of legs) {
              F.cone(Lg.kn, [0, -D.shin * 0.55, 0], [0, -D.shin, 0.0], 0.056, 0.062, 0.03); // o cano
              F.blob(Lg.an, [0, -0.035, 0.04], [0.065, 0.055, 0.115], 0.04); // o pé redondo e grande
              F.cut(Lg.an, [0, -0.075, 0], [0, -1, 0], 0.01); // a sola reta
            }
          },
        },
      ];
      if (pack)
        layers.push({
          // a mochila com o rolo de dormir por cima
          key: `hu2:pack:${v}`,
          mat: hoodM,
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
