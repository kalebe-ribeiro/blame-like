// ─────────────────────────────────────────────────────────────────────────────
//  O diário como arquivo (tela de entrada — ver o cofre, Diario-como-arquivo):
//
//    DIÁRIO     os números da travessia (ui/journey.js)
//    REGISTROS  os terminais lidos neste mundo; clicar reabre o texto — refeito
//               do Field e traduzido com o que você sabe AGORA (reler meses
//               depois e entender é o prêmio)
//    PISTAS     os endereços lidos (Peregrinação): a rota com as partes que você
//               tem — traduzida com o léxico de agora —, a distância estimada e
//               o tamanho da área de incerteza; as já alcançadas no fim
//    LÉXICO     as palavras entendidas (global): a forma antiga e a tradução
// ─────────────────────────────────────────────────────────────────────────────
import { t, fmtDist } from '../i18n/index.js';
import { CONCEPTS, SCRIPT, ancientWord, drawLetter, drawTokens } from '../lang/ancient.js';

let tab = 'log';

/** Escolhe a aba (desenvolvimento: --archive=records|lexicon). */
export function setArchiveTab(k) {
  tab = k;
}

/**
 * @param {HTMLElement} el
 * @param {object} o { lines: [[rótulo, valor]], records: {id: {x,y,z,kind,at}}, leads: [{ tokens, open, dist, r }] | null, lexicon, here (GLOBAL), onOpen(id, rec) }
 */
export function renderArchive(el, o) {
  const tabs = [
    ['log', t('diary.title')],
    ['records', t('archive.records', { n: Object.keys(o.records).length })],
    ...(o.leads ? [['leads', t('archive.leads', { n: o.leads.filter((l) => l.open).length })]] : []),
    ['lexicon', t('archive.lexicon', o.lexicon.progress())],
  ];
  if (tab === 'leads' && !o.leads) tab = 'log';
  el.innerHTML =
    `<div class="archive-tabs">${tabs.map(([k, label]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${label}</button>`).join('')}</div>` +
    `<div class="archive-body"></div>`;
  const body = el.querySelector('.archive-body');
  el.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation(); // não entra no mundo
      tab = b.dataset.tab;
      renderArchive(el, o);
    }),
  );

  if (tab === 'log') {
    body.innerHTML = o.lines.map(([k, v]) => `<div class="diary-row"><span>${k}</span><b>${v}</b></div>`).join('');
    return;
  }

  if (tab === 'records') {
    const recs = Object.entries(o.records).sort((a, b) => b[1].at - a[1].at);
    if (!recs.length) {
      body.innerHTML = `<div class="archive-empty">${t('archive.noRecords')}</div>`;
      return;
    }
    body.innerHTML = recs
      .map(([id, r]) => {
        const d = Math.hypot(r.x - o.here.x, r.y - o.here.y, r.z - o.here.z);
        return `<div class="diary-row archive-rec" data-id="${id}"><span>${t(`archive.kind.${r.kind}`)}</span><b>${fmtDist(d)} · ${new Date(r.at).toLocaleDateString()}</b></div>`;
      })
      .join('');
    body.querySelectorAll('[data-id]').forEach((row) =>
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        o.onOpen(row.dataset.id, o.records[row.dataset.id]);
      }),
    );
    return;
  }

  if (tab === 'leads') {
    if (!o.leads.length) {
      body.innerHTML = `<div class="archive-empty">${t('archive.noLeads')}</div>`;
      return;
    }
    // cada pista: a rota (tokens, como na tela do terminal) e, embaixo, onde deve estar
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rowH = 38;
    const cw = Math.max(200, (el.clientWidth || Math.min(560, window.innerWidth * 0.86)) - 12);
    const ch = o.leads.length * rowH + 6;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const known = (w) => o.lexicon.known(w);
    const word = (w) => t(`word.${w}`);
    o.leads.forEach((l, i) => {
      const y = i * rowH + 4;
      const color = l.open ? 'rgba(200,196,184,0.85)' : 'rgba(160,160,150,0.45)';
      drawTokens(g, l.tokens, 2, y, known, word, { h: 9, font: '11px Consolas, monospace', color, maxW: cw - 8 });
      g.font = '10px Consolas, monospace';
      g.fillStyle = l.open ? 'rgba(215,196,154,0.7)' : 'rgba(160,160,150,0.4)';
      g.fillText(l.open ? t('archive.lead.open', { dist: fmtDist(l.dist), r: fmtDist(l.r) }) : t('archive.lead.reached'), 2, y + 16);
    });
    body.appendChild(canvas);
    return;
  }

  // léxico: as palavras entendidas, a forma antiga ao lado da tradução
  const known = Object.keys(CONCEPTS).filter((w) => o.lexicon.known(w));
  if (!known.length) {
    body.innerHTML = `<div class="archive-empty">${t('archive.noWords')}</div>`;
    return;
  }
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cols = 2;
  const rowH = 20;
  const cw = Math.max(200, (el.clientWidth || Math.min(560, window.innerWidth * 0.86)) - 12); // cabe sem rolar de lado
  const ch = Math.ceil(known.length / cols) * rowH + 6;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  g.font = '11px Consolas, monospace';
  g.textBaseline = 'top';
  known.forEach((w, i) => {
    const x = (i % cols) * (cw / cols);
    const y = Math.floor(i / cols) * rowH + 3;
    g.strokeStyle = 'rgba(178,188,172,0.55)';
    const letters = ancientWord(w);
    letters.forEach((l, k) => drawLetter(g, SCRIPT[l], x + k * 8, y + 2, 10));
    g.fillStyle = 'rgba(200,196,184,0.8)';
    g.fillText(t(`word.${w}`), x + 64, y + 1);
  });
  body.appendChild(canvas);
}
