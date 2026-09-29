// ─────────────────────────────────────────────────────────────────────────────
//  Alfabeto alienígena procedural.
//  Cada glifo = traços entre nós de uma grade 3×4, gerados a partir de uma seed.
//  Os primeiros 7 glifos funcionam como "dígitos" (base 7) na leitura de coordenadas.
// ─────────────────────────────────────────────────────────────────────────────
import { RNG } from '../core/rng.js';

const GW = 3;
const GH = 4;

export function createAlphabet(seed, count = 64) {
  const rng = new RNG(seed);
  const glyphs = [];
  for (let i = 0; i < count; i++) {
    const strokes = [];
    let cur = rng.int(0, GW * GH - 1);
    const n = rng.int(2, 5);
    for (let s = 0; s < n; s++) {
      const cx = cur % GW;
      const cy = Math.floor(cur / GW);
      let nx, ny;
      do {
        nx = cx + rng.int(-1, 1);
        ny = cy + rng.int(-1, 1);
      } while (nx < 0 || ny < 0 || nx >= GW || ny >= GH || (nx === cx && ny === cy));
      const next = ny * GW + nx;
      strokes.push([cur, next]);
      cur = rng.chance(0.3) ? rng.int(0, GW * GH - 1) : next;
    }
    glyphs.push({
      strokes,
      dot: rng.chance(0.3) ? rng.int(0, GW * GH - 1) : -1,
      ring: rng.chance(0.1),
      bar: rng.chance(0.2),
    });
  }
  return glyphs;
}

/** Desenha um glifo na caixa (x, y, w, h) usando o estilo atual do contexto. */
export function drawGlyph(ctx, glyph, x, y, w, h) {
  const node = (k) => [x + ((k % GW) / (GW - 1)) * w, y + (Math.floor(k / GW) / (GH - 1)) * h];
  ctx.beginPath();
  for (const [a, b] of glyph.strokes) {
    const [ax, ay] = node(a);
    const [bx, by] = node(b);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  if (glyph.bar) {
    ctx.moveTo(x - w * 0.1, y - h * 0.12);
    ctx.lineTo(x + w * 1.1, y - h * 0.12);
  }
  ctx.stroke();
  if (glyph.dot >= 0) {
    const [dx, dy] = node(glyph.dot);
    ctx.fillRect(dx - 1.2, dy - 1.2, 2.4, 2.4);
  }
  if (glyph.ring) {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
}
