// ─────────────────────────────────────────────────────────────────────────────
//  Streaming do mundo infinito.
//
//  WorkerPool   N workers de geração + fila com prioridade.
//  ChunkLayer   mantém carregados os cubos dentro de um raio ao redor do
//               observador; pede os que faltam (mais próximos e à frente
//               primeiro), descarta os que ficaram para trás e sobe a
//               geometria para a GPU aos poucos (orçamento por frame).
//               Para o LOD, o que é "desejado" e quando algo pode ser
//               descartado vêm de fora (desiredFn / canDisposeFn): um cubo só
//               some quando o que o substitui já está pronto (sem buracos).
//
//  Coordenadas: chunks são indexados em coordenadas GLOBAIS. Na cena, cada
//  chunk é um Group posicionado em (canto − origem), ver World.rebase().
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { NO_COLLIDE } from './noCollide.js';

export class WorkerPool {
  constructor(count) {
    this.idle = [];
    this.workers = [];
    this.queue = [];
    this.inflight = new Map();
    this.nextId = 1;
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./chunkWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._done(w, e.data);
      w.onerror = (e) => console.error('chunkWorker:', e.message);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  submit(payload, owner, cb) {
    const job = { id: this.nextId++, payload, owner, cb, priority: 0 };
    this.queue.push(job);
    return job;
  }

  cancel(job) {
    const i = this.queue.indexOf(job);
    if (i >= 0) this.queue.splice(i, 1);
    else job.cancelled = true;
  }

  pump() {
    if (!this.queue.length || !this.idle.length) return;
    for (const j of this.queue) j.priority = j.owner.priorityOf(j);
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.queue.length && this.idle.length) {
      const job = this.queue.shift();
      const w = this.idle.pop();
      this.inflight.set(job.id, job);
      w.postMessage({ jobId: job.id, ...job.payload });
    }
  }

  _done(w, data) {
    this.idle.push(w);
    const job = this.inflight.get(data.jobId);
    this.inflight.delete(data.jobId);
    if (data.error) console.error('geração falhou:', data.error);
    if (job && !job.cancelled) job.cb(data);
  }

  get busy() {
    return this.queue.length + this.inflight.size;
  }

  dispose() {
    this.workers.forEach((w) => w.terminate());
  }
}

export class ChunkLayer {
  /**
   * @param {object} o
   * @param {WorkerPool} o.pool
   * @param {Record<string, THREE.Material>} o.materials  nome → material
   * @param {'chunk'|'macro'} o.layer
   * @param {number} o.size         aresta do cubo (m)
   * @param {number} o.loadRadius   raio de carregamento (m)
   * @param {number} o.seed
   * @param {object[]} o.reserved
   * @param {number} o.uploadsPerFrame
   * @param {number} [o.bias]       prioridade extra (negativo = antes)
   * @param {import('./batches.js').BatchSet} o.batches  lotes de desenho (um por material)
   * @param {boolean} [o.collide]    guardar malhas por chunk para a colisão
   * @param {number} [o.level]        0 = perto; 1, 2 = LOD
   * @param {(layer: ChunkLayer, cx: number, cy: number, cz: number) => boolean} [o.desiredFn]
   * @param {(layer: ChunkLayer, e: any) => boolean} [o.canDisposeFn]
   * @param {number} [o.scanRadius]
   */
  constructor(o) {
    this.pool = o.pool;
    this.materials = o.materials;
    this.layer = o.layer;
    this.size = o.size;
    this.loadRadius = o.loadRadius;
    this.seed = o.seed;
    this.reserved = o.reserved;
    this.uploadsPerFrame = o.uploadsPerFrame;
    this.bias = o.bias ?? 0;
    this.batches = o.batches;
    this.collide = !!o.collide;
    this.level = o.level;
    this.desiredFn = o.desiredFn;
    this.canDisposeFn = o.canDisposeFn;
    this.scanRadius = o.scanRadius;
    this.chunks = new Map();
    this.uploads = [];
    this.center = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.origin = new THREE.Vector3();
    this._lastCell = '';
    this._scanTimer = 0;
    this.halfDiag = size3Diag(this.size);
    this.level ??= 0;
    this.desiredFn ??= null; // (layer, cx, cy, cz) => boolean
    this.canDisposeFn ??= null; // (layer, entry) => boolean
    this.scanRadius ??= null; // raio de varredura (m); padrão: loadRadius + meia diagonal
  }

  /** Entrada pronta para exibição (geometria na GPU, ou sabidamente vazia). */
  isReady(cx, cy, cz) {
    const e = this.chunks.get(`${cx},${cy},${cz}`);
    return !!e && e.received && (e.empty || !!e.group);
  }

  distanceTo(cx, cy, cz) {
    const s = this.size;
    return Math.hypot((cx + 0.5) * s - this.center.x, (cy + 0.5) * s - this.center.y, (cz + 0.5) * s - this.center.z);
  }

  priorityOf(job) {
    const e = job.entry;
    const c = this._chunkCenter(e, _tmp);
    const d = c.sub(this.center);
    const dist = d.length();
    // à frente primeiro, depois ao redor
    const facing = dist > 0 ? d.dot(this.forward) / dist : 1;
    return dist - facing * Math.min(this.size, 400) * 0.9 + (this.bias || 0);
  }

  _chunkCenter(e, out) {
    return out.set((e.cx + 0.5) * this.size, (e.cy + 0.5) * this.size, (e.cz + 0.5) * this.size);
  }

  /**
   * @param {THREE.Vector3} globalPos  posição global do observador
   * @param {THREE.Vector3} forward    direção do olhar
   */
  update(dt, globalPos, forward, origin) {
    this.center.copy(globalPos);
    this.forward.copy(forward);
    this.origin.copy(origin);

    const s = this.size;
    const cx = Math.floor(globalPos.x / s);
    const cy = Math.floor(globalPos.y / s);
    const cz = Math.floor(globalPos.z / s);
    const cellKey = `${cx},${cy},${cz}`;
    this._scanTimer -= dt;
    if (cellKey !== this._lastCell || this._scanTimer <= 0) {
      this._lastCell = cellKey;
      this._scanTimer = 0.5;
      this._scan(cx, cy, cz);
    }
  }

  _scan(cx, cy, cz) {
    const s = this.size;
    const reach = this.scanRadius ?? this.loadRadius + this.halfDiag;
    const R = Math.ceil(reach / s);
    const p = this.center;
    const wants = (x, y, z, d) => (this.desiredFn ? this.desiredFn(this, x, y, z) : d <= reach);
    // carrega o que falta
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dz = -R; dz <= R; dz++) {
          const x = cx + dx;
          const y = cy + dy;
          const z = cz + dz;
          const d = Math.hypot((x + 0.5) * s - p.x, (y + 0.5) * s - p.y, (z + 0.5) * s - p.z);
          if (d > reach + this.halfDiag || !wants(x, y, z, d)) continue;
          const key = `${x},${y},${z}`;
          if (this.chunks.has(key)) continue;
          const entry = { key, cx: x, cy: y, cz: z, group: null, lights: [], job: null };
          this.chunks.set(key, entry);
          entry.job = this.pool.submit(
            { layer: this.layer, level: this.level, seed: this.seed, cx: x, cy: y, cz: z, reserved: this.reserved, collide: this.collide },
            this,
            (data) => this._received(entry, data),
          );
          entry.job.entry = entry;
        }
      }
    }
    // descarta o que não é mais desejado — mas só quando o substituto já está
    // pronto (LOD) ou, sem LOD, com uma histerese de distância
    const unload = reach + s * 0.75;
    for (const [key, e] of this.chunks) {
      const d = this._chunkCenter(e, _tmp).distanceTo(p);
      let drop;
      if (this.desiredFn) {
        drop = !this.desiredFn(this, e.cx, e.cy, e.cz) && (!e.group || this.canDisposeFn(this, e));
        if (!drop && e.job && !this.desiredFn(this, e.cx, e.cy, e.cz)) drop = true; // ainda nem gerado
      } else {
        drop = d > unload;
      }
      if (drop) {
        this._dispose(e);
        this.chunks.delete(key);
      }
    }
  }

  _received(entry, data) {
    if (this.chunks.get(entry.key) !== entry) return; // já descartado
    entry.job = null;
    entry.lights = data.lights;
    entry.emitters = data.emitters ?? [];
    entry.received = true;
    entry.empty = data.meshes.length === 0;
    if (!entry.empty) this.uploads.push({ entry, data });
  }

  /** Cria as malhas na GPU, respeitando o orçamento do frame. */
  flushUploads() {
    let n = this.uploadsPerFrame;
    // os mais próximos sobem antes
    if (this.uploads.length > 1) {
      this.uploads.sort((a, b) => this._chunkCenter(a.entry, _tmp).distanceToSquared(this.center) - this._chunkCenter(b.entry, _tmp2).distanceToSquared(this.center));
    }
    // teto de tempo além do de quantidade: um chunk pesado sozinho já leva vários ms —
    // passou de UPLOAD_MS, o resto fica para o próximo quadro (sempre sobe ao menos um)
    const t0 = performance.now();
    while (n-- > 0 && this.uploads.length && (n === this.uploadsPerFrame - 1 || performance.now() - t0 < UPLOAD_MS)) {
      const { entry, data } = this.uploads.shift();
      if (this.chunks.get(entry.key) !== entry) continue;
      // `group` não entra na cena: o desenho sai dos lotes. Ele guarda a posição
      // do chunk e, nas camadas com colisão, as malhas usadas pelos raios.
      const group = new THREE.Group();
      entry.group = group;
      entry.handles = [];
      this._position(entry);
      for (const m of data.meshes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 4, true)); // int8 normalizado (ver packNormals)
        g.setIndex(new THREE.BufferAttribute(m.index, 1));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(m.sphere[0], m.sphere[1], m.sphere[2]), m.sphere[3]);
        const material = this.materials[m.mat] ?? this.materials.tower;
        entry.handles.push(this.batches.add(material, g, group.matrixWorld, RENDER_ORDER[m.mat] ?? 0));
        // cabos, feixes de luz, panos e pichações não colidem
        if (!this.collide || NO_COLLIDE.has(m.mat)) continue;
        // a árvore de colisão já vem montada do worker (montar aqui travava o quadro ~40 ms)
        if (m.bvh) g.boundsTree = MeshBVH.deserialize({ roots: m.bvh, index: g.index.array }, g, { setIndex: false });
        const mesh = new THREE.Mesh(g, material);
        mesh.userData.mat = m.mat;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      group.updateMatrixWorld(true);
    }
  }

  _position(e) {
    e.group.position.set(e.cx * this.size - this.origin.x, e.cy * this.size - this.origin.y, e.cz * this.size - this.origin.z);
    e.group.updateMatrixWorld(true);
  }

  _place(e) {
    if (!e.group) return;
    this._position(e);
    for (const h of e.handles) this.batches.setMatrix(h, e.group.matrixWorld);
  }

  /** A origem flutuante mudou: reposiciona todos os grupos. */
  rebase(origin) {
    this.origin.copy(origin);
    for (const e of this.chunks.values()) this._place(e);
  }

  /**
   * O chunk que contém este ponto global já tem geometria (ou sabidamente
   * nenhuma)? A física só confia no chão quando tudo por perto está pronto.
   */
  isReadyAround(g, radius) {
    const s = this.size;
    for (let x = Math.floor((g.x - radius) / s); x <= Math.floor((g.x + radius) / s); x++) {
      for (let y = Math.floor((g.y - radius) / s); y <= Math.floor((g.y + radius) / s); y++) {
        for (let z = Math.floor((g.z - radius) / s); z <= Math.floor((g.z + radius) / s); z++) {
          const e = this.chunks.get(`${x},${y},${z}`);
          if (!e || !e.received || (!e.empty && !e.group)) return false;
        }
      }
    }
    return true;
  }

  *allEmitters() {
    for (const e of this.chunks.values()) if (e.group || e.empty) yield* e.emitters ?? [];
  }

  *allLights() {
    for (const e of this.chunks.values()) if (e.group) yield* e.lights;
  }

  get loadedCount() {
    let n = 0;
    for (const e of this.chunks.values()) if (e.group) n++;
    return n;
  }

  _dispose(e) {
    if (e.job) this.pool.cancel(e.job);
    if (e.group) {
      for (const h of e.handles) this.batches.remove(h);
      e.handles = null;
      e.group = null; // as geometrias por chunk nunca subiram para a GPU: o GC cuida
    }
  }

  dispose() {
    for (const e of this.chunks.values()) this._dispose(e);
    this.chunks.clear();
    this.uploads = [];
  }
}

const UPLOAD_MS = 4; // ms por quadro subindo geometria (por camada)
// transparentes: a água antes dos feixes de luz
const RENDER_ORDER = { cascade: 4, beam: 5 };
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
function size3Diag(s) {
  return (Math.sqrt(3) * s) / 2;
}
