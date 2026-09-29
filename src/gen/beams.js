// ─────────────────────────────────────────────────────────────────────────────
//  Geometria dos feixes de luz volumétricos.
//  Um cilindro aberto que desce a partir da fonte; a coordenada "ao longo do
//  feixe" (0 na fonte → 1 no fim) vai codificada em normal.y — o shader do
//  feixe (materials.js → createBeamMaterial) a usa para o degradê.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';

/**
 * @param {THREE.Vector3} top  ponto da fonte (coordenadas locais do chunk)
 * @param {number} length      comprimento (para baixo)
 * @param {number} r0          raio na fonte
 * @param {number} r1          raio no fim (a luz abre um pouco)
 */
export function beamGeometry(top, length, r0, r1, segments = 18) {
  const g = new THREE.CylinderGeometry(r0, r1, length, segments, 6, true);
  g.translate(0, -length / 2, 0);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const along = Math.min(1, Math.max(0, -pos.getY(i) / length));
    nor.setY(i, along);
  }
  g.translate(top.x, top.y, top.z);
  return g;
}
