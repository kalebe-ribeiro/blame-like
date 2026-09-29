// ─────────────────────────────────────────────────────────────────────────────
//  Diário da travessia: números acumulados neste mundo — distância andada,
//  voada e percorrida sobre trilhos, a maior queda, o ponto mais fundo e o
//  mais alto, regiões visitadas, apagões e colapsos testemunhados, fotos,
//  tempo. Mostrado em silêncio na tela de entrada.
//
//  Os dados vivem no mundo salvo (app/saves.js); aqui só a lógica e o texto.
//  (Na fase 2 do plano o diário vira arquivo: registros, léxico, pistas.)
// ─────────────────────────────────────────────────────────────────────────────
import { t, fmtNum, fmtDist } from '../i18n/index.js';

const EMPTY = {
  walked: 0, flown: 0, rode: 0, rides: 0,
  maxFall: 0, minY: null, maxY: null,
  regions: [], outages: 0, collapses: 0, photos: 0,
  time: 0, sessions: 0,
};

/** Regiões contadas no diário (os nomes vêm de i18n: 'region.<nome>'). */
const REGIONS = ['ponte', 'abismo', 'altura', 'deriva', 'galeria', 'poco', 'estrato', 'colmeia', 'camada', 'macico', 'vazio', 'conduto'];

export class Diary {
  /** @param {object|null} data  o diário do mundo salvo (null = começa do zero) */
  constructor(data) {
    this.d = { ...EMPTY, ...(data ?? {}) };
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
