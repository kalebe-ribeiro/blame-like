// ─────────────────────────────────────────────────────────────────────────────
//  L-system estocástico 3D + tartaruga.
//
//  Alfabeto interpretado pela tartaruga:
//    F      avança um passo (gera segmento)
//    + -    gira em torno do eixo "up"     (yaw)
//    & ^    gira em torno do eixo "left"   (pitch)
//    \ /    gira em torno do eixo "heading"(roll)
//    !      afina o raio e encurta o passo
//    [ ]    empilha / desempilha estado (inicia / fecha um galho)
//  Qualquer outro símbolo (A, B, X...) é só variável de reescrita.
//
//  Para criar novas "espécies" basta trocar as regras em GRAMMARS.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';

/** Gramáticas prontas. Regras podem ser string (determinística) ou lista {p, s}. */
export const GRAMMARS = {
  // tentáculos pendentes: ramificam pouco, com muita curvatura
  tendril: {
    axiom: 'FFA',
    rules: {
      A: [
        { p: 0.4, s: 'F[&+!A]F[^-!A]/A' },
        { p: 0.3, s: 'F[&!A]\\F[^!A]FA' },
        { p: 0.3, s: 'FF!A' },
      ],
    },
  },
  // raízes/nervos: ramificação densa, como dendritos ou barramentos
  dendrite: {
    axiom: 'FA',
    rules: {
      A: [
        { p: 0.5, s: 'F[+!A][-!A][&!A]' },
        { p: 0.3, s: 'F[\\&!A][/^!A]FA' },
        { p: 0.2, s: 'FFA' },
      ],
    },
  },
};

export function expandLSystem(axiom, rules, iterations, rng, maxLength = 30000) {
  let s = axiom;
  for (let it = 0; it < iterations; it++) {
    let out = '';
    for (const ch of s) {
      const r = rules[ch];
      if (!r) {
        out += ch;
      } else if (typeof r === 'string') {
        out += r;
      } else {
        const x = rng.next();
        let acc = 0;
        let chosen = r[r.length - 1].s;
        for (const opt of r) {
          acc += opt.p;
          if (x <= acc) {
            chosen = opt.s;
            break;
          }
        }
        out += chosen;
      }
      if (out.length > maxLength) break;
    }
    s = out;
    if (s.length > maxLength) break;
  }
  return s;
}

const _q = new THREE.Quaternion();

function rotateFrame(frame, axis, angle) {
  _q.setFromAxisAngle(axis, angle);
  frame.H.applyQuaternion(_q);
  frame.L.applyQuaternion(_q);
  frame.U.applyQuaternion(_q);
}

function orthonormalize(frame) {
  frame.H.normalize();
  frame.L.crossVectors(frame.U, frame.H).normalize();
  frame.U.crossVectors(frame.H, frame.L).normalize();
}

/**
 * Interpreta a string com uma tartaruga 3D e retorna galhos como polilinhas
 * com raio por ponto: [{ points: Vector3[], radii: number[] }].
 */
export function interpretLSystem(str, opts) {
  const {
    rng,
    origin,
    heading = new THREE.Vector3(0, -1, 0),
    step = 2,
    angle = THREE.MathUtils.degToRad(28),
    radius = 0.5,
    radiusDecay = 0.7,
    stepDecay = 0.88,
    tropism = new THREE.Vector3(0, -1, 0), // direção para onde os galhos "caem"
    tropismStrength = 0.12,
    jitter = 0.25, // desvio aleatório por passo — orgânico, não mecânico
  } = opts;

  const H = heading.clone().normalize();
  const helper = Math.abs(H.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const L = new THREE.Vector3().crossVectors(helper, H).normalize();
  const U = new THREE.Vector3().crossVectors(H, L).normalize();

  let st = { pos: origin.clone(), H, L, U, r: radius, step };
  let current = { points: [st.pos.clone()], radii: [st.r] };
  const stack = [];
  const branches = [];

  const jitterAngle = () => rng.float(-jitter, jitter);
  const turn = () => angle * rng.float(0.7, 1.3);

  for (const ch of str) {
    switch (ch) {
      case 'F': {
        rotateFrame(st, st.U, jitterAngle());
        rotateFrame(st, st.L, jitterAngle());
        st.H.addScaledVector(tropism, tropismStrength);
        orthonormalize(st);
        st.pos.addScaledVector(st.H, st.step);
        st.r *= 0.985;
        current.points.push(st.pos.clone());
        current.radii.push(st.r);
        break;
      }
      case '+': rotateFrame(st, st.U, turn()); break;
      case '-': rotateFrame(st, st.U, -turn()); break;
      case '&': rotateFrame(st, st.L, turn()); break;
      case '^': rotateFrame(st, st.L, -turn()); break;
      case '\\': rotateFrame(st, st.H, turn()); break;
      case '/': rotateFrame(st, st.H, -turn()); break;
      case '!':
        st.r *= radiusDecay;
        st.step *= stepDecay;
        break;
      case '[':
        stack.push({
          st: { pos: st.pos.clone(), H: st.H.clone(), L: st.L.clone(), U: st.U.clone(), r: st.r, step: st.step },
          current,
        });
        current = { points: [st.pos.clone()], radii: [st.r] };
        break;
      case ']': {
        if (current.points.length > 1) branches.push(current);
        const saved = stack.pop();
        if (saved) {
          st = saved.st;
          current = saved.current;
        }
        break;
      }
      default:
        break;
    }
  }
  if (current.points.length > 1) branches.push(current);
  return branches;
}
