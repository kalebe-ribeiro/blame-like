// ─────────────────────────────────────────────────────────────────────────────
//  Seeds compartilháveis (fase 4.4 — ver o cofre, Seeds-compartilhaveis).
//
//  Um código de texto leva o MUNDO CRU — a seed e o modo — e as suas MARCAS
//  (app/marks.js). O mundo é 100% determinístico pela seed: quem abre o código
//  atravessa a mesma Cidade, começa no mesmo lugar, e acha as suas setas
//  pintadas (em cor de ferrugem). O estado (setores religados, pistas, léxico)
//  não vai junto: cada um faz a própria travessia.
//
//  Formato: "CYC1." + base64url(JSON { s: seed (base 36), m: modo, k: marcas })
//  marcas: [x, y, z, nx, ny, nz, dx, dy, dz] arredondadas.
//
//  A área de transferência passa pelo Electron (preload.js → main.js); fora dele,
//  a API do navegador.
// ─────────────────────────────────────────────────────────────────────────────
import { MODE_IDS } from './saves.js';

const PREFIX = 'CYC1.';

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** O código de um mundo salvo (slot). */
export function encodeWorld(slot) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const k = (slot.marks ?? []).map((m) => [r1(m.x), r1(m.y), r1(m.z), r2(m.nx), r2(m.ny), r2(m.nz), r2(m.dx), r2(m.dy), r2(m.dz)]);
  return PREFIX + b64url(JSON.stringify({ s: (slot.seed >>> 0).toString(36), m: slot.mode, ...(k.length ? { k } : {}) }));
}

/** Lê um código: { seed, mode, marks } — ou null, se não for um código válido. */
export function decodeWorld(code) {
  try {
    const txt = String(code ?? '').trim();
    if (!txt.startsWith(PREFIX)) return null;
    const o = JSON.parse(unb64url(txt.slice(PREFIX.length)));
    const seed = parseInt(o.s, 36);
    if (!Number.isFinite(seed) || !MODE_IDS.includes(o.m)) return null;
    const now = Date.now();
    const marks = (Array.isArray(o.k) ? o.k : []).slice(0, 400).map((a, i) => ({
      x: a[0], y: a[1], z: a[2], nx: a[3], ny: a[4], nz: a[5], dx: a[6], dy: a[7], dz: a[8],
      at: now + i, // ids estáveis e distintos
      shared: true, // de outra pessoa: outra tinta
    }));
    return { seed: seed >>> 0, mode: o.m, marks };
  } catch {
    return null;
  }
}

/** Copia texto para a área de transferência. */
export async function copyText(text) {
  if (window.cybercosmic?.clipboardWrite) return window.cybercosmic.clipboardWrite(text);
  return navigator.clipboard?.writeText(text);
}

/** Lê a área de transferência (texto). */
export async function pasteText() {
  if (window.cybercosmic?.clipboardRead) return window.cybercosmic.clipboardRead();
  return navigator.clipboard?.readText?.() ?? '';
}
