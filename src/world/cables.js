// ─────────────────────────────────────────────────────────────────────────────
//  Rede de "cabos orgânicos".
//
//  1. Catenárias: cabos pendurados entre dois pontos (a escolha dos pares fica
//     em gen/chunkgen.js), engrossando nas pontas e com nódulos — meio cabo de
//     fibra, meio tendão.
//  2. Tentáculos L-system: árvores de galhos que pendem da ponte e das torres
//     ou sobem do abismo (tropismo invertido).
//  3. Fios de prumo: linhas longas e finas caindo no abismo (escala vertical).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { buildTaperedTube, mergeAll } from './geometry.js';
import { GRAMMARS, expandLSystem, interpretLSystem } from './lsystem.js';

/** Cabo pendurado entre a e b. */
export function catenaryCable(a, b, { rng, noise3, radius = 0.6, sag = 0.25, points = 18 }) {
  const pts = [];
  const radii = [];
  const span = a.distanceTo(b);
  const sagAmount = span * sag * rng.float(0.6, 1.4);
  const seed = rng.float(0, 100);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sagAmount * 4 * t * (1 - t);
    // ondulação lateral leve (cabos que "se acomodaram")
    const w = Math.sin(t * Math.PI);
    p.x += noise3(seed, t * 3, 0) * span * 0.03 * w;
    p.z += noise3(0, t * 3, seed) * span * 0.03 * w;
    pts.push(p);
    // mais grosso nas pontas, com nódulos no meio
    const bulge = Math.max(0, noise3(seed, t * 6, 5)) * 0.9;
    radii.push(radius * (1 + 0.9 * (1 - w) + bulge));
  }
  return buildTaperedTube(pts, radii, { radialSegments: 7, smooth: 3 });
}

/**
 * Planta um tentáculo L-system.
 * @param {THREE.Vector3} origin
 * @param {'down'|'up'} dir  pender (gravidade) ou subir do abismo
 * heading/tropism opcionais sobrescrevem a direção inicial e a "gravidade".
 */
export function buildTendril(origin, { rng, dir = 'down', grammar = 'tendril', iterations = 4, scale = 1, heading, tropism }) {
  const g = GRAMMARS[grammar];
  const str = expandLSystem(g.axiom, g.rules, iterations, rng);
  const down = dir === 'down';
  const branches = interpretLSystem(str, {
    rng,
    origin,
    heading: heading ?? new THREE.Vector3(rng.float(-0.4, 0.4), down ? -1 : 1, rng.float(-0.4, 0.4)),
    step: rng.float(2.5, 4.5) * scale,
    radius: rng.float(0.35, 0.8) * scale,
    angle: THREE.MathUtils.degToRad(rng.float(20, 40)),
    tropism: tropism ?? new THREE.Vector3(0, down ? -1 : 1, 0),
    tropismStrength: rng.float(0.06, 0.2),
    jitter: 0.3,
  });
  const geoms = branches.map((b) =>
    buildTaperedTube(b.points, b.radii, { radialSegments: b.radii[0] > 0.3 ? 6 : 4, smooth: 2 }),
  );
  return mergeAll(geoms);
}

/** Fio de prumo: linha quase reta caindo no abismo, com leve deriva. */
export function plumbLine(top, length, { rng, radius = 0.12 }) {
  const pts = [];
  const radii = [];
  const n = 10;
  const drift = new THREE.Vector3(rng.float(-1, 1), 0, rng.float(-1, 1)).multiplyScalar(length * 0.04);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(new THREE.Vector3(top.x + drift.x * t * t, top.y - length * t, top.z + drift.z * t * t));
    radii.push(radius * (i === n - 1 ? 0.2 : 1 + 0.5 * Math.sin(t * 20)));
  }
  return buildTaperedTube(pts, radii, { radialSegments: 4, smooth: 2 });
}
