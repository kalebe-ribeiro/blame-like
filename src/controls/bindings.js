// ─────────────────────────────────────────────────────────────────────────────
//  Atalhos: TODAS as teclas e botões do controle num lugar só, trocáveis na aba
//  CONTROLES (ui/controlsPanel.js) e salvos no navegador do Electron.
//
//  Cada ação tem uma tecla (KeyboardEvent.code) e um botão do controle
//  (índice do mapeamento "standard" da API Gamepad; null = sem botão).
//  modes: em que modos de jogo a ação existe (sem modes: em todos). Duas ações
//  podem dividir a mesma tecla se nunca existirem no mesmo modo (F: voar no
//  Livre, lanterna na Peregrinação).
//
//  Fixos (não se trocam): olhar (mouse / analógico direito), andar no controle
//  (analógico esquerdo), ESC no teclado (menu: soltar o mouse / fechar) e,
//  nos menus, os botões de navegação do controle (ui/padNav.js).
//
//  REGRA ABSOLUTA: tudo que se faz no teclado tem de dar para fazer só com o
//  controle — toda ação tem (ou pode ganhar) um botão, e todo painel se
//  navega pelo controle (ui/padNav.js).
//
//  Quem lê: controls/noclip.js (movimento, voo, piloto automático, botões do
//  controle), app/ui.js (teclas globais), app/carried.js (lanterna, sensor).
//  Os textos que citam uma tecla usam bindings.label(ação) — mostra o botão
//  do controle quando o controle foi o último a ser usado.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cybercosmic.bindings.v1';

/** grupo · id · tecla padrão · botão padrão · modos */
export const ACTIONS = [
  { id: 'forward', group: 'move', key: 'KeyW', pad: null },
  { id: 'back', group: 'move', key: 'KeyS', pad: null },
  { id: 'left', group: 'move', key: 'KeyA', pad: null },
  { id: 'right', group: 'move', key: 'KeyD', pad: null },
  { id: 'jump', group: 'move', key: 'Space', pad: 0 },
  { id: 'descend', group: 'move', key: 'ControlLeft', pad: 1, modes: ['free'] },
  { id: 'run', group: 'move', key: 'ShiftLeft', pad: 6 },
  { id: 'fly', group: 'move', key: 'KeyF', pad: 2, modes: ['free'] },
  { id: 'autopilot', group: 'move', key: 'KeyP', pad: 12, modes: ['free'] },
  { id: 'use', group: 'act', key: 'KeyE', pad: 3 },
  { id: 'lantern', group: 'act', key: 'KeyF', pad: 2, modes: ['pilgrimage'] },
  { id: 'torch', group: 'act', key: 'KeyL', pad: 13, modes: ['free'] }, // a lanterna no Livre (F é voar)
  { id: 'fire', group: 'act', key: 'KeyQ', pad: 7 }, // o emissor de feixe (app/beam.js) — também o clique esquerdo
  { id: 'power', group: 'act', key: 'KeyB', pad: 10 }, // a potência do emissor (1–5) — também a roda do mouse
  { id: 'sensor', group: 'act', key: 'KeyG', pad: 13, modes: ['pilgrimage'] },
  { id: 'mark', group: 'act', key: 'KeyV', pad: 4 },
  { id: 'photo', group: 'act', key: 'F2', pad: 5 },
  { id: 'menu', group: 'ui', key: 'Escape', pad: 9, fixedKey: true },
  { id: 'map', group: 'ui', key: 'KeyM', pad: 8 },
  { id: 'inventory', group: 'ui', key: 'KeyI', pad: 11 }, // o inventário e as mãos (app/inventory.js)
  { id: 'hud', group: 'ui', key: 'KeyH', pad: 15, modes: ['free'] },
  { id: 'transport', group: 'ui', key: 'KeyT', pad: null, modes: ['free'] },
  { id: 'regenerate', group: 'ui', key: 'KeyR', pad: null, modes: ['free'] },
  { id: 'settings', group: 'ui', key: 'KeyO', pad: null },
  { id: 'controls', group: 'ui', key: 'KeyK', pad: null },
  { id: 'fullscreen', group: 'ui', key: 'F11', pad: 14 },
];
const BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

/** Teclas que o jogo reserva (não podem virar atalho). */
const RESERVED = new Set(['Escape', 'F12', 'MetaLeft', 'MetaRight', 'Tab']);

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'HOME'];

/** Nome curto de uma tecla (KeyboardEvent.code). */
export function keyName(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `NUM ${code.slice(6)}`;
  const named = {
    Escape: 'ESC', Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'CTRL', ControlRight: 'R CTRL',
    AltLeft: 'ALT', AltRight: 'ALT GR', Enter: 'ENTER', Backspace: 'BACKSPACE', CapsLock: 'CAPS',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  };
  return named[code] ?? code.toUpperCase();
}

/** Nome de um botão do controle. */
export const padName = (i) => (i === null || i === undefined ? '—' : PAD_NAMES[i] ?? `B${i}`);

class Bindings {
  constructor() {
    this.mode = 'free'; // o modo de jogo desta sessão (app.js)
    this.capturing = false; // a aba CONTROLES está esperando uma tecla: o jogo ignora tudo
    this.lastDevice = 'key'; // 'key' | 'pad': que nomes os textos mostram
    this.uiActive = false; // um menu/painel está aberto: o controle navega nele (ui/padNav.js), não anda
    this.keys = {};
    this.pads = {};
    this._listeners = new Set();
    this._load();
  }

  _load() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      /* sem armazenamento: padrões */
    }
    for (const a of ACTIONS) {
      this.keys[a.id] = saved.keys?.[a.id] !== undefined ? saved.keys[a.id] : a.key;
      this.pads[a.id] = saved.pads?.[a.id] !== undefined ? saved.pads[a.id] : a.pad;
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ keys: this.keys, pads: this.pads }));
    } catch {
      /* ignora */
    }
    for (const fn of this._listeners) fn();
  }

  /** Avisa quando algum atalho muda (textos que citam teclas se refazem). */
  onChange(fn) {
    this._listeners.add(fn);
  }

  /** A ação existe no modo de jogo desta sessão? */
  available(id, mode = this.mode) {
    const a = BY_ID[id];
    return !!a && (!a.modes || a.modes.includes(mode));
  }

  /** As ações deste modo, na ordem da lista. */
  list(mode = this.mode) {
    return ACTIONS.filter((a) => this.available(a.id, mode));
  }

  key(id) {
    return this.keys[id];
  }

  pad(id) {
    return this.pads[id];
  }

  /** A tecla deste evento é o atalho desta ação (e a ação existe neste modo)? */
  is(id, code) {
    if (this.capturing || !this.available(id)) return false;
    const k = this.keys[id];
    if (!k) return false;
    if (code === k) return true;
    // os dois lados de SHIFT/CTRL/ALT valem igual
    const side = /^(Shift|Control|Alt)(Left|Right)$/;
    return side.test(k) && side.test(code) && k.replace(side, '$1') === code.replace(side, '$1');
  }

  /** A ação está segurada (conjunto de códigos apertados)? */
  held(id, pressed) {
    if (this.capturing || !this.available(id)) return false;
    for (const c of pressed) if (this.is(id, c)) return true;
    return false;
  }

  /** Nome do atalho, no dispositivo usado por último (textos na tela). */
  label(id) {
    if (this.lastDevice === 'pad' && this.pads[id] !== null && this.pads[id] !== undefined) return padName(this.pads[id]);
    return keyName(this.keys[id]);
  }

  /** Quem (neste modo) já usa esta tecla / este botão, fora a própria ação. */
  _owners(kind, id, value) {
    const map = kind === 'key' ? this.keys : this.pads;
    const modes = BY_ID[id].modes ?? ['free', 'pilgrimage'];
    return ACTIONS.filter((a) => a.id !== id && map[a.id] === value && modes.some((m) => this.available(a.id, m))).map((a) => a.id);
  }

  canUseKey(code) {
    return !RESERVED.has(code);
  }

  /**
   * Troca o atalho de uma ação. Se outra ação do mesmo modo já usava, as duas
   * trocam entre si. Devolve as ações que trocaram (para avisar na aba).
   */
  set(kind, id, value) {
    if (kind === 'key' && BY_ID[id].fixedKey) return [];
    const map = kind === 'key' ? this.keys : this.pads;
    const old = map[id];
    const others = this._owners(kind, id, value);
    for (const o of others) map[o] = old ?? null;
    map[id] = value;
    this._save();
    return others;
  }

  /** Tira o botão/tecla de uma ação. */
  clear(kind, id) {
    (kind === 'key' ? this.keys : this.pads)[id] = null;
    this._save();
  }

  reset() {
    for (const a of ACTIONS) {
      this.keys[a.id] = a.key;
      this.pads[a.id] = a.pad;
    }
    this._save();
  }
}

export const bindings = new Bindings();
