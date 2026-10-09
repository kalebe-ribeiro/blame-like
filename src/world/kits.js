// ─────────────────────────────────────────────────────────────────────────────
//  Os povos humanos (o rework gráfico — o cofre, Rework-grafico e Referencias-Blame): cada vila é de um
//  povo, pela identidade dela. Os corpos (em malha contínua) estão em world/fleshKits.js.
// ─────────────────────────────────────────────────────────────────────────────
import { hash4 } from '../gen/hash.js';

/** Um gerador pela identidade (o mesmo id, a mesma sequência). */
function rngOf(id, salt) {
  let n = 0;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
  let k = 0;
  return () => hash4(n, salt, k++, 7, 911);
}

export const TRIBES = ['armadura', 'seco', 'trabalhador', 'abrigado'];

/** O grupo de uma vila pela identidade dela (o mesmo mundo, a mesma vila, o mesmo povo). */
export function tribeOf(villageId) {
  const r = rngOf(villageId, 3);
  return TRIBES[Math.floor(r() * TRIBES.length) % TRIBES.length];
}
