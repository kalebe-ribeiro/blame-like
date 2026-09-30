// ─────────────────────────────────────────────────────────────────────────────
//  Transporte: encontra o exemplar mais próximo de cada tipo de lugar e um
//  ponto de chegada com chão firme e boa vista.
//
//  Tudo é consultado na "lei" do mundo (Field) — não precisa que a região
//  esteja carregada. O corpo chega flutuando e só assenta quando a geometria
//  ao redor terminar de ser gerada.
//
//  findDestination(field, kind, globalPos, recent, opts) → { feet, yaw, pitch, fly, id } | null
//    feet: posição GLOBAL dos pés · recent: ids já visitados (para variar)
//    opts.colossus(): a máquina colossal mais próxima agora (ela anda com o tempo)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MEGA, HIVE, TRANSIT, MACRO } from '../gen/field.js';
import { startPlace } from '../lang/leads.js';
import { substationsNear } from '../gen/sites.js';

/** Tipos de destino (os nomes na tela vêm de i18n: 'dest.<kind>', 'dest.group.<group>'). */
export const DESTINATIONS = [
  { group: 'regions', kind: 'teia' },
  { group: 'regions', kind: 'colmeia' },
  { group: 'regions', kind: 'macico' },
  { group: 'regions', kind: 'vazio' },
  { group: 'regions', kind: 'inundado' },
  { group: 'interiors', kind: 'maquinas' },
  { group: 'interiors', kind: 'silo' },
  { group: 'interiors', kind: 'deposito' },
  { group: 'structures', kind: 'galeria' },
  { group: 'structures', kind: 'poco' },
  { group: 'structures', kind: 'conduto' },
  { group: 'structures', kind: 'estrato' },
  { group: 'structures', kind: 'trelica' },
  { group: 'structures', kind: 'escadaria' },
  { group: 'structures', kind: 'camada' },
  { group: 'other', kind: 'construtores' },
  { group: 'other', kind: 'cemiterio' },
  { group: 'other', kind: 'cascata' },
  { group: 'other', kind: 'transportador' },
  { group: 'other', kind: 'colosso' },
  { group: 'other', kind: 'terminal' },
  { group: 'other', kind: 'unica' },
  { group: 'other', kind: 'subestacao' },
  { group: 'other', kind: 'inicio' },
  { group: 'other', kind: 'ponte' },
];

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** yaw que faz a câmera olhar de (fx,fz) para (tx,tz). */
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const randYaw = (x, z) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * Math.PI * 2;

/** Pontos de amostra em anéis crescentes ao redor de (x,z), do mais perto ao mais longe. */
function* rings(x, z, step, maxR) {
  yield [x, z];
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      yield [x + Math.cos(a) * r, z + Math.sin(a) * r];
    }
  }
}

/** Escolhe o candidato mais próximo que não foi visitado há pouco. */
function pick(cands, g, recent) {
  cands.sort((a, b) => a.feet.distanceToSquared(g) - b.feet.distanceToSquared(g));
  return cands.find((c) => !recent.has(c.id) && c.feet.distanceTo(g) > 30) ?? cands[0] ?? null;
}

/** Há chão (camada, estrato ou piso de galeria) exatamente na altura y deste ponto? */
function floorAt(F, x, y, z) {
  for (const b of F.barriersNear(y)) if (Math.abs(y - b.top) < 1 && F.barrierSolid(b, x, z) && !F.reliefAt(b, x, z, 4)) return true;
  for (const st of F.strataNear(y)) if (Math.abs(y - st.top) < 1 && F.strataSolid(st, x, z)) return true;
  for (const gal of F.galleriesNear(x, y, z)) {
    if (Math.abs(y - gal.floor) > 1) continue;
    const lat = gal.axis === 'x' ? z : x;
    if (Math.abs(lat - gal.c) < gal.w / 2 - 6 && !F.insideVoid(x, gal.floor - 5, z, gal.id)) return true;
  }
  return false;
}

export function findDestination(F, kind, g, recent = new Set(), opts = {}) {
  const finders = {
    // ── à frente de uma máquina colossal, flutuando sob a trincheira: ela passa por cima ──
    colosso: () => {
      // o ponto de vista precisa estar no aberto (teia ou vazio), longe de paredes
      const spot = (m) => {
        const ahead = 320 * m.dir;
        return [m.lane.axis === 'x' ? m.x + ahead : m.x, m.y - 120, m.lane.axis === 'x' ? m.z : m.z + ahead];
      };
      const open = (m) => {
        const [x, y, z] = spot(m);
        return F.isOpenBiome(x, y, z) && F.isOpenBiome(m.x, y, m.z) && !F.insideVoid(x, y, z) && !F.nearMegaWall(x, y, z, 60);
      };
      const m = opts.colossus?.(open);
      if (!m) return null;
      const [fx, fy, fz] = spot(m);
      return { id: `c${Math.round(m.x)},${Math.round(m.z)}`, feet: V(fx, fy, fz), yaw: yawTo(fx, fz, m.x, m.z), pitch: Math.atan2(120, 320), fly: true };
    },
    ponte: () => ({ id: 'ponte', feet: V(0, 0.5, 58), yaw: 0, pitch: 0.03 }),
    // ── o começo de um mundo da Peregrinação nesta seed: diante do primeiro terminal morto ──
    inicio: () => {
      const s = startPlace(F);
      return s ? { id: 'inicio', feet: V(s.stand.x, s.stand.y + 0.05, s.stand.z), yaw: s.yaw, pitch: -0.2 } : null;
    },

    // ── regiões ──
    teia: () => biomeSpot(F, g, recent, 'teia', (x, y, z) => nodeSpot(F, x, y, z, 'teia')),
    // o vazio quase não tem chão: procura uma plataforma rara; se não houver, chega voando
    vazio: () =>
      biomeSpot(F, g, recent, 'vazio', (x, y, z) => nodeSpot(F, x, y, z, 'vazio', 4)) ??
      biomeSpot(F, g, recent, 'vazio', (x, y, z) => ({ id: `vazio${Math.round(x)},${Math.round(z)}`, feet: V(x, y, z), yaw: randYaw(x, z), pitch: 0, fly: true })),
    colmeia: () => biomeSpot(F, g, recent, 'colmeia', (x, y, z) => {
      const C = HIVE;
      const i0 = Math.floor(x / C);
      const j0 = Math.floor(y / C);
      const k0 = Math.floor(z / C);
      for (let r = 0; r <= 3; r++) {
        for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) for (let k = k0 - r; k <= k0 + r; k++) {
          if (!F.hiveRoom(i, j, k)) continue;
          const fx = i * C + C / 2;
          const fz = k * C + 32; // longe da escada (que fica no começo da sala)
          return { id: `h${i},${j},${k}`, feet: V(fx, j * C - 0.25, fz), yaw: randYaw(fx, fz), pitch: 0.05 };
        }
      }
      return null;
    }),
    macico: () => biomeSpot(F, g, recent, 'macico', (x, y, z) => {
      const S = 192;
      const i0 = Math.floor(x / S);
      const j0 = Math.floor(y / S);
      const k0 = Math.floor(z / S);
      for (let r = 0; r <= 2; r++) {
        for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) for (let k = k0 - r; k <= k0 + r; k++) {
          const b = F.massifBlock(i, j, k);
          if (!b || F.massifBlock(i, j + 1, k)) continue;
          // no topo do bloco: a vista das vielas-cânion lá embaixo
          const fx = (b.x0 + b.x1) / 2;
          const fz = (b.z0 + b.z1) / 2;
          return { id: `m${i},${j},${k}`, feet: V(fx, b.y1 + 0.05, fz), yaw: randYaw(fx, fz), pitch: -0.12 };
        }
      }
      return null;
    }),

    // ── estruturas ──
    galeria: () => {
      const cands = [];
      const { galleryY, galleryH } = MEGA;
      for (let b = Math.round(g.y / galleryY) - 3; b <= Math.round(g.y / galleryY) + 3; b++) {
        for (let c = Math.round(g.z / galleryH) - 5; c <= Math.round(g.z / galleryH) + 5; c++) addGallery(F.gallery('x', b, c));
      }
      for (let a = Math.round(g.x / galleryH) - 5; a <= Math.round(g.x / galleryH) + 5; a++) {
        for (let b = Math.round(g.y / galleryY) - 3; b <= Math.round(g.y / galleryY) + 3; b++) addGallery(F.gallery('z', a, b));
      }
      function addGallery(gal) {
        if (!gal) return;
        const along = gal.axis === 'x' ? g.x : g.z;
        for (const dt of [0, 300, -300, 700]) {
          const t = along + dt;
          const x = gal.axis === 'x' ? t : gal.c;
          const z = gal.axis === 'x' ? gal.c : t;
          if (F.insideVoid(x, gal.floor - 5, z, gal.id) || F.inBarrier(gal.floor, 10)) continue;
          cands.push({ id: gal.id, feet: V(x, gal.floor + 0.05, z), yaw: gal.axis === 'x' ? -Math.PI / 2 : Math.PI, pitch: 0.12 });
          return;
        }
      }
      return pick(cands, g, recent);
    },
    poco: () => {
      const cands = [];
      const S = MEGA.shaft;
      for (let a = Math.round(g.x / S) - 4; a <= Math.round(g.x / S) + 4; a++) {
        for (let c = Math.round(g.z / S) - 4; c <= Math.round(g.z / S) + 4; c++) {
          const s = F.shaft(a, c);
          if (!s) continue;
          const faces = [['x', s.z - s.wz / 2, 1], ['x', s.z + s.wz / 2, -1], ['z', s.x - s.wx / 2, 1], ['z', s.x + s.wx / 2, -1]];
          const [axis, face, inward] = faces[s.stairFace];
          for (const dk of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
            const y = (Math.round(g.y / 48) + dk) * 48 - 0.4;
            if (F.inBarrier(y, 60)) continue;
            // na sacada da face da escada, rente à parede (o lance corre mais para dentro)
            const x = axis === 'x' ? s.x : face + inward * 1.8;
            const z = axis === 'x' ? face + inward * 1.8 : s.z;
            if (F.insideVoid(axis === 'x' ? x : face - inward * 5, y + 5, axis === 'x' ? face - inward * 5 : z, s.id)) continue;
            cands.push({ id: s.id, feet: V(x, y + 0.05, z), yaw: yawTo(x, z, s.x, s.z), pitch: 0.05 });
            break;
          }
        }
      }
      return pick(cands, g, recent);
    },
    conduto: () => {
      const cands = [];
      const S = MEGA.conduit;
      const add = (c) => {
        if (!c) return;
        const t = c.axis === 'x' ? g.x : g.z;
        const x = c.axis === 'x' ? t : c.lat;
        const z = c.axis === 'x' ? c.lat : t;
        if (F.insideVoid(x, c.y, z, c.id) || F.inBarrier(c.y, c.R)) return;
        cands.push({ id: c.id, feet: V(x, c.floor + 0.05, z), yaw: c.axis === 'x' ? -Math.PI / 2 : Math.PI, pitch: 0.05 });
      };
      for (let u = Math.round(g.y / S) - 3; u <= Math.round(g.y / S) + 3; u++) for (let v = Math.round(g.z / S) - 5; v <= Math.round(g.z / S) + 5; v++) add(F.conduit('x', u, v));
      for (let u = Math.round(g.x / S) - 5; u <= Math.round(g.x / S) + 5; u++) for (let v = Math.round(g.y / S) - 3; v <= Math.round(g.y / S) + 3; v++) add(F.conduit('z', u, v));
      return pick(cands, g, recent);
    },
    estrato: () => {
      const cands = [];
      const s0 = Math.round((g.y / 48 + 16) / 29);
      for (let s = s0 - 4; s <= s0 + 4; s++) {
        const st = F.stratum(s);
        if (!st) continue;
        for (const [x, z] of rings(g.x, g.z, 80, 2400)) {
          if (F.strataSolid(st, x, z) && F.strataSolid(st, x + 60, z) && F.strataSolid(st, x - 60, z) && F.strataSolid(st, x, z + 60) && F.strataSolid(st, x, z - 60)) {
            cands.push({ id: `st${s}`, feet: V(x, st.top + 0.05, z), yaw: randYaw(x, z), pitch: 0.08 });
            break;
          }
        }
      }
      return pick(cands, g, recent);
    },
    trelica: () => {
      const S = MEGA.frame;
      const cands = [];
      for (const [px, pz] of rings(g.x, g.z, 480, 14000)) {
        for (const dy of [0, 480, -480, 960, -960]) {
          const py = g.y + dy;
          if (!F.frameZone(px, py, pz)) continue;
          // uma viga no eixo X: exatamente as mesmas condições da geração (macrogen)
          const i = Math.round(px / S);
          const j = Math.round(py / S);
          const k = Math.round(pz / S);
          const t = F.frameBeam('x', j, k, i);
          const bx = i * S + S / 2;
          const by = j * S;
          const bz = k * S;
          const inZone = (x, y, z) => F.frameZone(x, y, z) && F.isOpenBiome(x, y, z) && !F.insideVoid(x, y, z) && !F.inBarrier(y, 20);
          // o nó de onde a viga sai também tem de estar na zona, na célula macro que gera treliça
          if (!t || !inZone(i * S, by, bz) || !F.frameCell(Math.floor((i * S) / MACRO), Math.floor(by / MACRO), Math.floor(bz / MACRO))) continue;
          if (!inZone(bx, by, bz)) continue;
          if (F.walkwayNear(bx, by - t / 2 - 6, by + t / 2 + 3, bz, S / 2 + 8)) continue;
          cands.push({ id: `f${i},${j},${k}`, feet: V(bx, by + t / 2 + 0.05, bz), yaw: -Math.PI / 2, pitch: 0.05 });
          if (cands.length > 6) break;
        }
        if (cands.length > 6) break;
      }
      return pick(cands, g, recent);
    },
    escadaria: () => {
      const cands = [];
      const R = 7000;
      for (const e of F.stairwaysIn(g.x - R, g.y - 1500, g.z - R, g.x + R, g.y + 1500, g.z + R)) {
        // o ponto da escada na altura do observador — ou perto dela, se essa altura
        // cai dentro de uma camada (quem está em cima de uma camada, por exemplo)
        for (const dy of [0, 120, -120, 300, -300, 600, -600]) {
          const t = (g.y + dy - e.y0) / (e.dir * MEGA.stairSlope);
          const y = F.stairY(e, t);
          if (F.inBarrier(y, 20)) continue;
          const x = e.axis === 'x' ? t : e.lat;
          const z = e.axis === 'x' ? e.lat : t;
          if (F.insideVoid(x, y + 3, z)) continue;
          const yaw = e.axis === 'x' ? -e.dir * Math.PI / 2 : (e.dir > 0 ? Math.PI : 0);
          cands.push({ id: e.id, feet: V(x, y + 0.6, z), yaw, pitch: 0.2 });
          break;
        }
      }
      return pick(cands, g, recent);
    },
    camada: () => {
      const cands = [];
      const P = MEGA.passage;
      for (const b of F.barriersNear(g.y)) {
        for (let pi = Math.floor(g.x / P) - 5; pi <= Math.floor(g.x / P) + 5; pi++) {
          for (let pk = Math.floor(g.z / P) - 5; pk <= Math.floor(g.z / P) + 5; pk++) {
            const p = F.passage(b.n, pi, pk);
            if (!p) continue;
            // na ponte de embarque de cima, olhando para o poço do elevador
            cands.push({ id: `E${b.n},${pi},${pk}`, feet: V(p.x + 36, b.top + 0.05, p.z), yaw: yawTo(p.x + 36, p.z, p.x, p.z), pitch: -0.35 });
          }
        }
      }
      return pick(cands, g, recent);
    },

    // ── interiores do maciço: no primeiro nível, junto à porta oeste, olhando o átrio ──
    maquinas: () => finders._hollow('maquinas'),
    silo: () => finders._hollow('silo'),
    deposito: () => finders._hollow('deposito'),
    _hollow: (type) => {
      const S = 192;
      const cands = [];
      for (const [x, z] of rings(g.x, g.z, S, 14000)) {
        for (const dj of [0, 1, -1, 2, -2]) {
          const i = Math.floor(x / S);
          const k = Math.floor(z / S);
          const j = Math.floor(g.y / S) + dj;
          const h = F.massifHollow(i, j, k);
          if (!h || h.type !== type) continue;
          const zc = (h.z0 + h.z1) / 2;
          const fx = h.x0 + 6 + 4; // no mezanino / rampa, junto à parede
          const y = h.levels[0];
          cands.push({ id: `mh${i},${j},${k}`, feet: V(fx, y + 0.05, zc), yaw: yawTo(fx, zc, fx + 10, zc), pitch: -0.18 });
        }
        if (cands.length > 3) break;
      }
      return pick(cands, g, recent);
    },

    // ── setores inundados: no meio da lâmina d'água ──
    inundado: () => {
      const T = MEGA.tile;
      const cands = [];
      for (const dy of [0, MEGA.barrier, -MEGA.barrier, 1400, -1400]) {
        for (const surf of F.floodSurfaces(g.y + dy)) {
          let found = 0;
          for (const [x, z] of rings(g.x, g.z, T * 2, 9000)) {
            const i = Math.floor(x / T);
            const k = Math.floor(z / T);
            // longe dos diques: a placa e as vizinhas alagadas
            if (!F.floodedTile(surf, i, k) || !F.floodedTile(surf, i + 1, k) || !F.floodedTile(surf, i - 1, k) || !F.floodedTile(surf, i, k + 1) || !F.floodedTile(surf, i, k - 1)) continue;
            const fx = (i + 0.5) * T;
            const fz = (k + 0.5) * T;
            cands.push({ id: `fl${surf.kind}${surf.id}:${i},${k}`, feet: V(fx, surf.top + 0.05, fz), yaw: randYaw(fx, fz), pitch: 0.02 });
            if (++found > 2) break;
          }
        }
        if (cands.length) break;
      }
      return pick(cands, g, recent);
    },

    // ── cascatas: na borda da poça, olhando a água cair ──
    cascata: () => {
      const cands = [];
      for (const R of [1500, 4000]) {
        for (const dy of [0, 1500, -1500]) {
          for (const c of F.cascadesNear(g.x, g.y + dy, g.z, R)) {
            if (c.ends !== 'pool') continue;
            const col = F.cascadeColumn(c);
            // de frente para a parede de onde a água sai, a ~45 m da coluna
            const x = col.x + c.nx * 45;
            const z = col.z + c.nz * 45;
            cands.push({ id: c.id, feet: V(x, c.bottom + 0.3, z), yaw: yawTo(x, z, col.x, col.z), pitch: 0.35 });
          }
        }
        if (cands.length) break;
      }
      return pick(cands, g, recent);
    },

    // ── transportadores: na plataforma de uma estação, de frente para o trilho ──
    transportador: () => {
      const cands = [];
      for (const R of [1200, 3000]) {
        for (const L of F.transitLinesNear(g.x, g.y, g.z, R)) {
          const tp = L.axis === 'z' ? g.z : g.x;
          const S = TRANSIT.station;
          for (const s of [Math.round((tp - S / 2) / S), Math.round((tp - S / 2) / S) + 1]) {
            const ts = s * S + S / 2;
            const side = L.track.side;
            const lat = L.u + side * (L.w.width / 2 + 1.6); // no meio da plataforma
            const x = L.axis === 'z' ? lat : ts;
            const z = L.axis === 'z' ? ts : lat;
            const tx = L.axis === 'z' ? lat + side * 10 : ts;
            const tz = L.axis === 'z' ? ts : lat + side * 10;
            cands.push({ id: `${L.id}:${s}`, feet: V(x, L.y + 0.05, z), yaw: yawTo(x, z, tx, tz), pitch: 0.02 });
          }
        }
        if (cands.length) break;
      }
      return pick(cands, g, recent);
    },

    // ── diante de um terminal com energia (o das estações — ver world/terminals.js) ──
    terminal: () => {
      const cands = [];
      const S = TRANSIT.station;
      for (const R of [1500, 4000]) {
        for (const L of F.transitLinesNear(g.x, g.y, g.z, R)) {
          const tp = L.axis === 'z' ? g.z : g.x;
          for (let s = Math.round((tp - S / 2) / S) - 2; s <= Math.round((tp - S / 2) / S) + 2; s++) {
            const ts = s * S + S / 2;
            const t = ts - (TRANSIT.carLen + 4) / 2 + 1.4; // o terminal, na ponta da plataforma
            const lat = L.u + L.track.side * (L.w.width / 2 + 0.9);
            const tx = L.axis === 'z' ? lat : t;
            const tz = L.axis === 'z' ? t : lat;
            if (F.sectorAt(tx, L.y, tz).state === 'dark') continue;
            // de pé na frente da tela (que olha para +t)
            const fx = L.axis === 'z' ? lat : t + 1.4;
            const fz = L.axis === 'z' ? t + 1.4 : lat;
            cands.push({ id: `T${L.id}:${s}`, feet: V(fx, L.y + 0.05, fz), yaw: yawTo(fx, fz, tx, tz), pitch: -0.2 });
          }
        }
        if (cands.length) break;
      }
      return pick(cands, g, recent);
    },

    // ── uma subestação (setor apagado): de pé diante do armário ──
    subestacao: () => {
      const cands = [];
      for (const R of [1500, 4000]) {
        for (let k = 0; k < 24 && cands.length < 6; k++) {
          const a = k * 2.4;
          const r = R * ((k % 5) + 1) / 5;
          for (const s of substationsNear(F, g.x + Math.cos(a) * r, g.y, g.z + Math.sin(a) * r, 700)) {
            if (cands.some((c) => c.id === s.id)) continue;
            const fx = s.x + Math.sin(s.yaw) * 1.6;
            const fz = s.z + Math.cos(s.yaw) * 1.6;
            cands.push({ id: s.id, feet: V(fx, s.y + 0.05, fz), yaw: yawTo(fx, fz, s.x, s.z), pitch: -0.15 });
          }
        }
        if (cands.length) break;
      }
      return pick(cands, g, recent);
    },

    // ── uma estrutura única: de pé diante da porta, a ~40 m, olhando para ela ──
    unica: () => {
      const cands = [];
      for (const R of [20000, 40000]) {
        for (const u of F.uniquesNear(g.x, g.y, g.z, R)) {
          const d = u.door;
          const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
          const ha = d < 2 ? u.hx : u.hz;
          const hc = d < 2 ? u.hz : u.hx;
          const off = u.doorOff * hc;
          const dx = u.x + ax[0] * ha - ax[1] * off; // a porta (c = (−ax[1], ax[0]))
          const dz = u.z + ax[1] * ha + ax[0] * off;
          const fx = dx + ax[0] * 40;
          const fz = dz + ax[1] * 40;
          cands.push({ id: `U${u.id}`, feet: V(fx, u.y + 0.05, fz), yaw: yawTo(fx, fz, dx, dz), pitch: 0.05 });
        }
        if (cands.length) break;
      }
      return pick(cands, g, recent);
    },

    // ── os Construtores ──
    // (vivos ou mortos)
    _sites: (dead) => {
      const cands = [];
      for (const dy of [0, MEGA.barrier, -MEGA.barrier]) {
        for (const s of F.builderSitesNear(g.x, g.y + dy, g.z, 6000)) {
          if (!!s.dead !== dead) continue;
          // um ponto a ~160 m do canteiro, sobre a mesma superfície, olhando para ele —
          // de frente para o pórtico (o vão corre ao longo de def.axis), não de perfil
          const front = s.axis === 'x' ? [[0, 160], [0, -160], [0, 110], [0, -110]] : [[160, 0], [-160, 0], [110, 0], [-110, 0]];
          for (const [ox, oz] of [...front, [120, 120], [-120, -120], [120, -120], [-120, 120]]) {
            const x = s.x + ox;
            const z = s.z + oz;
            if (!floorAt(F, x, s.y, z)) continue;
            cands.push({ id: s.id, feet: V(x, s.y + 0.05, z), yaw: yawTo(x, z, s.x, s.z), pitch: 0.2 });
            break;
          }
        }
      }
      return pick(cands, g, recent);
    },
    construtores: () => finders._sites(false),
    cemiterio: () => finders._sites(true),
  };
  return finders[kind]?.() ?? null;
}

/** Procura, em anéis crescentes na altura do observador, um ponto na região pedida. */
function biomeSpot(F, g, recent, biome, spotAt) {
  for (const dy of [0, 400, -400, 900, -900]) {
    const y = g.y + dy;
    let tries = 0;
    for (const [x, z] of rings(g.x, g.z, 350, 30000)) {
      if (F.biome(x, y, z) !== biome || F.inBarrier(y, 80)) continue;
      const spot = spotAt(x, y, z);
      if (spot && !recent.has(spot.id) && spot.feet.distanceTo(g) > 30) return spot;
      if (++tries > 40) break;
    }
  }
  return null;
}

/** Plataforma da rede andável perto do ponto (na região pedida). */
function nodeSpot(F, x, y, z, biome, reach = 2) {
  const n = F.nearestNode(x, y, z, { below: 3, above: 3, reach });
  if (!n || F.biome(n.x, n.y, n.z) !== biome) return null;
  return { id: `n${n.i},${n.l},${n.k}`, feet: V(n.x, n.y + 0.05, n.z), yaw: randYaw(n.x, n.z), pitch: 0.05 };
}

