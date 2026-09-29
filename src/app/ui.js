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
  document.querySelector('.gate-keys').dataset.i18nHtml = rules.fly ? 'gate.keys' : 'gate.keys.pilgrimage';
  document.getElementById('open-transport').style.display = rules.teleport ? '' : 'none';
  const gateMode = document.getElementById('gate-mode');
  const showMode = () => {
    gateMode.textContent = ctx.choosing ? '' : `${t(`mode.${ctx.mode}`)} · ${ctx.seed.toString(36).toUpperCase()}`;
  };
  applyDom();
  gate.addEventListener('click', () => {
    // primeira vez: antes de entrar, escolher o modo
    if (ctx.choosing) return openWorlds();
    audio.start();
    controls.lock();
  });
  controls.onLockChange = (locked) => {
    // com um painel aberto, a tela de entrada fica escondida atrás dele
    gate.classList.toggle('hidden', locked || settings.isOpen || transport.isOpen || worlds.isOpen || trail.open || ctx.reading?.isOpen);
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
  settings.onClose = () => gate.classList.remove('hidden');
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.stopPropagation(); // não entra no mundo ao clicar no botão
    openSettings();
  });
  function openSettings() {
    document.exitPointerLock?.();
    if (transport.isOpen) transport.close();
    if (worlds.isOpen) worlds.close();
    gate.classList.add('hidden');
    settings.open();
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
  transport.onClose = () => {
    if (!controls.locked) gate.classList.remove('hidden');
  };
  document.getElementById('open-transport').addEventListener('click', (e) => {
    e.stopPropagation();
    openTransport();
  });
  function openTransport() {
    document.exitPointerLock?.();
    if (settings.isOpen) settings.close();
    if (worlds.isOpen) worlds.close();
    gate.classList.add('hidden');
    transport.open();
  }

  /** Destinos já visitados por tipo (para "repetir" levar a outro exemplar). */
  const visited = new Map();
  /** Leva o observador ao exemplar mais próximo do tipo pedido. */
  function teleport(kind, label) {
    const g = world.toGlobal(camera.position, new THREE.Vector3());
    const recent = visited.get(kind) ?? new Set();
    const dest = findDestination(world.field, kind, g, recent, { colossus: (accept) => world.colossi.nearest(world.field, g, ctx.time, accept) });
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
    controls.lock();
    return dest;
  }

  // ─── mapa da travessia (M) ───
  function toggleMap() {
    if (trail.open) {
      trail.hide();
      if (!controls.locked) gate.classList.remove('hidden');
      return;
    }
    document.exitPointerLock?.();
    if (settings.isOpen) settings.close();
    if (transport.isOpen) transport.close();
    gate.classList.add('hidden');
    trail.setFound(ctx.travel.found());
    trail.show(ctx.travel.here());
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
    controls.setView(VIEWS.spawn);
    onWorldBuilt(ctx);
    applySettings(ctx.settings);
    showMode();
    ctx.travel.save();
  }

  // ─── controle de videogame ───
  controls.onPadStart = () => {
    // o controle não precisa (nem consegue) travar o mouse: entra direto
    audio.start();
    if (ctx.choosing) return openWorlds();
    if (!settings.isOpen && !transport.isOpen && !worlds.isOpen) gate.classList.add('hidden');
    hud.push(t('hud.gamepad'));
  };
  controls.onPadButton = (name) => {
    if (name === 'photo') photo();
    if (name === 'hud' && rules.hud) hud.toggle();
    if (name === 'lantern') ctx.carried.toggleLantern();
    if (name === 'sensor') ctx.carried.cycleSensor();
    if (name === 'use') ctx.reading.tryUse() || ctx.carried.togglePlug();
  };

  // ─── teclas globais ───
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyR' && rules.regenerate && !ctx.choosing) regenerate();
    if (e.code === 'KeyH' && rules.hud) hud.toggle();
    if (e.code === 'KeyO') openSettings();
    if (e.code === 'KeyT' && rules.teleport) openTransport();
    if (e.code === 'F2') photo();
    if (e.code === 'KeyM') toggleMap();
    if (e.code === 'Escape' && trail.open) toggleMap();
    // E: ler o terminal em frente (ou fechar a leitura); senão, a tomada
    if (e.code === 'KeyE' && (controls.locked || ctx.reading.isOpen)) ctx.reading.tryUse() || ctx.carried.togglePlug();
    if (e.code === 'Escape' && ctx.reading.isOpen) ctx.reading.close();
  });

  // primeira vez: o painel de mundos já aberto
  if (ctx.choosing) openWorlds();

  return { teleport, regenerate, toggleMap, photo };
}
