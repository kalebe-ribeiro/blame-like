// ─────────────────────────────────────────────────────────────────────────────
//  A memória das peças cortadas no disco (a arma de Killy — o cofre, Arma-do-Killy §8):
//  o worker de corte guarda, por chunk, o resultado de cada peça e os cortes que ele já tem
//  (gen/chunkgen.js pieceMemo). Na memória do worker ela se perde ao fechar o jogo — e um
//  tiro num chunk com dezenas de cortes, numa sessão nova, refazia todos (até ~6,5 s de
//  worker). Aqui ela vai para o IndexedDB (que existe nos workers): o primeiro tiro de uma
//  sessão também só subtrai o cilindro novo.
//  Sem IndexedDB (ou com erro), tudo segue funcionando — só sem a memória entre sessões.
// ─────────────────────────────────────────────────────────────────────────────
const DB = 'cybercosmic-pecas';
const STORE = 'memo';

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

/** O que foi guardado para esta chave (ou null). */
export async function memoGet(key) {
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

/** Guarda (sem esperar). */
export async function memoPut(key, data) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(data, key);
  } catch {
    // (cheio, ou sem permissão: segue só com a memória do worker)
  }
}
