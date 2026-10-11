// ─────────────────────────────────────────────────────────────────────────────
//  O cache dos chunks cortados pelo emissor de feixe (a arma de Killy — o cofre,
//  Arma-do-Killy §4.3): a saída do worker de um chunk com cortes (malhas, árvore
//  de colisão, luzes, detritos, limites) fica no IndexedDB. Voltar a um lugar
//  atingido só LÊ o resultado — o corte (CSG) não se repete a cada carregamento.
//
//  A chave junta a semente, a camada, o nível, o chunk e os cortes que o tocam
//  (os ids, em ordem): um tiro novo muda a chave só dos chunks que ele cruza.
//  Sem IndexedDB (ou com erro), tudo segue funcionando — só não há cache.
// ─────────────────────────────────────────────────────────────────────────────
const DB = 'cybercosmic-cortes';
const STORE = 'chunks';

/** @type {Promise<IDBDatabase|null>|null} */
let dbp = null;
function db() {
  dbp ??= new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}

/** A versão da geração nas chaves: subir quando a geração dos chunks mudar (as entradas velhas deixam de
 *  ser usadas — g2: os cabos grossos passaram a 'hose', que colide; g3: os cones virados dos pilares fecham com eles; g4: as bordas no comprimento da normal — o desgaste; g5: cabos de 0,1 m+ colidem). */
export const GEN_VERSION = 'g7';

/** A chave de um chunk com estes cortes. */
export function cutKey(seed, layer, level, cx, cy, cz, cuts) {
  return `${GEN_VERSION}|${seed}|${layer}|${level}|${cx},${cy},${cz}|${cuts.map((c) => c.id).sort().join(',')}`;
}

/**
 * A chave das caixas das peças cortáveis de um chunk (não dependem dos cortes: são
 * registradas antes de cortar). Com elas, os cortes que contam para um chunk — e a chave
 * do resultado — são os mesmos ao carregar de novo e depois de um tiro.
 */
export function boxKey(seed, layer, level, cx, cy, cz) {
  return `caixas|${GEN_VERSION}|${seed}|${layer}|${level}|${cx},${cy},${cz}`;
}

/** O resultado guardado (ou null). */
export async function cacheGet(key) {
  const d = await db();
  if (!d) return null;
  return new Promise((res) => {
    try {
      const q = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result ?? null);
      q.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

/** Guarda (copia — os arrays seguem para a GPU). Sem esperar. */
export async function cachePut(key, data) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(data, key);
  } catch {
    // (cheio, ou sem permissão: segue sem cache)
  }
}
