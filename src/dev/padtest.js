// ─────────────────────────────────────────────────────────────────────────────
//  Teste do controle (`npm run check:pad`): um controle FALSO (navigator
//  .getGamepads trocado) joga sozinho, sem tocar em teclado nem mouse, e
//  confere que tudo o que o teclado faz dá para fazer só com ele — a regra
//  absoluta do projeto (ver ui/padNav.js).
//
//  Cada passo vira uma linha "CHECK:{json}" (o mesmo relatório do check).
// ─────────────────────────────────────────────────────────────────────────────
import { bindings } from '../controls/bindings.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = 0;
const B = 1;
const RB = 5;
const RT = 7;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

export async function runPadTest(ctx) {
  const report = (kind, ok, why) => console.warn('CHECK:' + JSON.stringify({ kind, ok: !!ok, why: ok ? undefined : why }));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));

  // o controle falso
  const pad = {
    id: 'fake',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  navigator.getGamepads = () => [pad];
  const set = (i, on) => {
    pad.buttons[i] = { pressed: on, value: on ? 1 : 0 };
  };
  const press = async (i, hold = 90) => {
    set(i, true);
    await sleep(hold);
    set(i, false);
    await sleep(220);
  };
  const $ = (s) => document.querySelector(s);
  const shown = (s) => {
    const el = typeof s === 'string' ? $(s) : s;
    return !!el && el.getClientRects().length > 0;
  };
  const focused = () => $('.pad-focus');
  /** Anda com o direcional até o foco cair em `sel`: sobe ao topo e varre linha por linha. */
  async function focusOn(sel) {
    const hit = () => !!focused()?.matches(sel);
    for (let k = 0; k < 10 && !hit(); k++) await press(UP);
    for (let row = 0; row < 14 && !hit(); row++) {
      for (let k = 0; k < 5 && !hit(); k++) await press(LEFT);
      for (let k = 0; k < 8 && !hit(); k++) await press(RIGHT);
      if (!hit()) await press(DOWN);
    }
    return hit();
  }
  const gate = $('#gate');

  await sleep(4000);
  // 0. se é a primeira vez, o painel MUNDOS: A no primeiro botão (um mundo novo)
  if (shown('#worlds')) {
    await press(A);
    report('pad:mundos', true);
    await sleep(3000);
  }
  // 1. tela de entrada: o foco começa em "clique para entrar" (aparece ao usar o controle); A entra
  await press(UP);
  report('pad:foco-inicial', focused()?.classList.contains('gate-sub'), `foco em ${focused()?.className}`);
  await press(A);
  report('pad:entrar', gate.classList.contains('hidden'), 'a tela de entrada não sumiu');
  // 2. andar (analógico) e pular (A) — o corpo reage
  const p0 = ctx.camera.position.clone();
  pad.axes[1] = -1;
  await sleep(1200);
  pad.axes[1] = 0;
  report('pad:andar', ctx.camera.position.distanceTo(p0) > 1, 'o analógico não moveu o corpo');
  // 3. START: a tela de entrada volta
  await press(bindings.pad('menu'));
  report('pad:menu', !gate.classList.contains('hidden'), 'START não abriu a tela de entrada');
  // 4. configurações: foco no botão, A abre; ← → mudam um valor; B fecha
  const okSet = await focusOn('#open-settings');
  report('pad:foco-config', okSet, 'não chegou ao botão CONFIGURAÇÕES');
  await press(A);
  report('pad:config-abre', shown('#settings'), 'A não abriu as configurações');
  await press(DOWN); // do idioma para a distância de visão
  const before = ctx.settings.renderDistance;
  await press(RIGHT);
  report('pad:config-valor', ctx.settings.renderDistance !== before, `→ não mudou a distância (${before})`);
  await press(LEFT);
  await press(B);
  report('pad:config-fecha', !shown('#settings') && !gate.classList.contains('hidden'), 'B não voltou para a tela de entrada');
  // 5. aba CONTROLES: abre, troca o botão da foto (A na célula, depois RB... não: LB), fecha
  report('pad:foco-controles', await focusOn('#open-controls'), 'não chegou ao botão CONTROLES');
  await press(A);
  report('pad:controles-abre', shown('#controls'), 'A não abriu a aba CONTROLES');
  const cell = $('#controls [data-kind="pad"][data-bind="photo"]');
  if (cell) {
    // foco na célula da foto e trocar para LB (4)
    // para a coluna do controle, depois para baixo até a linha da foto
    for (let k = 0; k < 3; k++) await press(RIGHT);
    const onCell = () => focused()?.dataset.bind === 'photo' && focused()?.dataset.kind === 'pad';
    for (let k = 0; k < 30 && !onCell(); k++) await press(DOWN);
    const at = focused()?.dataset.bind + '/' + focused()?.dataset.kind;
    await press(A);
    await sleep(200);
    const waiting = !!document.querySelector('#controls .waiting');
    await press(4); // LB
    await sleep(300);
    report('pad:rebind', bindings.pad('photo') === 4, `a foto ficou em ${bindings.pad('photo')} (foco ${at}, esperando ${waiting})`);
    bindings.reset();
  } else report('pad:rebind', false, 'sem célula da foto');
  await press(B);
  report('pad:controles-fecha', !shown('#controls'), 'B não fechou a aba CONTROLES');
  // 6. abas do diário: RB troca
  const tab0 = $('.archive-tabs .on')?.dataset.tab;
  await press(RB);
  await sleep(200);
  report('pad:abas', $('.archive-tabs .on')?.dataset.tab !== tab0, 'RB não trocou a aba do diário');
  // 7. transporte (modo Livre): A num destino leva e volta ao jogo
  if (ctx.rules.teleport) {
    report('pad:foco-transporte', await focusOn('#open-transport'), 'não chegou ao botão TRANSPORTE');
    await press(A);
    const dest = await focusOn('#transport [data-kind="ponte"]');
    await press(A);
    await sleep(600);
    report('pad:transporte', dest && !shown('#transport') && gate.classList.contains('hidden'), 'não transportou / a tela de entrada ficou');
  } else {
    await press(bindings.pad('menu'));
  }
  // 8. mapa: SELECT abre, RT aproxima, B fecha
  await press(bindings.pad('map'));
  report('pad:mapa-abre', ctx.ui && shown('#trailmap'), 'o botão do mapa não abriu o mapa');
  const z0 = ctx.travel.trail.zoom;
  set(RT, true);
  await sleep(500);
  set(RT, false);
  report('pad:mapa-zoom', ctx.travel.trail.zoom !== z0, 'RT não aproximou');
  await press(B);
  report('pad:mapa-fecha', !shown('#trailmap'), 'B não fechou o mapa');
  // 9. tela cheia pelo controle
  const fs0 = window.outerWidth;
  await press(bindings.pad('fullscreen'));
  await sleep(800);
  const fs1 = window.outerWidth;
  await press(bindings.pad('fullscreen'));
  await sleep(600);
  report('pad:tela-cheia', fs1 !== fs0, `a janela não mudou de tamanho (${fs0} → ${fs1}; ponte: ${!!window.cybercosmic}; botão ${bindings.pad('fullscreen')})`);
  // 10. ler um terminal: Y abre, o direcional rola, B fecha (e volta ao jogo)
  if (ctx.ui.teleport('terminal', 'terminal')) {
    await sleep(3500);
    await press(bindings.pad('use'));
    await sleep(400);
    report('pad:ler-abre', shown('#reader'), 'Y diante do terminal não abriu a leitura');
    await press(DOWN);
    await press(B);
    report('pad:ler-fecha', !shown('#reader') && gate.classList.contains('hidden'), 'B não fechou a leitura / não voltou ao jogo');
  } else report('pad:ler-abre', false, 'sem terminal por perto');
  // 11. Peregrinação: X acende e apaga a lanterna
  if (ctx.rules.resources) {
    const on0 = ctx.carried.lanternOn;
    await press(bindings.pad('lantern'));
    const on1 = ctx.carried.lanternOn;
    await press(bindings.pad('lantern'));
    report('pad:lanterna', on1 !== on0 && ctx.carried.lanternOn === on0, 'X não trocou a lanterna');
  }
  // 12. painel MUNDOS pela tela de entrada: abre e B fecha
  await press(bindings.pad('menu'));
  report('pad:foco-mundos', await focusOn('#open-worlds'), 'não chegou ao botão MUNDOS');
  await press(A);
  report('pad:mundos-abre', shown('#worlds'), 'A não abriu MUNDOS');
  await press(B);
  report('pad:mundos-fecha', !shown('#worlds') && !gate.classList.contains('hidden'), 'B não voltou para a tela de entrada');
  // 13. e de volta ao jogo com START
  await press(bindings.pad('menu'));
  report('pad:voltar', gate.classList.contains('hidden'), 'START na tela de entrada não voltou ao jogo');
  console.warn('CHECK:DONE');
}
