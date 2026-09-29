// ─────────────────────────────────────────────────────────────────────────────
//  A travessia: onde você parou e o que já atravessou.
//
//  • Salvamento: a cada poucos segundos (e ao fechar) guarda a seed, a posição
//    GLOBAL, a direção do olhar e o modo. Ao abrir, o mundo volta exatamente
//    ali; o botão NOVO MUNDO na tela de entrada recomeça do zero.
//  • Diário: números acumulados em todas as sessões — distância andada,
//    voada e percorrida sobre trilhos, a maior queda, o ponto mais fundo e o
//    mais alto, regiões visitadas, apagões e colapsos testemunhados, fotos,
//    tempo. Mostrado em silêncio na tela de entrada.
//
//  Tudo em localStorage (fica no perfil do Electron, na máquina).
// ─────────────────────────────────────────────────────────────────────────────

import { t, fmtNum, fmtDist } from '../i18n/index.js';

const SAVE_KEY = 'cybercosmic.save.v1';
const DIARY_KEY = 'cybercosmic.diary.v1';

const read = (k) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sem armazenamento */
  }
};

export function loadSave() {
  const s = read(SAVE_KEY);
  if (!s || typeof s.seed !== 'number' || !Array.isArray(s.pos)) return null;
  return s;
}

export function storeSave(s) {
  write(SAVE_KEY, s);
}

const EMPTY = {
  walked: 0, flown: 0, rode: 0, rides: 0,
  maxFall: 0, minY: null, maxY: null,
  regions: [], outages: 0, collapses: 0, photos: 0,
  time: 0, sessions: 0,
};

/** Regiões contadas no diário (os nomes vêm de i18n: 'region.<nome>'). */
const REGIONS = ['ponte', 'abismo', 'altura', 'deriva', 'galeria', 'poco', 'estrato', 'colmeia', 'camada', 'macico', 'vazio', 'conduto'];

export class Diary {
  /** @param {boolean} persist  false = sessão de teste: começa do zero e não grava */
  constructor(persist = true) {
    this.persist = persist;
    this.d = { ...EMPTY, ...((persist && read(DIARY_KEY)) || {}) };
    this.d.sessions++;
    this._regions = new Set(this.d.regions);
    this._dirty = true;
  }

  add(key, v = 1) {
    this.d[key] += v;
    this._dirty = true;
  }

  fall(h) {
    if (h > this.d.maxFall) this.d.maxFall = h;
  }

  altitude(y) {
    if (this.d.minY === null || y < this.d.minY) this.d.minY = y;
    if (this.d.maxY === null || y > this.d.maxY) this.d.maxY = y;
  }

  region(r) {
    if (!r || !REGIONS.includes(r) || this._regions.has(r)) return false;
    this._regions.add(r);
    this.d.regions = [...this._regions];
    return true;
  }

  save() {
    if (this.persist) write(DIARY_KEY, this.d);
  }

  /** Linhas do diário para a tela de entrada. */
  lines() {
    const d = this.d;
    const alt = (y) => (y === null ? '—' : `${y >= 0 ? '+' : '−'}${fmtNum(Math.round(Math.abs(y)))} m`);
    const h = Math.floor(d.time / 3600);
    const m = Math.floor((d.time % 3600) / 60);
    return [
      [t('diary.walked'), fmtDist(d.walked)],
      [t('diary.flown'), fmtDist(d.flown)],
      [t('diary.rode'), d.rides ? `${fmtDist(d.rode)} · ${d.rides} ${t(d.rides === 1 ? 'diary.trip' : 'diary.trips')}` : '—'],
      [t('diary.maxFall'), d.maxFall ? `${fmtNum(Math.round(d.maxFall))} m` : '—'],
      [t('diary.depth'), `${alt(d.minY)} / ${alt(d.maxY)}`],
      [t('diary.regions'), `${this._regions.size}/${REGIONS.length} :: ${[...this._regions].map((r) => t(`region.${r}`)).join(' · ') || '—'}`],
      [t('diary.events'), `${d.outages} / ${d.collapses}`],
      [t('diary.photos'), `${d.photos}`],
      [t('diary.time'), h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`],
    ];
  }
}
