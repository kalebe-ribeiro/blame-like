// ─────────────────────────────────────────────────────────────────────────────
//  Lotes de desenho: os chunks que usam o mesmo material são desenhados juntos,
//  em poucos THREE.BatchedMesh (multi-draw), em vez de uma chamada por chunk.
//
//  Por quê: com ~700 chamadas por quadro, a CPU/ANGLE gastava vários ms só
//  emitindo desenhos. Com os lotes são ~80, e o recorte por frustum continua
//  por chunk (perObjectFrustumCulled) — com ordenação de frente para trás.
//
//  Alocação SEM cópias (nada de travadas quando o mundo carrega):
//    • cada material tem "páginas" (BatchedMesh) de capacidade fixa, que
//      crescem de tamanho a cada nova página (64k → 1M vértices) — quando uma
//      enche, abre-se outra; nenhuma é realocada;
//    • cada chunk ocupa uma VAGA com tamanho arredondado para cima (classes
//      de ~25%); quando o chunk é descartado, a vaga fica oculta e livre, e o
//      próximo chunk de porte parecido a reaproveita (setGeometryAt).
//
//  Travadas: criar uma página nova manda o buffer inteiro para a GPU, e o
//  Chrome faz isso em pedaços que esperam a fila de desenho esvaziar (até
//  ~250 ms por página grande). Por isso as páginas são pequenas (≤ 2¹⁷
//  vértices) e a próxima é criada ANTES de ser necessária, num quadro sem
//  outros envios (BatchSet.tick) — quando a página enche, a seguinte já está
//  na GPU e só recebe atualizações parciais (baratas).
//
//  Fragmentação: vagas livres só servem a chunks de porte parecido, então com
//  o tempo sobram buracos e as páginas se multiplicam (mais memória e mais
//  trabalho por quadro). Num quadro calmo, a página mais esburacada é
//  compactada (BatchedMesh.optimize: as vagas vivas deslizam para o começo,
//  com envios parciais) e páginas que ficam vazias além da folga são jogadas fora.
//
//  Os shaders precisam de <batching_pars_vertex>/<batching_vertex> — ver
//  shaders/materials.js.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const PAGE_MIN = 1 << 16; // vértices da primeira página de cada material
const PAGE_MAX = 1 << 17; // teto das páginas seguintes (~3 MB: um envio só para a GPU)
const SPARE_AT = 0.3; // abaixo desta folga (fração de uma página), prepara a próxima
const INDEX_PER_VERTEX = 2.5; // capacidade de índices por vértice numa página
const START_INSTANCES = 64;
const COMPACT_AT = 0.2; // fração da página em vagas livres para valer compactar

/** Arredonda para cima numa escala de passos de ~25% (classes de vaga). */
function sizeClass(n) {
  let s = 64;
  while (s < n) s = Math.ceil(s * 1.25);
  return s;
}

class MaterialBatch {
  constructor(set, material, renderOrder) {
    this.set = set;
    this.material = material;
    this.renderOrder = renderOrder;
    this.pages = [];
    this.free = []; // vagas livres: { page, geo, inst, rv, ri }
  }

  _newPage(minV, minI) {
    const size = Math.max(minV, Math.min(PAGE_MAX, PAGE_MIN << this.pages.length));
    const page = new THREE.BatchedMesh(START_INSTANCES, size, Math.max(minI, Math.ceil(size * INDEX_PER_VERTEX)), this.material);
    page.frustumCulled = false; // a página cobre o mundo todo; o recorte é por chunk
    page.perObjectFrustumCulled = true;
    page.sortObjects = !this.material.transparent; // opacos de frente para trás (early-z)
    page.renderOrder = this.renderOrder;
    page.freeV = 0; // vértices reservados em vagas livres nesta página
    this.pages.push(page);
    this.set.parent.add(page);
    return page;
  }

  /** Vértices ainda livres no fim das páginas. */
  _tailFree() {
    let free = 0;
    for (const p of this.pages) free += p.unusedVertexCount;
    return free;
  }

  /** A página mais esburacada (se valer a pena compactar), ou null. */
  worstPage() {
    let worst = null;
    for (const p of this.pages) {
      if (p.freeV > p._maxVertexCount * COMPACT_AT && (!worst || p.freeV > worst.freeV)) worst = p;
    }
    return worst;
  }

  /** Apaga as vagas livres da página e junta as vivas no começo dela. */
  compact(page) {
    const keep = [];
    for (const s of this.free) {
      if (s.page === page) page.deleteGeometry(s.geo);
      else keep.push(s);
    }
    this.free = keep;
    page.freeV = 0;
    const live = page._geometryInfo.some((g) => g.active);
    if (!live && this._tailFree() - page.unusedVertexCount >= PAGE_MAX * SPARE_AT) {
      // vazia e sobra folga nas outras: descarta a página
      this.pages.splice(this.pages.indexOf(page), 1);
      page.removeFromParent();
      page.dispose();
      return;
    }
    if (live) {
      page.optimize();
      // no r170 o optimize() marca os trechos movidos mas não pede o envio
      const geo = page.geometry;
      for (const key in geo.attributes) if (geo.attributes[key].updateRanges.length) geo.attributes[key].needsUpdate = true;
      if (geo.index?.updateRanges.length) geo.index.needsUpdate = true;
    } else {
      // optimize() não zera o fim quando não há nada vivo
      page._nextVertexStart = 0;
      page._nextIndexStart = 0;
    }
  }

  add(geometry, matrix) {
    const v = geometry.attributes.position.count;
    const i = geometry.index.count;

    // 1) uma vaga livre do tamanho certo (a menor que caiba, sem desperdiçar muito)
    let best = -1;
    for (let k = 0; k < this.free.length; k++) {
      const s = this.free[k];
      if (s.rv < v || s.ri < i || s.rv > v * 2 + 256 || s.ri > i * 2 + 512) continue;
      if (best < 0 || s.rv < this.free[best].rv) best = k;
    }
    if (best >= 0) {
      const slot = this.free[best];
      this.free[best] = this.free[this.free.length - 1];
      this.free.pop();
      slot.page.setGeometryAt(slot.geo, geometry);
      slot.page.setMatrixAt(slot.inst, matrix);
      slot.page.setVisibleAt(slot.inst, true);
      slot.page.freeV -= slot.rv;
      slot.v = v;
      return slot;
    }

    // 2) uma vaga nova no fim de alguma página com espaço
    const rv = sizeClass(v);
    const ri = sizeClass(i);
    const fits = (p) => p.unusedVertexCount >= rv && p.unusedIndexCount >= ri;
    let page = this.pages.find(fits);
    if (!page) {
      // antes de abrir uma página nova (mais memória, mais trabalho por quadro),
      // compacta a mais esburacada se os buracos dela bastam (~3 ms)
      let holed = null;
      for (const p of this.pages) if (p.freeV >= rv && (!holed || p.freeV > holed.freeV)) holed = p;
      if (holed) {
        this.compact(holed);
        if (holed.parent && fits(holed)) page = holed;
      }
    }
    page ??= this._newPage(rv, ri);
    if (page._availableInstanceIds.length === 0 && page._instanceInfo.length >= page.maxInstanceCount) {
      page.setInstanceCount(page.maxInstanceCount * 2);
    }
    const geo = page.addGeometry(geometry, rv, ri);
    const inst = page.addInstance(geo);
    page.setMatrixAt(inst, matrix);
    // pouca folga sobrando: pede uma página reserva (criada num quadro calmo)
    if (this._tailFree() < PAGE_MAX * SPARE_AT) this.set.wantSpare.add(this);
    return { page, geo, inst, rv, ri, v };
  }

  /** Cria a página reserva vazia (vai para a GPU no próximo desenho). */
  spare() {
    if (this._tailFree() < PAGE_MAX * SPARE_AT) this._newPage(64, 64);
  }

  remove(slot) {
    slot.page.setVisibleAt(slot.inst, false);
    slot.page.freeV += slot.rv;
    slot.v = 0;
    this.free.push(slot);
  }
}

export class BatchSet {
  /** @param {THREE.Object3D} parent */
  constructor(parent) {
    this.parent = parent;
    this.batches = new Map(); // material → MaterialBatch
    this.wantSpare = new Set();
    this._addedThisFrame = 0;
    this._sinceCompact = 0;
  }

  /**
   * Uma vez por quadro, depois dos envios. Num quadro sem envios faz UMA
   * tarefa de manutenção: criar uma página reserva ou compactar uma página.
   */
  tick() {
    const quiet = this._addedThisFrame === 0;
    this._addedThisFrame = 0;
    if (!quiet) return;
    if (this.wantSpare.size) {
      const mb = this.wantSpare.values().next().value;
      this.wantSpare.delete(mb);
      mb.spare();
      return;
    }
    // de tempos em tempos procura a página mais esburacada de todos os materiais
    if (++this._sinceCompact < 8) return;
    this._sinceCompact = 0;
    let best = null;
    let bestMb = null;
    for (const mb of this.batches.values()) {
      const p = mb.worstPage();
      if (p && (!best || p.freeV / p._maxVertexCount > best.freeV / best._maxVertexCount)) {
        best = p;
        bestMb = mb;
      }
    }
    if (best) {
      const t0 = performance.now();
      bestMb.compact(best);
      this.compactMs = Math.max(this.compactMs ?? 0, performance.now() - t0);
      this.compactions = (this.compactions ?? 0) + 1;
    }
  }

  /**
   * Adiciona uma geometria indexada (position + normal) com a matriz dada.
   * @returns um identificador para setMatrix/remove
   */
  add(material, geometry, matrix, renderOrder = 0) {
    let mb = this.batches.get(material);
    if (!mb) {
      mb = new MaterialBatch(this, material, renderOrder);
      this.batches.set(material, mb);
    }
    const slot = mb.add(geometry, matrix);
    slot.mb = mb;
    this._addedThisFrame++;
    return slot;
  }

  remove(slot) {
    if (slot) slot.mb.remove(slot);
  }

  setMatrix(slot, matrix) {
    slot.page.setMatrixAt(slot.inst, matrix);
  }

  /** Para --stats: vértices em uso / capacidade alocada, número de páginas. */
  get stats() {
    let used = 0;
    let cap = 0;
    let pages = 0;
    let freeSlots = 0;
    for (const mb of this.batches.values()) {
      freeSlots += mb.free.length;
      for (const p of mb.pages) {
        cap += p._maxVertexCount;
        pages++;
        for (const g of p._geometryInfo) if (g.active) used += g.vertexCount;
      }
      for (const s of mb.free) used -= s.page._geometryInfo[s.geo].vertexCount ?? 0;
    }
    return { pages, used, cap, freeSlots, materials: this.batches.size };
  }

  dispose() {
    for (const mb of this.batches.values()) {
      for (const p of mb.pages) {
        p.dispose();
        p.removeFromParent();
      }
    }
    this.batches.clear();
  }
}
