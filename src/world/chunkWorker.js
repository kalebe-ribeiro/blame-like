// ─────────────────────────────────────────────────────────────────────────────
//  Web Worker de geração. Recebe { jobId, layer, level, seed, cx, cy, cz, reserved }
//  e devolve os buffers de geometria (transferidos, sem cópia) + luzes.
// ─────────────────────────────────────────────────────────────────────────────
import { Field } from '../gen/field.js';
import { generateChunk } from '../gen/chunkgen.js';
import { generateMacro } from '../gen/macrogen.js';

let field = null;
let fieldKey = '';

self.onmessage = (e) => {
  const { jobId, layer, level = 0, seed, cx, cy, cz, reserved } = e.data;
  try {
    const key = `${seed}|${JSON.stringify(reserved)}`;
    if (!field || fieldKey !== key) {
      field = new Field(seed, reserved);
      fieldKey = key;
    }
    const res = layer === 'macro' ? generateMacro(field, cx, cy, cz) : generateChunk(field, cx, cy, cz, level);
    const transfer = [];
    for (const m of res.meshes) transfer.push(m.position.buffer, m.normal.buffer, m.index.buffer);
    self.postMessage({ jobId, ...res }, transfer);
  } catch (err) {
    self.postMessage({ jobId, error: String(err && err.stack ? err.stack : err), meshes: [], lights: [] });
  }
};
