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

let field = null;
let fieldKey = '';
let nav = null;

self.onmessage = (e) => {
  const { jobId, layer, level = 0, seed, cx, cy, cz, reserved } = e.data;
  try {
    const key = `${seed}|${JSON.stringify(reserved)}`;
    if (!field || fieldKey !== key) {
      field = new Field(seed, reserved);
      fieldKey = key;
      nav = null;
    }
    if (e.data.task === 'circuit') {
      nav ??= new NavGraph(field);
      self.postMessage({ jobId, circuit: patrolCircuit(field, nav, e.data.t, e.data.salt) });
      return;
    }
    const res = layer === 'macro' ? generateMacro(field, cx, cy, cz) : generateChunk(field, cx, cy, cz, level);
    const transfer = [];
    for (const m of res.meshes) transfer.push(m.position.buffer, m.normal.buffer, m.index.buffer);
    /** @type {any} */ (self).postMessage({ jobId, ...res }, transfer);
  } catch (err) {
    self.postMessage({ jobId, error: String(err && err.stack ? err.stack : err), meshes: [], lights: [] });
  }
};
