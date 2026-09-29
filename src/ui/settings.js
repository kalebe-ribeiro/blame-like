// ─────────────────────────────────────────────────────────────────────────────
//  Painel de configurações (tecla O, ou o botão na tela de entrada).
//  Os valores ficam salvos no navegador do Electron (localStorage) e são
//  reaplicados ao abrir o app.
//
//  Para adicionar uma opção: acrescente um item em FIELDS e trate a chave em
//  applySettings() (app.js).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cybercosmic.settings.v1';

export const DEFAULTS = {
  renderDistance: 560, // m — raio de carregamento dos chunks
  fog: 1, // multiplicador da densidade da névoa
  fov: 72, // graus (vertical)
  sensitivity: 1, // multiplicador do mouse
  resolution: 1.25, // limite de pixel ratio
  fallRescue: false, // realocar ao cair por muito tempo
  outages: true, // apagões de setor
  collapses: true, // colapsos distantes
  ssao: true, // oclusão de ambiente
  taa: true, // antialiasing temporal
  shafts: true, // raios de luz na névoa
  reflections: true, // reflexo da água nos setores inundados
  music: true, // trilha: acordes raros e lentos sobre o drone
  headBob: true, // balanço da cabeça ao andar
  motionFx: true, // na queda: campo de visão abrindo, tremor, afundamento no pouso
  invertY: false, // inverter o eixo vertical (mouse e controle)
};

const FIELDS = [
  {
    key: 'renderDistance',
    label: 'distância de renderização',
    type: 'range', min: 240, max: 2400, step: 40,
    fmt: (v) => `${v} m`,
    hint: 'acima de 700 m entra o LOD: o que está longe é gerado simplificado',
  },
  { key: 'fog', label: 'densidade da névoa', type: 'range', min: 0, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'fov', label: 'campo de visão', type: 'range', min: 50, max: 100, step: 1, fmt: (v) => `${v}°` },
  { key: 'sensitivity', label: 'sensibilidade do mouse', type: 'range', min: 0.3, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'resolution', label: 'resolução (densidade de pixels)', type: 'range', min: 0.5, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'ssao', label: 'oclusão de ambiente (SSAO)', type: 'toggle' },
  { key: 'taa', label: 'antialiasing temporal (TAA)', type: 'toggle' },
  { key: 'shafts', label: 'raios de luz na névoa', type: 'toggle' },
  { key: 'reflections', label: 'reflexo da água (setores inundados)', type: 'toggle' },
  { key: 'music', label: 'trilha (acordes raros e lentos)', type: 'toggle' },
  { key: 'headBob', label: 'balanço da cabeça ao andar', type: 'toggle' },
  { key: 'motionFx', label: 'efeitos de queda (campo de visão, tremor)', type: 'toggle' },
  { key: 'invertY', label: 'inverter eixo vertical', type: 'toggle' },
  { key: 'outages', label: 'apagões de setor', type: 'toggle' },
  { key: 'collapses', label: 'colapsos distantes', type: 'toggle' },
  { key: 'fallRescue', label: 'realocar ao cair por muito tempo', type: 'toggle' },
];

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* sem armazenamento: usa os padrões */
  }
  return { ...DEFAULTS };
}

function saveSettings(s) {
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
        <div class="settings-title">CONFIGURAÇÕES</div>
        <div class="settings-rows"></div>
        <div class="settings-actions">
          <button data-act="reset">restaurar padrões</button>
          <button data-act="close">voltar</button>
        </div>
      </div>`;
    const rows = root.querySelector('.settings-rows');
    this.inputs = {};
    for (const f of FIELDS) {
      const row = document.createElement('label');
      row.className = 'settings-row';
      if (f.type === 'range') {
        row.innerHTML = `
          <span class="settings-label">${f.label}</span>
          <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" />
          <span class="settings-value"></span>
          ${f.hint ? `<span class="settings-hint">${f.hint}</span>` : ''}`;
        const input = row.querySelector('input');
        const out = row.querySelector('.settings-value');
        input.addEventListener('input', () => {
          this.values[f.key] = Number(input.value);
          out.textContent = f.fmt(this.values[f.key]);
          this._commit(f.key);
        });
        this.inputs[f.key] = { input, out, f };
      } else {
        row.innerHTML = `
          <span class="settings-label">${f.label}</span>
          <input type="checkbox" />
          <span class="settings-value"></span>`;
        const input = row.querySelector('input');
        const out = row.querySelector('.settings-value');
        input.addEventListener('change', () => {
          this.values[f.key] = input.checked;
          out.textContent = input.checked ? 'ligado' : 'desligado';
          this._commit(f.key);
        });
        this.inputs[f.key] = { input, out, f };
      }
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
      } else {
        input.checked = !!v;
        out.textContent = v ? 'ligado' : 'desligado';
      }
    }
  }

  _commit(key) {
    saveSettings(this.values);
    this.onChange?.(this.values, key);
  }
}
