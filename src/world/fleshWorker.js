// O worker das malhas contínuas (world/flesh.js): monta a malha de uma camada fora do quadro.
import { meshArrays } from './fleshMesh.js';

self.onmessage = (e) => {
  const { id, prims, nb, cell } = e.data;
  const mesh = meshArrays(prims, nb, cell);
  /** @type {any} */ (self).postMessage({ id, mesh }, [mesh.pos.buffer, mesh.nrm.buffer, mesh.sIdx.buffer, mesh.sW.buffer, mesh.idx.buffer]);
};
