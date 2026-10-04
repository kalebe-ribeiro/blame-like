// ─────────────────────────────────────────────────────────────────────────────
//  Painel de configurações (tecla O, ou o botão na tela de entrada).
//  Os valores ficam salvos no navegador do Electron (localStorage) e são
//  reaplicados ao abrir o app.
//
//  Para adicionar uma opção: acrescente um item em FIELDS, o rótulo em
//  i18n/*.js ('settings.<chave>') e trate a chave em applySettings() (app/ui.js).
// ─────────────────────────────────────────────────────────────────────────────
import { t, LANGS, onLangChange } from '../i18n/index.js';

const STORAGE_KEY = 'cybercosmic.settings.v1';

export const DEFAULTS = {
  lang: 'en', // idioma da interface (inglês é o padrão)
  renderDistance: 560, // m — raio de carregamento dos chunks
  fog: 1, // multiplicador da densidade da névoa
  fov: 72, // graus (vertical)
  sensitivity: 1, // multiplicador do mouse
  resolution: 1.25, // limite de pixel ratio
  fallRescue: false, // realocar ao cair por muito tempo
  outages: true, // apagões de setor
  collapses: true, // colapsos distantes
  safeguards: false, // Safeguards no modo Livre (na Peregrinação eles sempre existem — fase 6)
  health: false, // a vida no modo Livre (na Peregrinação ela sempre existe — app/health.js)
  ssao: true, // oclusão de ambiente
  taa: true, // antialiasing temporal
  shafts: true, // raios de luz na névoa
  reflections: true, // reflexo da água nos setores inundados
  music: true, // trilha: acordes raros e lentos sobre o drone
  headBob: true, // balanço da cabeça ao andar
  motionFx: true, // na queda: campo de visão abrindo, tremor, afundamento no pouso
  distortion: true, // a lente do emissor (carregando e no disparo) — desligar se enjoa
  invertY: false, // inverter o eixo vertical (mouse e controle)
};

const FIELDS = [
  { key: 'lang', type: 'select', options: LANGS },
  { key: 'renderDistance', type: 'range', min: 240, max: 2400, step: 40, fmt: (v) => `${v} m`, hint: true },
  { key: 'fog', type: 'range', min: 0, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'fov', type: 'range', min: 50, max: 100, step: 1, fmt: (v) => `${v}°` },
  { key: 'sensitivity', type: 'range', min: 0.3, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'resolution', type: 'range', min: 0.5, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'ssao', type: 'toggle' },
  { key: 'taa', type: 'toggle' },
  { key: 'shafts', type: 'toggle' },
  { key: 'reflections', type: 'toggle' },
  { key: 'music', type: 'toggle' },
  { key: 'headBob', type: 'toggle' },
  { key: 'motionFx', type: 'toggle' },
  { key: 'distortion', type: 'toggle' },
  { key: 'invertY', type: 'toggle' },
  { key: 'outages', type: 'toggle' },
  { key: 'collapses', type: 'toggle' },
  { key: 'safeguards', type: 'toggle' },
  { key: 'health', type: 'toggle' },
  { key: 'fallRescue', type: 'toggle' },
];
const label = (f) => t(f.key === 'lang' ? 'settings.lang' : `settings.${f.key}`);
const onOff = (v) => t(v ? 'settings.on' : 'settings.off');

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* sem armazenamento: usa os padrões */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}

export class SettingsPanel {
  /**
   * @param {object} values           configurações atuais (mutadas no lugar)
   * @param {(values, key) => void} onChange
   */
  constructor(values, onChange) {
    this.values = values;
    this.onChange = onChange;
    this.onClose = null;
    this.el = this._build();
    document.body.appendChild(this.el);
    onLangChange(() => this._relabel());
    this._relabel();
  }

  /** Reescreve os rótulos no idioma atual. */
  _relabel() {
    this.el.querySelector('.settings-title').textContent = t('settings.title');
    this.el.querySelector('[data-act="reset"]').textContent = t('settings.reset');
    this.el.querySelector('[data-act="close"]').textContent = t('settings.back');
    for (const { f, labelEl, hintEl } of Object.values(this.inputs)) {
      labelEl.textContent = label(f);
      if (hintEl) hintEl.textContent = t(`settings.${f.key}.hint`);
    }
    this._sync();
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open() {
    this._sync();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.onClose?.();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'settings';
    root.innerHTML = `
      <div class="settings-box">
        <div class="settings-title"></div>
        <div class="settings-rows"></div>
        <div class="settings-actions">
          <button data-act="reset"></button>
          <button data-act="close"></button>
        </div>
      </div>`;
    const rows = root.querySelector('.settings-rows');
    this.inputs = {};
    for (const f of FIELDS) {
      const row = document.createElement('label');
      row.className = 'settings-row';
      if (f.type === 'range') {
        row.innerHTML = `
          <span class="settings-label"></span>
          <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" />
          <span class="settings-value"></span>
          ${f.hint ? '<span class="settings-hint"></span>' : ''}`;
        const input = row.querySelector('input');
        const out = row.querySelector('.settings-value');
        input.addEventListener('input', () => {
          this.values[f.key] = Number(input.value);
          out.textContent = f.fmt(this.values[f.key]);
          this._commit(f.key);
        });
        this.inputs[f.key] = { input, out, f };
      } else if (f.type === 'select') {
        row.innerHTML = `
          <span class="settings-label"></span>
          <select>${f.options.map(([v, name]) => `<option value="${v}">${name}</option>`).join('')}</select>
          <span class="settings-value"></span>`;
        const input = row.querySelector('select');
        input.addEventListener('change', () => {
          this.values[f.key] = input.value;
          this._commit(f.key);
        });
        this.inputs[f.key] = { input, out: null, f };
      } else {
        row.innerHTML = `
          <span class="settings-label"></span>
          <input type="checkbox" />
          <span class="settings-value"></span>`;
        const input = row.querySelector('input');
        const out = row.querySelector('.settings-value');
        input.addEventListener('change', () => {
          this.values[f.key] = input.checked;
          out.textContent = onOff(input.checked);
          this._commit(f.key);
        });
        this.inputs[f.key] = { input, out, f };
      }
      this.inputs[f.key].labelEl = row.querySelector('.settings-label');
      this.inputs[f.key].hintEl = row.querySelector('.settings-hint');
      rows.appendChild(row);
    }
    root.addEventListener('click', (e) => {
      e.stopPropagation(); // não deixa o clique "atravessar" para a tela de entrada
      const act = e.target?.dataset?.act;
      if (act === 'close') this.close();
      if (act === 'reset') {
        Object.assign(this.values, DEFAULTS);
        this._sync();
        for (const k of Object.keys(DEFAULTS)) this._commit(k);
      }
    });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
    return root;
  }

  _sync() {
    for (const { input, out, f } of Object.values(this.inputs)) {
      const v = this.values[f.key];
      if (f.type === 'range') {
        input.value = v;
        out.textContent = f.fmt(v);
      } else if (f.type === 'select') {
        input.value = v;
      } else {
        input.checked = !!v;
        out.textContent = onOff(v);
      }
    }
  }

  _commit(key) {
    saveSettings(this.values);
    this.onChange?.(this.values, key);
  }
}
