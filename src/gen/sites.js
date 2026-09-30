// ─────────────────────────────────────────────────────────────────────────────
//  Onde há terminais — pela lei do mundo (Field), sem carregar nada.
//
//  Os mesmos lugares (e os mesmos ids estáveis) que world/terminals.js põe na
//  cena; aqui só a conta, para quem precisa saber de terminais longe: as pistas
//  (lang/leads.js), o sensor, o começo de um mundo.
//
//    station  na ponta da plataforma de cada estação de transportador
//    passage  no alto das passagens das camadas, ao lado da ponte de embarque
//    unique   o console ativo de cada estrutura única (energia própria)
//    hatch    na borda de cada escotilha de manutenção das máquinas colossais
//             (energia própria; mostra quando vem a próxima máquina)
//
//  site: { id, x, y (pés), z, yaw, kind, line?, s?, unique? } — GLOBAL
// ─────────────────────────────────────────────────────────────────────────────
import { TRANSIT, MEGA, WALK } from './field.js';
import { hash4 } from './hash.js';

const S = TRANSIT.station;
const stationT = (s) => s * S + S / 2; // o mesmo de gen/transit.js

/** O terminal da estação s da linha L. */
export function stationSite(L, s) {
  const ts = stationT(s);
  const hw = L.w.width / 2;
  const side = L.track.side;
  const len = TRANSIT.carLen + 4;
  const t = ts - len / 2 + 1.4; // na ponta oposta à placa
  const lat = L.u + side * (hw + 0.9);
  // a tela olha ao longo da plataforma (para quem vem da passarela)
  const x = L.axis === 'z' ? lat : t;
  const z = L.axis === 'z' ? t : lat;
  const yaw = L.axis === 'z' ? 0 : Math.PI / 2; // a tela (+z local) olha para +t
  return { id: `st:${L.id}:${s}`, x, y: L.y, z, yaw, kind: 'station', line: L, s };
}

/** Onde ficar de pé para ler um terminal: { x, y, z } (pés, GLOBAL) — 1,4 m à frente da tela. */
export function standBefore(site) {
  return { x: site.x + Math.sin(site.yaw) * 1.4, y: site.y, z: site.z + Math.cos(site.yaw) * 1.4 };
}

/** Terminais a até R metros de (x,y,z) GLOBAL. */
export function terminalSitesNear(F, x, y, z, R) {
  const out = [];
  for (const L of F.transitLinesNear(x, y, z, R)) {
    const tp = L.axis === 'z' ? z : x;
    for (let s = Math.floor((tp - R - S / 2) / S); s <= Math.ceil((tp + R - S / 2) / S); s++) out.push(stationSite(L, s));
  }
  for (const b of F.barriersNear(y)) {
    if (Math.abs(b.top - y) > R) continue;
    const P = MEGA.passage;
    for (let pi = Math.floor((x - R) / P); pi <= Math.floor((x + R) / P); pi++) {
      for (let pk = Math.floor((z - R) / P); pk <= Math.floor((z + R) / P); pk++) {
        const p = F.passage(b.n, pi, pk);
        if (!p) continue;
        out.push({ id: `ps:${b.n}:${pi}:${pk}`, x: p.x + p.size / 2 + 5, y: b.top, z: p.z + 7, yaw: Math.PI / 2, kind: 'passage' });
      }
    }
    for (const h of F.hatchesNear(b, x, z, R + 60)) out.push(hatchTerminal(F, b, h));
  }
  for (const u of F.uniquesNear(x, y, z, R + 80)) out.push(uniqueTerminal(F, u));
  return out.filter((s) => Math.hypot(s.x - x, s.y - y, s.z - z) < R);
}

/** O terminal na borda de uma escotilha: na laje ao lado da placa que falta, olhando para o vão. */
export function hatchTerminal(F, b, h) {
  const T = MEGA.tile;
  const u = h.lat + h.side * (T + 2.2); // já na laje cheia, logo depois da borda de fora
  const t = h.t + 3;
  const x = h.axis === 'x' ? t : u;
  const z = h.axis === 'x' ? u : t;
  // a tela (+z local) olha para o vão (−side, de lado)
  const yaw = h.axis === 'x' ? (h.side > 0 ? Math.PI : 0) : h.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const lane = { id: `T${b.n}${h.axis}${h.c}`, b, axis: h.axis, lat: h.lat };
  return { id: `ht:${h.id}`, x, y: b.top, z, yaw, kind: 'hatch', hatch: h, lane };
}

/** O terminal (console ativo) de uma estrutura única. */
export function uniqueTerminal(F, u) {
  return { id: `un:${u.id}`, ...F.uniqueConsole(u), kind: 'unique', unique: u };
}

/** Refaz um terminal pelo id estável ('st:…', 'ps:…', 'un:…'), ou null. */
export function siteById(F, id) {
  const [k, ...rest] = id.split(':');
  if (k === 'un') {
    const [n, i, kk] = rest[0].slice(1).split(',').map(Number);
    const u = F.uniqueSite(n, i, kk);
    return u ? uniqueTerminal(F, u) : null;
  }
  if (k === 'ht') {
    const m = /^h(-?\d+)([xz])(-?\d+)$/.exec(rest[0]);
    if (!m) return null;
    const b = F.barrier(Number(m[1]));
    const h = b && F.hatch(Number(m[1]), m[2], Number(m[3]), Number(rest[1]));
    return h ? hatchTerminal(F, b, h) : null;
  }
  if (k === 'ps') {
    const [n, pi, pk] = rest.map(Number);
    const b = F.barrier(n);
    const p = b && F.passage(n, pi, pk);
    return p ? { id, x: p.x + p.size / 2 + 5, y: b.top, z: p.z + 7, yaw: Math.PI / 2, kind: 'passage' } : null;
  }
  if (k === 'st') {
    // st:tz<a>,<b>:<s> ou st:tx<b>,<c>:<s>
    const lineId = rest[0];
    const s = Number(rest[1]);
    const [p, q] = lineId.slice(2).split(',').map(Number);
    const { spacing, ySpacing } = WALK;
    const L =
      lineId[1] === 'z'
        ? (() => {
            const w = F.walkZ(p, q);
            return w?.track ? { axis: 'z', u: p * spacing, y: q * ySpacing, w, track: w.track, id: lineId } : null;
          })()
        : (() => {
            const w = F.walkX(p, q);
            return w?.track ? { axis: 'x', u: q * spacing + spacing / 2, y: p * ySpacing + ySpacing / 2, w, track: w.track, id: lineId } : null;
          })();
    return L ? stationSite(L, s) : null;
  }
  return null;
}

// ── subestações (fase 4 — religar setores; world/substations.js, app/power.js) ──
//  Um setor apagado tem uma subestação por faixa de ~480 m de altura: um
//  armário com alavanca numa plataforma de estação do próprio setor (na ponta
//  da placa, oposta ao terminal). Qualquer uma delas religa o setor inteiro.

const SLAB = 480; // m de altura por subestação

// a estação onde um mundo da Peregrinação começa nunca tem subestação (o começo
// perderia o escuro): lang/leads.js registra quem sabe qual é (sem import circular)
let startSiteOf = null;
export function setStartSiteFn(fn) {
  startSiteOf = fn;
}

/** A subestação do setor na faixa de altura de y: { id, sector, x, y (pés), z, yaw, slab } ou null. */
export function substationFor(F, sector, y) {
  const slab = Math.floor(y / SLAB);
  return F._memo(`SS${sector.id}:${slab}`, () => {
    const hx = hash4(F.seed, sector.i, slab, sector.k, 1310);
    const hz = hash4(F.seed, sector.k, slab, sector.i, 1311);
    const tx = sector.px + (hx - 0.5) * 260;
    const tz = sector.pz + (hz - 0.5) * 260;
    const ty = (slab + 0.5) * SLAB;
    const avoid = startSiteOf?.(F);
    for (const R of [700, 1300]) {
      let best = null;
      let bd = Infinity;
      for (const s of terminalSitesNear(F, tx, ty, tz, R)) {
        if (s.kind !== 'station' || F.sectorAt(s.x, s.y, s.z, true).id !== sector.id) continue;
        if (avoid && s.line.id === avoid.line?.id && s.s === avoid.s) continue;
        const d = Math.hypot(s.x - tx, (s.y - ty) * 1.5, s.z - tz);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best) {
        const L = best.line;
        const ts = stationT(best.s);
        const t = ts + (TRANSIT.carLen + 4) / 2 - 2.6; // na ponta da placa
        const lat = L.u + L.track.side * (L.w.width / 2 + 0.9);
        return {
          id: `ss:${sector.id}:${slab}`,
          sector: sector.id,
          x: L.axis === 'z' ? lat : t,
          y: L.y,
          z: L.axis === 'z' ? t : lat,
          yaw: best.yaw + Math.PI, // de frente para o meio da plataforma
          slab,
        };
      }
    }
    return null;
  });
}

/** Subestações de setores apagados (pela lei do mundo) a até R de (x,y,z). */
export function substationsNear(F, x, y, z, R) {
  const seen = new Set();
  const out = [];
  for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) {
    const sec = F.sectorAt(x + dx, y, z + dz, true);
    if (sec.state !== 'dark' || seen.has(sec.id)) continue;
    seen.add(sec.id);
    for (const dy of [0, SLAB, -SLAB]) {
      const s = substationFor(F, sec, y + dy);
      // (duas faixas podem cair na mesma estação: um armário só)
      if (s && !out.some((o) => o.id === s.id || (o.x === s.x && o.y === s.y && o.z === s.z)) && Math.hypot(s.x - x, s.y - y, s.z - z) < R) out.push(s);
    }
  }
  return out;
}
