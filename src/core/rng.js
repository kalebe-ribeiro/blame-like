// ─────────────────────────────────────────────────────────────────────────────
//  RNG determinístico (mulberry32). Toda a geração procedural passa por aqui,
//  então a mesma seed sempre produz o mesmo mundo.
// ─────────────────────────────────────────────────────────────────────────────

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /** float uniforme em [a, b) */
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }

  /** inteiro uniforme em [a, b] */
  int(a, b) {
    return Math.floor(this.float(a, b + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** sub-gerador independente — útil para isolar sistemas (mudar um não desloca os outros) */
  fork() {
    return new RNG(Math.floor(this.next() * 4294967296));
  }
}
