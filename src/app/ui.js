// ─────────────────────────────────────────────────────────────────────────────
//  Interface: tela de entrada, painéis (configurações, transporte), mapa,
//  teclas globais, controle de videogame, teleporte e "novo mundo".
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { VIEWS } from '../world/world.js';
import { createAlphabet, drawGlyph } from '../ui/glyphs.js';
import { SettingsPanel } from '../ui/settings.js';
import { TransportPanel } from '../ui/transport.js';
import { findDestination } from '../world/teleport.js';
import { takePhoto, onWorldBuilt, resize } from './render.js';

export function createUI(ctx) {
  const { controls, audio, hud, world, camera, renderer, scenePass, reflection } = ctx;
  const gate = document.getElementById('gate');
  const gateSub = document.querySelector('.gate-sub');
  const trail = ctx.travel.trail;

  // ─── tela de entrada ───
  drawGateGlyphs(ctx.seed);
  gate.addEventListener('click', () => {
    audio.start();
    controls.lock();
  });
  controls.onLockChange = (locked) => {
    // com um painel aberto, a tela de entrada fica escondida atrás dele
    gate.classList.toggle('hidden', locked || settings.isOpen || transport.isOpen || trail.open);
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
  if (ctx.resumed) gateSub.textContent = 'clique para continuar a travessia';

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
    gate.classList.add('hidden');
    settings.open();
  }

  function applySettings(s, key) {
    const is = (k) => !key || key === k;
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
    const km = dest.feet.distanceTo(g) / 1000;
    hud.push(`TRANSFERÊNCIA :: ${label.toUpperCase()} · ${km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km'}`);
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
    trail.show(ctx.travel.here());
  }

  // ─── foto (F2) ───
  function photo() {
    takePhoto(ctx);
    audio.shutter();
    ctx.travel.photographed();
  }

  // ─── novo mundo (R ou o botão) ───
  function regenerate() {
    ctx.seed = Math.floor(Math.random() * 2 ** 31);
    world.build(ctx.seed);
    world.setView({ renderDistance: ctx.settings.renderDistance, fog: ctx.settings.fog });
    hud.setSeed(ctx.seed);
    ctx.travel.newWorld();
    ctx.sound.wire();
    controls.setView(VIEWS.spawn);
    onWorldBuilt(ctx);
    applySettings(ctx.settings);
  }
  document.getElementById('new-world').addEventListener('click', (e) => {
    e.stopPropagation();
    regenerate();
    ctx.travel.save();
    gateSub.textContent = 'clique para entrar na Cidade';
  });

  // ─── controle de videogame ───
  controls.onPadStart = () => {
    // o controle não precisa (nem consegue) travar o mouse: entra direto
    audio.start();
    if (!settings.isOpen && !transport.isOpen) gate.classList.add('hidden');
    hud.push('CONTROLE DETECTADO :: entrada aceita');
  };
  controls.onPadButton = (name) => {
    if (name === 'photo') photo();
    if (name === 'hud') hud.toggle();
  };

  // ─── teclas globais ───
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyR') regenerate();
    if (e.code === 'KeyH') hud.toggle();
    if (e.code === 'KeyO') openSettings();
    if (e.code === 'KeyT') openTransport();
    if (e.code === 'F2') photo();
    if (e.code === 'KeyM') toggleMap();
    if (e.code === 'Escape' && trail.open) toggleMap();
  });

  return { teleport, regenerate, toggleMap, photo };
}

function drawGateGlyphs(seed) {
  const c = document.getElementById('gate-glyphs');
  const ctx2 = c.getContext('2d');
  const alphabet = createAlphabet(seed ^ 0x5eed);
  c.width = c.clientWidth * 2;
  c.height = c.clientHeight * 2;
  ctx2.scale(2, 2);
  ctx2.lineWidth = 1.4;
  const n = Math.floor(c.clientWidth / 22);
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.1) continue;
    ctx2.strokeStyle = ctx2.fillStyle = Math.random() < 0.08 ? 'rgba(196,110,62,0.8)' : 'rgba(178,188,172,0.7)';
    drawGlyph(ctx2, alphabet[Math.floor(Math.random() * alphabet.length)], i * 22 + 4, 16, 12, 24);
  }
}
