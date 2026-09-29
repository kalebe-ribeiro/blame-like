// ─────────────────────────────────────────────────────────────────────────────
//  A língua antiga (ver o cofre, Traducao-como-progresso e 14-Universo-Blame).
//
//  A língua de quem construiu a Cidade e se perdeu na própria obra. Não é
//  alienígena: é humana, técnica, escrita em ESTÊNCIL (letras de traços retos,
//  com as "pontes" que o molde deixa) — feita para placas, máquinas e telas.
//
//  • As palavras são CONCEITOS (CONCEPTS): cada um tem uma palavra antiga
//    (gerada de uma semente fixa — a língua é a mesma em todos os mundos,
//    porque a tradução é global) e a tradução no idioma do jogo (i18n).
//  • Números são legíveis desde o início; as palavras não.
//  • Um texto é uma lista de TOKENS: { w: 'SECTOR' } (palavra), { n: '417' }
//    (número), { c: 'Ⴝ-17' }… (código: letra antiga + números), { p: '·' }
//    (pontuação). drawTokens() desenha misturando palavras conhecidas (no
//    idioma do jogo) e desconhecidas (na escrita antiga).
// ─────────────────────────────────────────────────────────────────────────────
import { RNG } from '../core/rng.js';

const LANG_SEED = 0x51a7e; // a língua é uma só, para sempre

/**
 * Conceitos e o quanto são comuns (quantas vezes precisam ser vistos para
 * serem entendidos). 1 = comum (2 vezes), 2 = incomum (4), 3 = raro (7).
 * A tradução de cada um fica em i18n: 'word.<CONCEITO>'.
 */
export const CONCEPTS = {
  // administração e manutenção (comuns)
  SECTOR: 1, LEVEL: 1, POWER: 1, MAINTENANCE: 1, TERMINAL: 1, STATUS: 1, NONE: 1, NO: 1,
  DAYS: 1, CYCLES: 1, REQUEST: 1, REPLY: 1, ROUTE: 1, LINE: 1, STATION: 1, NEXT: 1,
  DIRECTION: 1, GRID: 1, DARK: 1, UNSTABLE: 1, NOTICE: 1, RECORD: 1, WORK: 1, IN: 1,
  // lugares e coisas (incomuns)
  SUBSTATION: 2, PASSAGE: 2, LAYER: 2, ELEVATOR: 2, CAR: 2, SHAFT: 2, GALLERY: 2, CONDUIT: 2,
  MACHINE: 2, HALL: 2, DEPOT: 2, SILO: 2, STAIRWAY: 2, TRUSS: 2, STRATUM: 2, TRENCH: 2,
  BUILDERS: 2, CONSTRUCTION: 2, SITE: 2, DEADLINE: 2, INHABITANTS: 2, REGISTERED: 2, ACCESS: 2, AUTHORIZED: 2,
  ARCHIVE: 2, PLANT: 2, ACTIVE: 2, RESERVE: 2, OUTPUT: 2, OWN: 2,
  DAMAGED: 2, RECOVERY: 2, WARNING: 2, IMPASSABLE: 2, DISTANCE: 2, ALTERNATE: 2, OBJECT: 2, UNCATALOGUED: 2,
  FLOOR: 2, COUNT: 2, INCOMPLETE: 2, POSTPONED: 2, SUSPENDED: 2, SCHEDULED: 2, SIGNAL: 2, DEPARTURE: 2,
  BOARDING: 2, DELAYED: 2, RESTORE: 2, FAILURE: 2, VALVE: 2, REPLACEMENT: 2, CABLE: 2, LOAD: 2,
  // a rede e seus nomes (incomuns)
  NETSPHERE: 2, AUTHORITY: 2, SAFEGUARD: 2, GENE: 2, NET: 2, DETECTED: 2, ILLEGAL: 2, RESIDENT: 2,
  // a história de quem se perdeu (raros)
  WE: 3, BUILT: 3, CITY: 3, WITHOUT: 3, END: 3, LOST: 3, KEY: 3, CANNOT: 3,
  STOP: 3, THEY: 3, FORGOT: 3, NAME: 3, BEFORE: 3, AFTER: 3, HUMAN: 3, CHILDREN: 3,
  MORE: 3, ALWAYS: 3, GROW: 3, WANTED: 3, EVERYTHING: 3, NOBODY: 3, REMAINS: 3, HERE: 3,
};

/** Quantas vezes um conceito precisa ser visto para ser entendido. */
export const NEED = { 1: 2, 2: 4, 3: 7 };

// ── a escrita: letras de estêncil ───────────────────────────────────────────
//  Cada letra é feita de 2–4 traços numa grade 3×5 (retos e diagonais, como
//  letras de molde). As pontes do estêncil são falhas curtas no meio dos
//  traços longos.

const SEGMENTS = [
  [[0, 0], [0, 4]], [[2, 0], [2, 4]], [[1, 0], [1, 4]], // verticais
  [[0, 0], [2, 0]], [[0, 2], [2, 2]], [[0, 4], [2, 4]], // horizontais
  [[0, 0], [2, 4]], [[2, 0], [0, 4]], // diagonais longas
  [[0, 0], [0, 2]], [[2, 2], [2, 4]], [[0, 2], [0, 4]], [[2, 0], [2, 2]], // meias verticais
  [[0, 2], [2, 0]], [[0, 2], [2, 4]], [[1, 0], [1, 2]], [[1, 2], [1, 4]], // meias diagonais e hastes
];

function makeScript() {
  const rng = new RNG(LANG_SEED);
  const letters = [];
  const seen = new Set();
  while (letters.length < 22) {
    const n = rng.int(2, 4);
    const set = new Set();
    while (set.size < n) set.add(rng.int(0, SEGMENTS.length - 1));
    const key = [...set].sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    // precisa de pelo menos um traço vertical: letra "de pé", nunca um borrão
    if (![...set].some((i) => i <= 2 || (i >= 8 && i <= 11))) continue;
    seen.add(key);
    letters.push([...set].map((i) => SEGMENTS[i]));
  }
  return letters;
}
export const SCRIPT = makeScript();

/** A palavra antiga de um conceito: índices de letras (2–7), fixa para sempre. */
const wordCache = new Map();
export function ancientWord(concept) {
  let w = wordCache.get(concept);
  if (w) return w;
  let h = LANG_SEED;
  for (const ch of concept) h = Math.imul(h ^ ch.charCodeAt(0), 0x9e3779b1) >>> 0;
  const rng = new RNG(h);
  const len = Math.max(2, Math.min(7, Math.round(concept.length * 0.6 + rng.float(-1, 1.5))));
  w = [];
  for (let i = 0; i < len; i++) w.push(rng.int(0, SCRIPT.length - 1));
  wordCache.set(concept, w);
  return w;
}

/** Desenha uma letra de estêncil em (x, y), altura h. */
export function drawLetter(g, letter, x, y, h) {
  const u = h / 4;
  const wd = u * 1.1;
  g.lineWidth = Math.max(1, h * 0.14);
  g.lineCap = 'butt';
  for (const [[ax, ay], [bx, by]] of letter) {
    const x0 = x + ax * wd * 0.5 * 1.2;
    const y0 = y + ay * u;
    const x1 = x + bx * wd * 0.5 * 1.2;
    const y1 = y + by * u;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > h * 0.7) {
      // ponte do estêncil: o traço longo tem uma falha no meio
      const gap = h * 0.09 / len;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + (x1 - x0) * (0.5 - gap), y0 + (y1 - y0) * (0.5 - gap));
      g.moveTo(x0 + (x1 - x0) * (0.5 + gap), y0 + (y1 - y0) * (0.5 + gap));
      g.lineTo(x1, y1);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
}

/** Largura de uma palavra antiga na altura h. */
export const ancientWidth = (letters, h) => letters * h * 0.78;

/**
 * Desenha tokens numa linha. `known(concept)` diz se já foi entendido;
 * `word(concept)` dá a tradução (i18n). Devolve a largura usada.
 * opts: { h (altura das letras), font (fonte do texto legível), color, dim }
 */
export function drawTokens(g, tokens, x, y, known, word, { h = 9, font = '11px Consolas, monospace', color = '#9fae9f', maxW = Infinity } = {}) {
  g.font = font;
  g.textBaseline = 'top';
  g.fillStyle = color;
  g.strokeStyle = color;
  const space = h * 0.6;
  let cx = x;
  for (const tk of tokens) {
    if (cx - x > maxW) break;
    if (tk.w) {
      if (known(tk.w)) {
        const s = word(tk.w);
        g.fillText(s, cx, y);
        cx += g.measureText(s).width + space;
      } else {
        const letters = ancientWord(tk.w);
        for (let i = 0; i < letters.length; i++) drawLetter(g, SCRIPT[letters[i]], cx + i * h * 0.78, y + 1, h);
        cx += ancientWidth(letters.length, h) + space;
      }
    } else if (tk.c) {
      // código: a letra antiga (sempre na escrita antiga) + números legíveis
      drawLetter(g, SCRIPT[tk.c[0] % SCRIPT.length], cx, y + 1, h);
      cx += h * 0.85;
      g.fillText(`-${tk.c[1]}`, cx, y);
      cx += g.measureText(`-${tk.c[1]}`).width + space;
    } else {
      const s = tk.n ?? tk.p ?? '';
      g.fillText(s, cx, y);
      cx += g.measureText(s).width + space;
    }
  }
  return cx - x;
}

/** Os conceitos de uma lista de linhas de tokens (sem repetir). */
export function conceptsIn(lines) {
  const out = new Set();
  for (const line of lines) for (const tk of line) if (tk.w) out.add(tk.w);
  return [...out];
}
