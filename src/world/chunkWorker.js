// ─────────────────────────────────────────────────────────────────────────────
//  Web Worker de geração. Recebe { jobId, layer, level, seed, cx, cy, cz, reserved }
//  e devolve os buffers de geometria (transferidos, sem cópia) + luzes.
//  Ou { jobId, task: 'circuit', seed, reserved, t, salt }: o circuito de ronda de um
//  território (gen/patrols.js) — a busca no grafo leva até ~100 ms e travava o quadro.
// ─────────────────────────────────────────────────────────────────────────────
import { Field } from '../gen/field.js';
import { generateChunk } from '../gen/chunkgen.js';
import { generateMacro } from '../gen/macrogen.js';
import { NavGraph } from '../gen/nav.js';
import { patrolCircuit } from '../gen/patrols.js';
import { MeshBVH } from '../lib/three-mesh-bvh.js';
import { BufferGeometry, BufferAttribute } from '../lib/three.js';
import { NO_COLLIDE } from './noCollide.js';
import * as CSGLIB from '../lib/three-bvh-csg.js';
import { setCSG } from '../gen/cut.js';

setCSG(CSGLIB);

let field = null;
let fieldKey = '';
let nav = null;

self.onmessage = (e) => {
  const { jobId, layer, level = 0, seed, cx, cy, cz, reserved } = e.data;
  const t0 = performance.now();
  try {
    const key = `${seed}|${JSON.stringify(reserved)}`;
    if (!field || fieldKey !== key) {
      field = new Field(seed, reserved);
      fieldKey = key;
      nav = null;
    }
    if (e.data.task === 'circuit') {
      field.setCuts(e.data.cuts ?? []);
      nav ??= new NavGraph(field);
      self.postMessage({ jobId, circuit: patrolCircuit(field, nav, e.data.t, e.data.salt) });
      return;
    }
    field.setCuts(e.data.cuts ?? []); // (os cortes do emissor que tocam este chunk)
    const res = layer === 'macro' ? generateMacro(field, cx, cy, cz) : generateChunk(field, cx, cy, cz, level);
    const transfer = [];
    for (const m of res.meshes) transfer.push(m.position.buffer, m.normal.buffer, m.index.buffer);
    // as camadas com colisão: a árvore (BVH) de cada malha montada aqui, fora do quadro — ela
    // reordena o índice (o mesmo array que segue para a GPU) e vai serializada
    if (e.data.collide) {
      for (const m of res.meshes) {
        if (NO_COLLIDE.has(m.mat)) continue;
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(m.position, 3));
        g.setIndex(new BufferAttribute(m.index, 1));
        const s = MeshBVH.serialize(new MeshBVH(g, { maxLeafTris: 12 }), { cloneBuffers: false });
        /** @type {any} */ (m).bvh = s.roots;
        for (const r of s.roots) transfer.push(r);
      }
    }
    /** @type {any} */ (self).postMessage({ jobId, ...res, workMs: performance.now() - t0 }, transfer); // (o tempo de trabalho, sem a fila)
  } catch (err) {
    self.postMessage({ jobId, error: String(err && err.stack ? err.stack : err), meshes: [], lights: [] });
  }
};
