// Os fragmentos soltos do corte (arma de Killy, decisão C1): dois cortes paralelos numa peça fina
// soltam o pedaço do meio (vira detrito); um corte numa parede não solta nada.
//   node tools/csg-fragments.mjs
import * as THREE from 'three';
import * as CSGLIB from 'three-bvh-csg';
import { Field } from '../src/gen/field.js';
import { ChunkBuilder, generateChunk } from '../src/gen/chunkgen.js';
import { setCSG } from '../src/gen/cut.js';
setCSG(CSGLIB);
const F = new Field(parseInt('abc', 36), []);
// acha um chunk com uma peça fina e comprida (um corrimão, um cabo de ponte…)
let pieces = [];
const add = ChunkBuilder.prototype.add;
ChunkBuilder.prototype.add = function (mat, geom) { if (geom && !this.cutsL.length) pieces.push({ mat, geom: geom.clone(), x0: this.x0, y0: this.y0, z0: this.z0 }); return add.call(this, mat, geom); };
let found = null;
for (let i = -6; i <= 6 && !found; i++) for (let k = -6; k <= 6 && !found; k++) {
  pieces = [];
  generateChunk(F, i, 0, k, 0);
  for (const p of pieces) {
    p.geom.computeBoundingBox();
    const b = p.geom.boundingBox; const s = b.getSize(new THREE.Vector3());
    const dims = [s.x, s.y, s.z].sort((a, c) => a - c);
    if (dims[2] > 12 && dims[1] < 0.6 && p.mat === 'rib') { found = { p, b, s, i, k }; break; }
  }
}
if (!found) { console.log('nenhuma peça fina'); process.exit(); }
const { p, b, s, i, k } = found;
const c = b.getCenter(new THREE.Vector3()).add(new THREE.Vector3(p.x0, p.y0, p.z0));
const along = s.x > s.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
const across = new THREE.Vector3(along.z, 0, along.x);
const mk = (off) => { const m = c.clone().addScaledVector(along, off); return { a: m.clone().addScaledVector(across, -20).toArray(), b: m.clone().addScaledVector(across, 20).toArray(), r: 0.5 }; };
F.setCuts([mk(-1.2), mk(1.2)]);
const res = generateChunk(F, i, 0, k, 0);
console.log(`peça ${p.mat} ${s.x.toFixed(1)}×${s.y.toFixed(1)}×${s.z.toFixed(1)} · cortadas ${res.cutStats.cut} · detritos ${res.debris.length}`, res.debris.slice(0, 3).map((d) => `${d.mat} ${d.sx.toFixed(1)}×${d.sy.toFixed(1)}×${d.sz.toFixed(1)}`));
// um corte só, numa parede: nada solto
F.setCuts([{ a: c.clone().add(new THREE.Vector3(0, 0, -30)).toArray(), b: c.clone().add(new THREE.Vector3(0, 0, 30)).toArray(), r: 2.8 }]);
const res2 = generateChunk(F, i, 0, k, 0);
console.log(`um corte de 2,8 m pelo meio do chunk: cortadas ${res2.cutStats.cut} · detritos ${res2.debris.length}`, res2.debris.slice(0, 5).map((d) => `${d.mat} ${d.sx.toFixed(1)}×${d.sy.toFixed(1)}×${d.sz.toFixed(1)}`));
// caso sintético: uma viga de 10 m entre dois pilares, dois cortes no meio — o pedaço do
// meio fica solto (vira detrito); as pontas ficam (presas aos pilares)
{
  const B = new ChunkBuilder(0, 0, 0, 0);
  B.size = 192;
  B.setCuts([
    { a: [98.5, 50, 80], b: [98.5, 50, 120], r: 0.6 },
    { a: [101.5, 50, 80], b: [101.5, 50, 120], r: 0.6 },
  ]);
  B.add('frame', new THREE.BoxGeometry(10, 0.4, 0.4).translate(100, 50, 100));
  B.add('frame', new THREE.BoxGeometry(0.6, 6, 0.6).translate(95.3, 50, 100)); // pilar (encosta na ponta)
  B.add('frame', new THREE.BoxGeometry(0.6, 6, 0.6).translate(104.7, 50, 100));
  const out = B.finish();
  console.log(`sintético: cortadas ${out.cutStats.cut} · detritos ${out.debris.length}`, out.debris.map((d) => `${d.sx.toFixed(1)}×${d.sy.toFixed(1)}×${d.sz.toFixed(1)} em x ${d.x.toFixed(1)}`));
}
