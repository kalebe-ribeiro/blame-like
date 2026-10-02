// Teste de viabilidade do corte de verdade para a arma de Killy (ver o cofre, Arma-do-Killy):
// gera chunks reais, passa um "feixe" (cilindro) por eles e recorta, peça por peça, as que o
// cilindro atravessa (three-bvh-csg: peça − cilindro). Mede o tempo, conta as peças e confere
// que nenhum triângulo do resultado ficou dentro do cilindro.
//   node tools/csg-spike.mjs [raio] [n de chunks]
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { Field, CHUNK } from '../src/gen/field.js';
import { ChunkBuilder, generateChunk } from '../src/gen/chunkgen.js';
import { generateMacro } from '../src/gen/macrogen.js';

const R = Number(process.argv[2] || 1.4);
const COUNT = Number(process.argv[3] || 12);
const F = new Field(parseInt('abc', 36), []);

// as peças de cada chunk, antes de serem fundidas por material
let pieces = [];
const add = ChunkBuilder.prototype.add;
ChunkBuilder.prototype.add = function (mat, geom) {
  if (geom) pieces.push({ mat, geom: geom.clone(), x0: this.x0, y0: this.y0, z0: this.z0 });
  return add.call(this, mat, geom);
};

const ev = new Evaluator();
ev.attributes = ['position', 'normal'];
ev.useGroups = false;

const dist = (p, a, b) => {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
};

let tot = { chunks: 0, pieces: 0, cut: 0, ms: 0, worst: 0, worstChunk: 0, fail: 0, leftInside: 0, tris0: 0, tris1: 0, open: 0 };
let rnd = 7;
const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let c = 0; c < COUNT; c++) {
  // chunks de verdade em lugares variados (perto da origem e na teia/colmeia)
  const cx = Math.floor(rand() * 40) - 20;
  const cy = Math.floor(rand() * 16) - 8;
  const cz = Math.floor(rand() * 40) - 20;
  pieces = [];
  generateChunk(F, cx, cy, cz, 0);
  if (rand() < 0.3) generateMacro(F, cx >> 2, cy >> 2, cz >> 2);
  if (!pieces.length) continue;
  // o feixe: atravessa o chunk numa direção qualquer, passando por uma peça ao acaso
  const target = pieces[Math.floor(rand() * pieces.length)];
  target.geom.computeBoundingBox();
  const mid = target.geom.boundingBox.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.4, rand() - 0.5).normalize();
  const A = mid.clone().addScaledVector(dir, -120);
  const Bp = mid.clone().addScaledVector(dir, 120);
  const len = A.distanceTo(Bp);
  const cyl = new THREE.CylinderGeometry(R, R, len, 24, 1, false);
  cyl.rotateX(Math.PI / 2); // eixo z
  const m = new THREE.Matrix4().lookAt(A, Bp, new THREE.Vector3(0, 1, 0));
  cyl.applyMatrix4(m);
  cyl.translate((A.x + Bp.x) / 2, (A.y + Bp.y) / 2, (A.z + Bp.z) / 2);
  const cutter = new Brush(cyl);
  cutter.updateMatrixWorld();
  let chunkMs = 0;
  for (const pc of pieces) {
    const g = pc.geom;
    if (!g.index) continue;
    g.computeBoundingSphere();
    const bs = g.boundingSphere;
    if (dist(bs.center, A, Bp) > bs.radius + R) continue; // longe do feixe
    tot.pieces++;
    // a peça é atravessada? (algum vértice dentro do cilindro, ou o eixo passa pela caixa)
    g.computeBoundingBox();
    const ray = new THREE.Ray(A, dir);
    const hitsBox = ray.intersectBox(g.boundingBox.clone().expandByScalar(R), new THREE.Vector3()) !== null;
    if (!hitsBox) continue;
    if (!g.attributes.normal) g.computeVertexNormals();
    const tris0 = g.index.count / 3;
    const t0 = performance.now();
    let out;
    try {
      const br = new Brush(g);
      br.updateMatrixWorld();
      out = ev.evaluate(br, cutter, SUBTRACTION);
    } catch (err) {
      tot.fail++;
      continue;
    }
    const ms = performance.now() - t0;
    chunkMs += ms;
    tot.worst = Math.max(tot.worst, ms);
    const og = out.geometry;
    const pos = og.attributes.position;
    const nT = (og.index ? og.index.count : pos.count) / 3;
    if (nT === tris0 && og.index && og.index.count === g.index.count) continue; // não cortou nada
    tot.cut++;
    tot.tris0 += tris0;
    tot.tris1 += nT;
    // conferência: nenhum triângulo com o centro dentro do cilindro
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t < nT; t++) {
      for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(pos, og.index ? og.index.getX(t * 3 + j) : t * 3 + j);
      const cc = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
      // (o cilindro é um polígono de 24 lados: a face dele fica a R·cos(π/24) do eixo)
      if (dist(cc, A, Bp) < R * Math.cos(Math.PI / 24) - 0.03) {
        tot.leftInside++;
        (tot.bad ??= {})[pc.mat] = (tot.bad[pc.mat] ?? 0) + 1;
      }
    }
  }
  tot.chunks++;
  tot.ms += chunkMs;
  tot.worstChunk = Math.max(tot.worstChunk, chunkMs);
}
console.log(`raio ${R} m · ${tot.chunks} chunks · ${tot.pieces} peças perto do feixe · ${tot.cut} cortadas · falhas ${tot.fail}`);
console.log(`tempo: ${tot.ms.toFixed(0)} ms no total · ${(tot.ms / Math.max(1, tot.chunks)).toFixed(1)} ms/chunk (pior ${tot.worstChunk.toFixed(0)}) · ${(tot.ms / Math.max(1, tot.cut)).toFixed(1)} ms/peça (pior ${tot.worst.toFixed(0)})`);
console.log('sobras por material:', JSON.stringify(tot.bad ?? {}));
console.log(`triângulos das peças cortadas: ${tot.tris0} → ${tot.tris1} · triângulos que ficaram dentro do cilindro: ${tot.leftInside}`);
