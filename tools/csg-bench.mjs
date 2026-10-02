// O orçamento do worker da arma de Killy (o cofre, Arma-do-Killy §8): um chunk com N cortes
// (padrão 50) — limite 2 s. Chunks reais (perto e macro), cortes ao acaso atravessando cada
// um (raio 0,6–2,8 m), o mesmo caminho do worker (generateChunk / generateMacro com os
// cortes no Field). Dois casos:
//   incremental  os cortes chegam um a um (como no jogo: tiro a tiro) — mede o N-ésimo, com a
//                memória das peças (chunkgen.js pieceMemo) dos N − 1 anteriores
//   frio         os N de uma vez, sem memória (o worker que nunca viu o chunk)
// E confere: nenhum triângulo de saída dentro de um corte, nos dois casos.
//   node tools/csg-bench.mjs [n de cortes] [n de chunks] [semente do sorteio]
import * as THREE from 'three';
import * as CSGLIB from 'three-bvh-csg';
import { Field, CHUNK, MACRO } from '../src/gen/field.js';
import { generateChunk, clearPieceMemo } from '../src/gen/chunkgen.js';
import { generateMacro } from '../src/gen/macrogen.js';
import { setCSG, insideCuts } from '../src/gen/cut.js';

setCSG(CSGLIB);
const N = Number(process.argv[2] || 50);
const COUNT = Number(process.argv[3] || 8);
let rnd = Number(process.argv[4] || 11);
const rand = () => (rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296;
const F = new Field(parseInt('abc', 36), []);

/** N cortes que atravessam a caixa (lado S, canto c0). */
function cutsThrough(c0, S) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const p = new THREE.Vector3(c0[0] + rand() * S, c0[1] + rand() * S, c0[2] + rand() * S);
    const d = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.5, rand() - 0.5).normalize();
    const a = p.clone().addScaledVector(d, -S);
    const b = p.clone().addScaledVector(d, S);
    out.push({ id: `B${i}`, a: a.toArray(), b: b.toArray(), r: 0.6 + rand() * 2.2 });
  }
  return out;
}

const NO_CUT = new Set(['beam', 'colossusBeam', 'barrier']);

/** Triângulos de saída dentro de algum corte (o raio encolhido: o cilindro é um polígono). */
function inside(out, org, cuts) {
  const shrunk = cuts.map((c) => ({ ...c, r: c.r * Math.cos(Math.PI / 24) - 0.05 }));
  let n = 0;
  let tris = 0;
  const mats = new Map();
  for (const m of out?.meshes ?? []) {
    if (m.mat === 'cut' || NO_CUT.has(m.mat)) continue; // (a laje e os feixes de luz não se cortam — chunkgen.js NO_CUT)
    const p = m.position;
    const ix = m.index;
    for (let i = 0; i < ix.length; i += 3) {
      tris++;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 3; k++) {
        x += p[ix[i + k] * 3];
        y += p[ix[i + k] * 3 + 1];
        z += p[ix[i + k] * 3 + 2];
      }
      if (insideCuts(x / 3 + org[0], y / 3 + org[1], z / 3 + org[2], shrunk)) {
        n++;
        mats.set(m.mat, (mats.get(m.mat) ?? 0) + 1);
      }
    }
  }
  return { n, tris, mats: [...mats].map(([k, v]) => `${k}:${v}`).join(' ') };
}

const rows = [];
for (let c = 0; c < COUNT; c++) {
  const macro = c % 4 === 3; // (um em cada quatro: a camada macro, peças maiores)
  const cx = Math.floor(rand() * 40) - 20;
  const cy = Math.floor(rand() * 16) - 8;
  const cz = Math.floor(rand() * 40) - 20;
  const S = macro ? MACRO : CHUNK;
  const [ix, iy, iz] = macro ? [Math.floor((cx * CHUNK) / MACRO), Math.floor((cy * CHUNK) / MACRO), Math.floor((cz * CHUNK) / MACRO)] : [cx, cy, cz];
  const org = [ix * S, iy * S, iz * S];
  const gen = () => (macro ? generateMacro(F, ix, iy, iz) : generateChunk(F, ix, iy, iz, 0));
  const cuts = cutsThrough(org, S);
  // incremental: tiro a tiro
  clearPieceMemo();
  let last = 0;
  let worst = 0;
  let outInc = null;
  for (let k = 1; k <= N; k++) {
    F.setCuts(cuts.slice(0, k));
    const t0 = performance.now();
    outInc = gen();
    last = performance.now() - t0;
    worst = Math.max(worst, last);
  }
  // frio: os N de uma vez
  clearPieceMemo();
  F.setCuts(cuts);
  const t0 = performance.now();
  const outCold = gen();
  const cold = performance.now() - t0;
  const iInc = inside(outInc, org, cuts);
  const iCold = inside(outCold, org, cuts);
  rows.push({ layer: macro ? 'macro' : 'chunk', at: `${ix},${iy},${iz}`, last, worst, cold, iInc, iCold, pieces: outCold?.cutStats?.cut ?? 0 });
}
clearPieceMemo();
const pct = (arr, q) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
};
for (const r of rows) {
  console.log(
    `${r.layer.padEnd(5)} ${r.at.padEnd(12)} ${String(r.pieces).padStart(3)} peças · ${N}º corte ${r.last.toFixed(0).padStart(5)} ms (pior da sequência ${r.worst.toFixed(0)}) · frio ${r.cold.toFixed(0).padStart(5)} ms · dentro: incremental ${r.iInc.n}/${r.iInc.tris} · frio ${r.iCold.n}/${r.iCold.tris}${r.iCold.mats ? ' (' + r.iCold.mats + ')' : ''}`,
  );
}
const inc = rows.map((r) => r.last);
const seq = rows.map((r) => r.worst);
const cold = rows.map((r) => r.cold);
const bad = rows.reduce((q, r) => q + r.iInc.n + r.iCold.n, 0);
console.log(`incremental (o ${N}º corte): p50 ${pct(inc, 0.5).toFixed(0)} · p95 ${pct(inc, 0.95).toFixed(0)} · máx ${pct(inc, 1).toFixed(0)} ms — pior tiro da sequência ${pct(seq, 1).toFixed(0)} ms (limite 2000) — ${pct(seq, 1) <= 2000 ? 'DENTRO' : 'ACIMA'}`);
console.log(`frio (${N} de uma vez): p50 ${pct(cold, 0.5).toFixed(0)} · p95 ${pct(cold, 0.95).toFixed(0)} · máx ${pct(cold, 1).toFixed(0)} ms`);
console.log(`triângulos dentro de cortes: ${bad}`);
