// ─────────────────────────────────────────────────────────────────────────────
//  Cabos.
//
//  1. Catenárias: cabos pendurados entre dois pontos (a escolha dos pares fica
//     em gen/chunkgen.js), engrossando nas pontas.
//  2. Fios de prumo: linhas longas e finas caindo no abismo (escala vertical).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { buildTaperedTube } from './geometry.js';

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

/**
 * O material de um cabo pelo raio: fino ('cable') não colide (fios, cabos das passarelas — o corpo
 * passa por eles); grosso ('hose', o mesmo desenho) colide — um cabo de 0,4 a 3 m de grossura é um
 * tubo, não um fio (achado no playtest: catenárias de até 1,6 m de raio atravessadas pelo corpo).
 */
// (0,1 m: um cabo de 20 cm de grossura já é um obstáculo — o usuário atravessou os de 0,12–0,18, 2026-10-09)
export const HOSE_R = 0.1;
export function cableMat(radius) {
  return radius >= HOSE_R ? 'hose' : 'cable';
}
