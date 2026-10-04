// ─────────────────────────────────────────────────────────────────────────────
//  Os níveis dos hostis (o cofre, Dano-do-emissor e Movimento-dos-inimigos):
//  baixo · médio · alto — dos Safeguards e da vida de silício.
//
//    a distribuição  perto do começo da travessia, só baixos; médios e altos mais
//                    longe, nas camadas fundas e perto das estruturas únicas.
//                    Determinística: o mesmo lugar, o mesmo nível (hash da seed).
//    a resistência   ao emissor (D que tira 100% da vida dele — Dano-do-emissor §3)
//    o movimento     o arranque: velocidade inicial, aceleração, terminal (M1)
//
//  Os números são os aprovados, para ajustar jogando.
// ─────────────────────────────────────────────────────────────────────────────
import { hash4 } from '../gen/hash.js';
import { MEGA } from '../gen/field.js';
import { startSite } from '../lang/leads.js';

export const LEVELS = ['low', 'mid', 'high'];

/** M1 — o arranque de cada nível (m/s, m/s²). Os moradores de uma vila hostil: M4. */
export const MOVE = {
  low: { v0: 3, a: 2.5, vt: 8 },
  mid: { v0: 3, a: 4, vt: 11 },
  high: { v0: 4, a: 7, vt: 14 },
  villager: { v0: 2.3, a: 2, vt: 7 },
};

/** M2 — uma curva acima disto (rad) custa velocidade: v ← v · (0,5 + 0,5·cos θ). */
export const TURN = { min: (30 * Math.PI) / 180, step: 0.1, straight: 1.0, settle: 0.2 };

/**
 * D3 — a resistência ao emissor: o D (app/beam.js shotOf().dmg) que tira toda a vida.
 * (o Safeguard baixo fica um pouco abaixo de 0,5: o médio-fraco mais curto, 0,6 s, dá D 0,501)
 */
export const RESIST = {
  safeguard: { low: 0.48, mid: 1.5, high: 4 },
  silicon: { low: 0.8, mid: 2, high: 5 },
  human: 0.3,
  transhuman: 0.4,
  test: 1,
};

/** A resistência de um corpo ao emissor. */
export function resistOf(e) {
  if (e.kind === 'safeguard') return RESIST.safeguard[e.level ?? 'low'];
  if (e.kind === 'silicon' || e.npc?.silicon) return RESIST.silicon[e.level ?? 'low'];
  if (e.kind === 'human') return RESIST.human;
  if (e.kind === 'transhuman') return RESIST.transhuman;
  return RESIST.test;
}

const band = (y) => Math.floor((y - MEGA.barrierTop0) / MEGA.barrier) + 1;

/**
 * O nível de um hostil em (x, y, z) GLOBAL. salt separa quem é quem (a ronda de um território,
 * o andarilho, o caçador de uma placa). → 'low' | 'mid' | 'high'
 */
export function levelAt(F, x, y, z, salt = 0) {
  const s0 = startSite(F) ?? { x: 0, y: 0, z: 0 };
  const far = Math.hypot(x - s0.x, z - s0.z) / 4000; // 1 a cada 4 km
  const deep = Math.max(0, band(s0.y) - band(y)); // camadas abaixo do começo
  let near = 0;
  for (const u of F.uniquesNear(x, y, z, 600)) if (Math.hypot(u.x - x, u.y - y, u.z - z) < 600) near = 1;
  const s = far + 0.9 * deep + 0.8 * near;
  if (s < 0.5) return 'low'; // perto do começo: só baixos
  const h = hash4(F.seed, Math.round(x / 50), Math.round(y / 50), Math.round(z / 50), 2100 + salt);
  const pHigh = Math.min(0.35, Math.max(0, (s - 1) * 0.2));
  const pMid = Math.min(0.55, Math.max(0, (s - 0.5) * 0.4));
  if (h < pHigh) return 'high';
  if (h < pHigh + pMid) return 'mid';
  return 'low';
}

const WALK = 4.2; // m/s do Walker com speedScale 1

/**
 * O arranque (M1–M2) de quem persegue: S guarda { huntV, turnRef, turnLast, straightT, turns }. De
 * v0 até a terminal com a aceleração de M; uma CURVA — o rumo que muda e volta a ficar reto —
 * custa velocidade pelo ângulo inteiro dela: v ← v · (0,5 + 0,5·cos θ) se θ > 30°. Numa
 * escada/elevador ou cambaleando (ferido), recomeça de v0. Põe o speedScale do Walker do corpo.
 */
export function accelerate(e, S, M, dt) {
  if (S.huntV === undefined || e.vert || e.staggerT > 0) S.huntV = Math.min(S.huntV ?? M.v0, M.v0);
  const vx = e.walker.vel.x;
  const vz = e.walker.vel.z;
  if (Math.hypot(vx, vz) > 1) {
    const ang = Math.atan2(vx, vz);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (S.turnRef === undefined || S.turnRef === null) {
      S.turnRef = ang;
      S.turnLast = ang;
      S.turnT = 0;
      S.straightT = 0;
    }
    // o rumo amostrado a cada TURN.step s (o passo do corpo balança o rumo quadro a quadro)
    if ((S.turnT += dt) >= TURN.step) {
      const rate = Math.abs(wrap(ang - S.turnLast)) / S.turnT;
      S.turnLast = ang;
      S.straightT = rate < TURN.straight ? S.straightT + S.turnT : 0;
      S.turnT = 0;
      // reto de novo: a curva acabou — quanto virou?
      if (S.straightT >= TURN.settle) {
        const th = Math.abs(wrap(ang - S.turnRef));
        if (th > TURN.min) {
          S.lastTurn = { th, from: S.huntV };
          S.huntV = Math.max(1, S.huntV * (0.5 + 0.5 * Math.cos(th)));
          S.lastTurn.to = S.huntV;
          S.turns = (S.turns ?? 0) + 1;
        }
        S.turnRef = ang;
      }
    }
  } else S.turnRef = null;
  S.huntV = Math.min(M.vt, S.huntV + M.a * dt);
  e.walker.speedScale = S.huntV / WALK;
}
