// ─────────────────────────────────────────────────────────────────────────────
//  CYBERCOSMIC — ponto de entrada do renderer: monta as peças e roda o loop.
//
//  As peças compartilham um único objeto de contexto (ctx):
//    app/render.js   renderizador, pós-processamento, reflexo, foto
//    app/body.js     o corpo: passos, água, queda, vagões, vibração
//    app/sound.js    sons e avisos dos acontecimentos do mundo
//    app/travel.js   salvamento, diário e mapa da travessia
//    app/ui.js       tela de entrada, painéis, teclas, teleporte, novo mundo
//    app/dev.js      flags de desenvolvimento e o teste de fumaça
//
//  Ordem de um frame:
//    1. controles movem a câmera; o corpo sente (vento, água, vagão)
//    2. origem flutuante (reindexa o mundo se longe demais do 0,0,0 da cena)
//    3. streaming de chunks, sistemas do mundo, luzes, sons
//    4. máscara das silhuetas + reflexo → cena (SSAO + TAA) → bloom → filme
//    5. interface alienígena + parâmetros do áudio
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createSharedUniforms, createDust } from './shaders/materials.js';
import { World, VIEWS } from './world/world.js';
import { NoclipControls } from './controls/noclip.js';
import { Walker } from './controls/walker.js';
import { CollisionWorld } from './world/collision.js';
import { AudioEngine } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { t } from './i18n/index.js';
import { loadSettings } from './ui/settings.js';
import { loadSave } from './ui/journey.js';
import { createRenderer, setupRender, renderFrame } from './app/render.js';
import { createBody } from './app/body.js';
import { createWorldSound } from './app/sound.js';
import { createTravel } from './app/travel.js';
import { createUI } from './app/ui.js';
import { setupDev } from './app/dev.js';

/** A névoa de altura é relativa ao observador: sempre mais densa abaixo. */
const FOG_ABOVE_EYE = 40;
/** Tempo em queda livre até o sistema "realocar" o observador (s). */
const FALL_RESCUE_AFTER = 5.5;

const params = new URLSearchParams(location.search);
// só o `npm start` normal (sem nenhuma flag) lê e grava a travessia — sessões de
// teste/captura não tocam no seu salvamento nem no seu diário
const persist = [...params.keys()].every((k) => k === 'autostart');
const saved = persist ? loadSave() : null;

const ctx = {
  params,
  persist,
  autostart: params.get('autostart') === '1',
  resumed: !!saved,
  seed: params.get('seed') ? parseInt(params.get('seed'), 36) : saved?.seed ?? Math.floor(Math.random() * 2 ** 31),
  time: 0,
  settings: loadSettings(),
};
// flags de desenvolvimento (--fog / --dist): valem só para esta sessão
if (params.get('fog') !== null) ctx.settings.fog = Number(params.get('fog'));
if (params.get('dist') !== null) ctx.settings.renderDistance = Number(params.get('dist'));

// ─── cena, mundo, câmera ────────────────────────────────────────────────────
ctx.canvas = document.getElementById('scene');
ctx.renderer = createRenderer(ctx.canvas);
ctx.scene = new THREE.Scene();
ctx.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 12000);
ctx.shared = createSharedUniforms();
ctx.world = new World(ctx.scene, ctx.shared);
ctx.world.build(ctx.seed);
ctx.dust = createDust();
ctx.scene.add(ctx.dust);

// ─── corpo e controles ──────────────────────────────────────────────────────
const controls = (ctx.controls = new NoclipControls(ctx.camera, ctx.canvas));
controls.walker = new Walker(new CollisionWorld(ctx.world));
controls.setView(VIEWS[params.get('view')] ?? VIEWS.spawn);
if (params.get('pos')) {
  const [x, y, z, yaw = 0, pitch = 0] = params.get('pos').split(',').map(Number);
  controls.setView({ pos: new THREE.Vector3(x, y, z), yaw, pitch, scale: 1 });
}
if (params.get('autopilot')) {
  controls.autopilot = true;
  controls.autopilotBoost = Number(params.get('autopilot')) || 1;
  controls.setMode('fly');
}
if (params.get('mode') === 'fly') controls.setMode('fly');
if (saved) {
  controls.setView({ pos: new THREE.Vector3(...saved.pos), yaw: saved.yaw, pitch: saved.pitch, scale: 1 });
  if (saved.mode === 'fly') controls.setMode('fly');
}

ctx.audio = new AudioEngine();
ctx.hud = new HUD(document.getElementById('hud'));

// ─── sons posicionados: panorâmica (−1..1) e distância de um ponto GLOBAL ─────
const _rel = new THREE.Vector3();
const _right = new THREE.Vector3();
const _g = new THREE.Vector3();
ctx.placeOf = (x, y, z) => {
  const g = ctx.world.toGlobal(ctx.camera.position, _g);
  _rel.set(x - g.x, y - g.y, z - g.z);
  const dist = _rel.length();
  _right.set(1, 0, 0).applyQuaternion(ctx.camera.quaternion);
  return [dist > 0 ? _rel.dot(_right) / dist : 0, dist];
};

// ─── peças ──────────────────────────────────────────────────────────────────
setupRender(ctx);
ctx.travel = createTravel(ctx);
ctx.body = createBody(ctx);
ctx.sound = createWorldSound(ctx);
ctx.ui = createUI(ctx);
setupDev(ctx);

// ─── loop ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const globalPos = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const { renderer, camera, world, shared, dust, audio, hud } = ctx;
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  ctx.time += dt;
  const time = ctx.time;

  // 1. movimento e o que o corpo sente
  controls.update(dt, time);
  ctx.body.update(dt);
  ctx.travel.update(dt);
  camera.updateMatrixWorld();

  // 2. origem flutuante
  const rebased = world.maybeRebase(camera);
  if (rebased) ctx.scenePass.shiftOrigin(rebased.delta);

  // 3. mundo
  shared.uTime.value = time;
  shared.uFogBase.value = camera.position.y + FOG_ABOVE_EYE;
  ctx.signal.uniforms.uTime.value = time;
  dust.material.uniforms.uTime.value = time;
  dust.material.uniforms.uCam.value.copy(camera.position);
  world.lights.close = controls.mode === 'walk';
  world.update(time, dt, camera, controls.scale);
  ctx.reflection.update(world.field, world.toGlobal(camera.position, globalPos), dt);
  ctx.sound.update(dt);

  // caiu no abismo por tempo demais: realoca (só se ligado nas configurações)
  if (ctx.settings.fallRescue && controls.mode === 'walk' && controls.walker.airTime > FALL_RESCUE_AFTER) {
    const landing = world.findLanding(camera.position);
    if (landing) {
      controls.placeFeet(landing);
      audio.reindex();
      hud.push(t('hud.rescued'));
    } else {
      controls.walker.airTime = 0;
    }
  }

  // 4. render
  renderFrame(ctx, dt);

  // 5. interface + áudio
  hud.update(dt, time, {
    pos: world.toGlobal(camera.position, globalPos),
    region: world.regionAt(camera.position),
    seed: ctx.seed,
  });
  audio.update({ speed: controls.speed });
}
frame();
