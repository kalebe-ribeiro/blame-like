// ─────────────────────────────────────────────────────────────────────────────
//  Interface: tela de entrada, painéis (mundos, configurações, transporte),
//  mapa, teclas globais, controle de videogame, teleporte e "novo mundo".
//  O que cada modo de jogo permite vem de ctx.rules (app/modes.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { VIEWS } from '../world/world.js';
import { t, setLang, applyDom, fmtDist } from '../i18n/index.js';
import { SettingsPanel } from '../ui/settings.js';
import { TransportPanel } from '../ui/transport.js';
import { WorldsPanel } from '../ui/worlds.js';
import { ControlsPanel } from '../ui/controlsPanel.js';
import { bindings } from '../controls/bindings.js';
import { createPadNav } from '../ui/padNav.js';
import { storeProfile, newSlot, storeSlot } from './saves.js';
import { findDestination } from '../world/teleport.js';
import { takePhoto, onWorldBuilt, resize } from './render.js';

export function createUI(ctx) {
  const { controls, audio, hud, world, camera, renderer, scenePass, reflection } = ctx;
  const gate = document.getElementById('gate');
  const gateSub = document.querySelector('.gate-sub');
  const trail = ctx.travel.trail;
  const rules = ctx.rules;

  // ─── tela de entrada ───
  setLang(ctx.settings.lang);
  hud.setEnabled(rules.hud);
  document.getElementById('open-transport').style.display = rules.teleport ? '' : 'none';
  const gateMode = document.getElementById('gate-mode');
  const showMode = () => {
    gateMode.textContent = ctx.choosing ? '' : `${t(`mode.${ctx.mode}`)} · ${ctx.seed.toString(36).toUpperCase()}`;
  };
  applyDom();
  gate.addEventListener('click', () => enter());
  // um painel aberto no meio do jogo pelo controle, ao fechar, volta ao jogo (não à tela de entrada)
  let fromGame = false;
  const noteFrom = () => {
    fromGame = gate.classList.contains('hidden') && !settings?.isOpen && !transport?.isOpen && !worlds?.isOpen && !controlsPanel?.isOpen && !trail.open;
  };
  function panelClosed() {
    if (fromGame && bindings.lastDevice === 'pad') gate.classList.add('hidden');
    else if (!controls.locked) gate.classList.remove('hidden');
    fromGame = false;
  }
  /** Entrar no mundo (clique, ou A no controle sobre "clique para entrar"). */
  function enter() {
    // primeira vez: antes de entrar, escolher o modo
    if (ctx.choosing) return openWorlds();
    audio.start();
    // o controle não precisa (nem consegue) travar o mouse: só some a tela de entrada
    if (bindings.lastDevice === 'pad') gate.classList.add('hidden');
    else controls.lock();
  }
  /** A tela de entrada por cima do jogo (START no controle; ESC no teclado solta o mouse e dá no mesmo). */
  function showGate() {
    if (controls.locked) return document.exitPointerLock?.();
    gate.classList.remove('hidden');
    ctx.travel.renderDiary();
    ctx.travel.save();
  }
  function toggleFullscreen() {
    if (window.cybercosmic?.toggleFullscreen) return window.cybercosmic.toggleFullscreen();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  controls.onLockChange = (locked) => {
    // com um painel aberto, a tela de entrada fica escondida atrás dele
    gate.classList.toggle('hidden', locked || settings.isOpen || transport.isOpen || worlds.isOpen || controlsPanel.isOpen || trail.open || ctx.reading?.isOpen);
    if (!locked) {
      ctx.travel.renderDiary();
      ctx.travel.save();
    }
  };
  if (ctx.autostart) {
    gate.style.display = 'none';
    audio.start();
  }
  ctx.travel.renderDiary();
  gateSub.dataset.i18n = ctx.choosing ? 'gate.choose' : ctx.resumed ? 'gate.continue' : 'gate.enter';
  applyDom(gate);
  showMode();

  // ─── mundos: escolher o modo, continuar ou começar um mundo (recarrega o jogo) ───
  const worlds = new WorldsPanel({
    current: ctx.choosing ? null : ctx.mode,
    onContinue: (mode) => switchWorld(mode, null),
    onNew: (mode) => switchWorld(mode, newSlot(mode, Math.floor(Math.random() * 2 ** 31))),
    // um código de seed compartilhado (app/share.js): a mesma Cidade, com as marcas de quem mandou
    onImport: ({ seed, mode, marks }) => {
      const fresh = newSlot(mode, seed);
      fresh.marks = marks;
      switchWorld(mode, fresh);
    },
    liveSlot: () => {
      ctx.travel.save();
      return ctx.slot;
    },
  });
  worlds.onClose = () => gate.classList.remove('hidden');
  document.getElementById('open-worlds').addEventListener('click', (e) => {
    e.stopPropagation();
    openWorlds();
  });
  function openWorlds() {
    document.exitPointerLock?.();
    if (settings.isOpen) settings.close();
    if (transport.isOpen) transport.close();
    gate.classList.add('hidden');
    worlds.open();
  }
  /** Abre o mundo salvo do modo (ou o mundo novo dado). O jogo recarrega inteiro. */
  function switchWorld(mode, fresh) {
    ctx.travel.save(); // guarda o mundo de agora antes de sair dele
    ctx.saving = false; // e nada mais grava por cima durante a troca
    if (ctx.persist) {
      if (fresh) storeSlot(fresh);
      ctx.profile.activeMode = mode;
      storeProfile(ctx.profile);
      location.reload();
    } else {
      // sessão de desenvolvimento: troca pela query (--game)
      const q = new URLSearchParams(location.search);
      q.set('game', mode);
      if (fresh) q.delete('seed');
      location.search = q.toString();
    }
  }

  // ─── configurações ───
  const settings = new SettingsPanel(ctx.settings, (s, key) => applySettings(s, key));
  settings.onClose = () => panelClosed();
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.stopPropagation(); // não entra no mundo ao clicar no botão
    openSettings();
  });
  function openSettings() {
    noteFrom();
    document.exitPointerLock?.();
    if (transport.isOpen) transport.close();
    if (worlds.isOpen) worlds.close();
    if (controlsPanel.isOpen) controlsPanel.close();
    gate.classList.add('hidden');
    settings.open();
  }

  // ─── controles: todos os atalhos, trocáveis (ui/controlsPanel.js) ───
  const controlsPanel = new ControlsPanel();
  controlsPanel.onClose = () => panelClosed();
  document.getElementById('open-controls').addEventListener('click', (e) => {
    e.stopPropagation();
    openControls();
  });
  function openControls() {
    if (controlsPanel.isOpen) return controlsPanel.close();
    noteFrom();
    document.exitPointerLock?.();
    if (settings.isOpen) settings.close();
    if (transport.isOpen) transport.close();
    if (worlds.isOpen) worlds.close();
    if (trail.open) trail.hide();
    gate.classList.add('hidden');
    controlsPanel.open();
  }

  function applySettings(s, key) {
    const is = (k) => !key || key === k;
    if (is('lang')) {
      setLang(s.lang);
      ctx.travel.renderDiary();
      showMode();
    }
    if (is('renderDistance') || is('fog')) world.setView({ renderDistance: s.renderDistance, fog: s.fog });
    if (is('fov')) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    if (is('sensitivity')) controls.sensitivity = 0.0021 * s.sensitivity;
    if (is('outages')) world.outages.enabled = s.outages;
    if (is('collapses')) world.collapses.enabled = s.collapses;
    if (is('ssao')) scenePass.aoEnabled = s.ssao;
    if (is('taa')) scenePass.taaEnabled = s.taa;
    if (is('shafts')) scenePass.shaftsEnabled = s.shafts;
    if (is('reflections')) reflection.enabled = s.reflections;
    if (is('music')) audio.music = s.music;
    if (is('headBob')) controls.walker.bobScale = s.headBob ? 1 : 0;
    if (is('motionFx')) controls.walker.dipScale = s.motionFx ? 1 : 0;
    if (is('invertY')) controls.invertY = s.invertY;
    if (is('resolution')) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, s.resolution));
      resize(ctx);
    }
  }
  applySettings(ctx.settings);

  // ─── transporte ───
  const transport = new TransportPanel((kind, label) => teleport(kind, label));
  let transported = false; // transportou pelo controle: volta direto ao jogo, sem a tela de entrada
  transport.onClose = () => {
    if (transported) {
      gate.classList.add('hidden');
      fromGame = false;
    } else panelClosed();
    transported = false;
  };
  document.getElementById('open-transport').addEventListener('click', (e) => {
    e.stopPropagation();
    openTransport();
  });
  function openTransport() {
    noteFrom();
    document.exitPointerLock?.();
    if (settings.isOpen) settings.close();
    if (worlds.isOpen) worlds.close();
    gate.classList.add('hidden');
    transport.open();
  }

  /** Destinos já visitados por tipo (para "repetir" levar a outro exemplar). */
  const visited = new Map();
  /** Leva o observador ao exemplar mais próximo do tipo pedido. */
  function teleport(kind, label, extra = {}) {
    const g = world.toGlobal(camera.position, new THREE.Vector3());
    const recent = visited.get(kind) ?? new Set();
    const dest = findDestination(world.field, kind, g, recent, { ...extra, colossus: (accept) => world.colossi.nearest(world.field, g, ctx.time, accept) });
    if (!dest) return false;
    recent.add(dest.id);
    if (recent.size > 8) recent.delete(recent.values().next().value);
    visited.set(kind, recent);
    controls.autopilot = false;
    if (dest.fly) controls.setMode('fly');
    const eye = dest.feet.clone().sub(world.origin);
    eye.y += 1.7;
    controls.setView({ pos: eye, yaw: dest.yaw, pitch: dest.pitch, scale: 1 });
    world.bus.emit('player:transfer', { kind, from: g, to: dest.feet });
    hud.push(t('hud.transfer', { label: label.toUpperCase(), dist: fmtDist(dest.feet.distanceTo(g)) }));
    audio.start();
    audio.transfer(1);
    if (bindings.lastDevice === 'pad') transported = transport.isOpen;
    else controls.lock();
    return dest;
  }

  // ─── mapa da travessia (M) ───
  function toggleMap() {
    if (trail.open) {
      trail.hide();
      panelClosed();
      return;
    }
    noteFrom();
    document.exitPointerLock?.();
    if (settings.isOpen) settings.close();
    if (transport.isOpen) transport.close();
    gate.classList.add('hidden');
    trail.setFound(ctx.travel.found());
    // para onde você olha agora (no plano): o ponteiro do mapa
    const look = camera.getWorldDirection(new THREE.Vector3());
    look.y = 0;
    trail.show(ctx.travel.here(), look.lengthSq() > 1e-6 ? look.normalize() : null);
  }

  // ─── foto (F2) ───
  function photo() {
    takePhoto(ctx);
    audio.shutter();
    world.bus.emit('player:photo');
  }

  // ─── novo mundo (R ou o botão) ───
  function regenerate() {
    ctx.seed = Math.floor(Math.random() * 2 ** 31);
    world.build(ctx.seed);
    world.setView({ renderDistance: ctx.settings.renderDistance, fog: ctx.settings.fog });
    ctx.travel.newWorld();
    world.field.restored.clear(); // o build leu os setores religados do mundo anterior
    ctx.marks.reset();
    controls.setView(VIEWS.spawn);
    onWorldBuilt(ctx);
    applySettings(ctx.settings);
    showMode();
    ctx.travel.save();
  }

  // ─── controle de videogame ───
  controls.onPadStart = () => {
    audio.start();
    hud.push(t('hud.gamepad'));
  };
  // ─── menus pelo controle (REGRA: tudo que o teclado faz, o controle faz — ui/padNav.js) ───
  // camadas de cima para baixo: a primeira aberta recebe o controle
  createPadNav({
    layers: () => [
      { el: controlsPanel.el, back: () => controlsPanel.close() },
      { el: settings.el, back: () => settings.close() },
      { el: transport.el, back: () => transport.close() },
      { el: worlds.el, back: () => worlds.current && worlds.close() },
      { el: ctx.people.el, back: () => ctx.people.close() },
      { el: document.getElementById('reader'), back: () => ctx.reading.close(), scroll: (px) => ctx.reading.scrollPx(px), lines: true },
      { el: trail.el, map: trail, back: () => toggleMap() },
      { el: gate, back: () => {}, menu: () => enter() },
    ],
    onMenu: () => showGate(),
  });
  // o mesmo que as teclas: controls/noclip.js chama com o nome da ação (bindings.js)
  controls.onPadButton = (name) => {
    if (name === 'photo') photo();
    if (name === 'mark') ctx.marks.toggle();
    if (name === 'hud' && rules.hud) hud.toggle();
    if (name === 'lantern' || name === 'torch') ctx.carried.toggleLantern();
    if (name === 'sensor') ctx.carried.cycleSensor();
    if (name === 'use') ctx.people.tryUse() || ctx.reading.tryUse() || ctx.power.tryUse() || ctx.carried.togglePlug();
    if (name === 'map') toggleMap();
    if (name === 'transport' && rules.teleport) openTransport();
    if (name === 'regenerate' && rules.regenerate && !ctx.choosing) regenerate();
    if (name === 'settings') openSettings();
    if (name === 'controls') openControls();
    if (name === 'fullscreen') toggleFullscreen();
  };

  // ─── teclas globais (atalhos em controls/bindings.js; trocáveis na aba CONTROLES) ───
  document.addEventListener('keydown', (e) => {
    if (e.repeat || bindings.capturing) return;
    const is = (id) => bindings.is(id, e.code);
    if (is('regenerate') && rules.regenerate && !ctx.choosing) regenerate();
    if (is('hud') && rules.hud) hud.toggle();
    if (is('settings')) openSettings();
    if (is('controls')) openControls();
    if (is('fullscreen')) {
      e.preventDefault();
      toggleFullscreen();
    }
    if (is('transport') && rules.teleport) openTransport();
    if (is('photo')) photo();
    if (is('mark') && controls.locked) ctx.marks.toggle();
    if (is('map')) toggleMap();
    if (e.code === 'Escape' && trail.open) toggleMap();
    // usar: ler o terminal em frente (ou fechar a leitura); senão, a tomada
    if (is('use') && (controls.locked || ctx.reading.isOpen || ctx.people.isOpen)) ctx.people.tryUse() || ctx.reading.tryUse() || ctx.power.tryUse() || ctx.carried.togglePlug();
    if (e.code === 'Escape' && ctx.reading.isOpen) ctx.reading.close();
    if (e.code === 'Escape' && ctx.people.isOpen) ctx.people.close();
  });

  // primeira vez: o painel de mundos já aberto
  if (ctx.choosing) openWorlds();

  return { teleport, regenerate, toggleMap, photo, openControls };
}
