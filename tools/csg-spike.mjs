// Viabilidade do corte de verdade (arma de Killy — o cofre, Arma-do-Killy, fase F1):
// chunks reais, um feixe (cilindro) atravessando, cada peça recortada pelo módulo do jogo
// (src/gen/cut.js). Confere, peça por peça:
//   • nada sobra DENTRO do cilindro;
//   • a área FORA do cilindro é a mesma de antes (nada some indevidamente);
// e mede o tempo. As lajes das camadas ('barrier') ficam de fora (a arma não as corta).
//   node tools/csg-spike.mjs [raio] [n de chunks] [semente do sorteio]
import * as THREE from 'three';
import * as CSGLIB from 'three-bvh-csg';
import { Field } from '../src/gen/field.js';
import { ChunkBuilder, generateChunk } from '../src/gen/chunkgen.js';
import { generateMacro } from '../src/gen/macrogen.js';
import { setCSG, cutPiece, areaOutside, insideCuts } from '../src/gen/cut.js';

setCSG(CSGLIB);
const R = Number(process.argv[2] || 1.4);
const COUNT = Number(process.argv[3] || 12);
let rnd = Number(process.argv[4] || 7);
const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
const F = new Field(parseInt('abc', 36), []);

let pieces = [];
const add = ChunkBuilder.prototype.add;
ChunkBuilder.prototype.add = function (mat, geom) {
  if (geom) pieces.push({ mat, geom: geom.clone() });
  return add.call(this, mat, geom);
};

const st = { chunks: 0, cut: 0, csg: 0, clip: 0, failCsg: 0, ms: [], chunkMs: [], badArea: [], inside: 0, tris0: 0, tris1: 0 };
for (let c = 0; c < COUNT; c++) {
  const cx = Math.floor(rand() * 40) - 20;
  const cy = Math.floor(rand() * 16) - 8;
  const cz = Math.floor(rand() * 40) - 20;
  pieces = [];
  generateChunk(F, cx, cy, cz, 0);
  if (rand() < 0.3) generateMacro(F, cx >> 2, cy >> 2, cz >> 2);
  const cand = pieces.filter((p) => p.mat !== 'barrier');
  if (!cand.length) continue;
  const target = cand[Math.floor(rand() * cand.length)];
  target.geom.computeBoundingBox();
  const mid = target.geom.boundingBox.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.4, rand() - 0.5).normalize();
  const A = mid.clone().addScaledVector(dir, -120);
  const B = mid.clone().addScaledVector(dir, 120);
  const cuts = [{ a: A.toArray(), b: B.toArray(), r: R }];
  const shrunk = cuts.map((q) => ({ ...q, r: q.r * Math.cos(Math.PI / 24) - 0.03 })); // (o cilindro é um polígono de 24 lados)
  let chunkMs = 0;
  for (const pc of cand) {
    const g = pc.geom;
    g.computeBoundingSphere();
    const t0 = performance.now();
    const res = cutPiece(g, cuts, { maxEdge: Math.min(0.5, R / 3) });
    const ms = performance.now() - t0;
    if (res.mode === 'none') continue;
    chunkMs += ms;
    st.ms.push(ms);
    st.cut++;
    if (res.mode === 'csg') st.csg++;
    else if (res.mode === 'clip') st.clip++;
    else st.failCsg++;
    const k = res.kept;
    if (k) {
      const p = k.attributes.position;
      const ix = k.index;
      for (let i = 0; i < ix.count; i += 3) {
        const v = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)];
        const x = (p.getX(v[0]) + p.getX(v[1]) + p.getX(v[2])) / 3;
        const y = (p.getY(v[0]) + p.getY(v[1]) + p.getY(v[2])) / 3;
        const z = (p.getZ(v[0]) + p.getZ(v[1]) + p.getZ(v[2])) / 3;
        if (insideCuts(x, y, z, shrunk)) {
          st.inside++;
          const key = `${pc.mat}/${res.mode}`;
          (st.insideBy ??= {})[key] = (st.insideBy[key] ?? 0) + 1;
        }
      }
    }
    const a0 = areaOutside(g, cuts, 0.25);
    const a1 = k ? areaOutside(k, cuts, 0.25) : 0;
    // tolerância: 1% da área, e no mínimo a faixa da borda (2 × perímetro do furo × passo)
    if (Math.abs(a1 - a0) > Math.max(0.01 * a0, 2 * 2 * Math.PI * R * 0.25)) st.badArea.push({ mat: pc.mat, mode: res.mode, antes: +a0.toFixed(1), depois: +a1.toFixed(1) });
    st.tris0 += (g.index ? g.index.count : g.attributes.position.count) / 3;
    st.tris1 += (k ? k.index.count / 3 : 0) + (res.caps ? res.caps.index.count / 3 : 0);
  }
  st.chunks++;
  st.chunkMs.push(chunkMs);
}
const pct = (arr, q) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
};
console.log(`raio ${R} m · ${st.chunks} chunks · ${st.cut} peças cortadas (csg ${st.csg} · abertas ${st.clip} · csg falhou→recorte ${st.failCsg})`);
console.log(`tempo por peça: p50 ${pct(st.ms, 0.5).toFixed(1)} · p95 ${pct(st.ms, 0.95).toFixed(1)} · máx ${pct(st.ms, 1).toFixed(0)} ms`);
console.log(`tempo por chunk: p50 ${pct(st.chunkMs, 0.5).toFixed(0)} · p95 ${pct(st.chunkMs, 0.95).toFixed(0)} · máx ${pct(st.chunkMs, 1).toFixed(0)} ms`);
console.log('dentro, por peça/modo:', JSON.stringify(st.insideBy ?? {}));
console.log(`dentro do furo: ${st.inside} triângulos · área de fora alterada: ${st.badArea.length} peças ${JSON.stringify(st.badArea.slice(0, 6))}`);
console.log(`triângulos das peças cortadas: ${st.tris0} → ${st.tris1}`);
