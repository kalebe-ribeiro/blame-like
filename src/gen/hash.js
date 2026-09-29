// ─────────────────────────────────────────────────────────────────────────────
//  Hash inteiro de coordenadas → [0, 1).
//  É a base do mundo infinito: qualquer coisa em qualquer lugar é uma função
//  pura de (seed, coordenadas, "sal"). Não existe estado global — dois chunks
//  vizinhos gerados em workers diferentes concordam sobre o que há na borda.
// ─────────────────────────────────────────────────────────────────────────────
import { RNG } from '../core/rng.js';

export function hash4(seed, a, b, c, salt = 0) {
  let h = (seed | 0) ^ Math.imul(a | 0, 0x27d4eb2d);
  h ^= Math.imul(b | 0, 0x165667b1);
  h ^= Math.imul(c | 0, 0x1b873593);
  h ^= Math.imul(salt | 0, 0x5bd1e995);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** RNG determinístico "ancorado" num ponto do espaço. */
export function rngAt(seed, a, b, c, salt = 0) {
  return new RNG(Math.floor(hash4(seed, a, b, c, salt) * 4294967296));
}
