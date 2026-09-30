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
import { loadProfile, storeProfile, migrateLegacy, loadSlot, newSlot, storeSlot, WorldState } from './app/saves.js';
import { Lexicon } from './lang/lexicon.js';
import { rulesFor } from './app/modes.js';
import { createPlayerState } from './app/player.js';
import { createRenderer, setupRender, renderFrame } from './app/render.js';
import { createBody } from './app/body.js';
import { createWorldSound } from './app/sound.js';
import { createTravel } from './app/travel.js';
import { createUI } from './app/ui.js';
import { setupDev } from './app/dev.js';
import { createWake } from './app/wake.js';
import { createCarried } from './app/carried.js';
import { createReading } from './app/reading.js';
import { createLeads } from './app/leads.js';
import { bindings } from './controls/bindings.js';
import { startPlace } from './lang/leads.js';

/** A névoa de altura é relativa ao observador: sempre mais densa abaixo. */
const FOG_ABOVE_EYE = 40;
/** Tempo em queda livre até o sistema "realocar" o observador (s). */
const FALL_RESCUE_AFTER = 5.5;
/** Peregrinação: caindo no vazio há tanto tempo, a vista escurece ainda no ar (s). */
const VOID_FAINT_AFTER = 6;

const params = new URLSearchParams(location.search);
// só o `npm start` normal (sem nenhuma flag) lê e grava a travessia — sessões de
// teste/captura não tocam no seu salvamento nem no seu diário
const persist = [...params.keys()].every((k) => k === 'autostart');
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

// ─── perfil, modo de jogo e o mundo salvo daquele modo (app/saves.js) ───────
const profile = loadProfile();
if (persist) migrateLegacy(profile);
// --game=free|pilgrimage nas sessões de desenvolvimento; senão, o modo ativo do perfil
const chosenMode = persist ? profile.activeMode : params.get('game') ?? 'free';
// primeira vez: nenhum modo escolhido — a tela de entrada pede a escolha; até
// lá um mundo Livre aparece por trás, sem ser salvo
const choosing = persist && !chosenMode;
const mode = chosenMode ?? 'free';
let slot = persist && chosenMode ? loadSlot(mode) : null;
if (!slot) {
  slot = newSlot(mode, params.get('seed') ? parseInt(params.get('seed'), 36) : randomSeed());
  if (persist && !choosing) storeSlot(slot);
}

const ctx = {
  params,
  persist,
  profile,
  mode,
  rules: rulesFor(mode),
  slot,
  choosing,
  /** Grava a travessia? (só no npm start normal, com um mundo escolhido) */
  saving: persist && !choosing,
  worldState: new WorldState(slot),
  // um mundo novo da Peregrinação começa com pouca carga (ver o cofre, Inicio-do-mundo)
  // e com o leitor portátil (a primeira ferramenta)
  player: createPlayerState(slot.player ?? (mode === 'pilgrimage' ? { energy: { value: 0.35 }, inventory: ['reader'] } : null)),
  autostart: params.get('autostart') === '1',
  resumed: !!slot.pos,
  seed: params.get('seed') ? parseInt(params.get('seed'), 36) : slot.seed,
  time: 0,
  settings: loadSettings(),
};
// a Peregrinação sempre tem o leitor portátil (mundos salvos antes dele também)
if (mode === 'pilgrimage' && !ctx.player.inventory.includes('reader')) ctx.player.inventory.push('reader');
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
// a língua antiga: o léxico é global (perfil) e só cresce na Peregrinação
ctx.lexicon = new Lexicon(profile, () => ctx.rules.translation, () => {
  if (ctx.persist) storeProfile(profile);
});
ctx.world.lexicon = ctx.lexicon;
ctx.world.build(ctx.seed);
ctx.dust = createDust();
ctx.scene.add(ctx.dust);

// ─── corpo e controles ──────────────────────────────────────────────────────
const controls = (ctx.controls = new NoclipControls(ctx.camera, ctx.canvas));
controls.walker = new Walker(new CollisionWorld(ctx.world));
controls.canFly = ctx.rules.fly;
bindings.mode = ctx.mode; // os atalhos que valem neste modo (controls/bindings.js)
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
if (slot.pos) {
  controls.setView({ pos: new THREE.Vector3(...slot.pos), yaw: slot.yaw, pitch: slot.pitch, scale: 1 });
  if (slot.move === 'fly') controls.setMode('fly');
}
// Início do mundo (Peregrinação — ver o cofre, Inicio-do-mundo): um mundo novo começa
// diante de um terminal morto, num lugar diferente por seed; a primeira leitura dá a primeira pista
const fresh = ctx.rules.leads && !slot.pos && !params.get('pos') && !params.get('goto') && !params.get('check');
const start = fresh ? startPlace(ctx.world.field) : null;
if (start) {
  const eye = new THREE.Vector3(start.stand.x, start.stand.y + 1.7, start.stand.z).sub(ctx.world.origin);
  controls.setView({ pos: eye, yaw: start.yaw, pitch: -0.2, scale: 1 });
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
ctx.leads = createLeads(ctx);
ctx.travel = createTravel(ctx);
ctx.body = createBody(ctx);
ctx.sound = createWorldSound(ctx);
ctx.ui = createUI(ctx);
ctx.wake = createWake(ctx);
ctx.carried = createCarried(ctx);
ctx.reading = createReading(ctx);
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
  // durante o desmaio a câmera é da sequência (app/wake.js)
  if (ctx.wake.active) ctx.wake.update(dt);
  else {
    controls.update(dt, time);
    ctx.body.update(dt);
  }
  ctx.travel.update(dt);
  camera.updateMatrixWorld();

  // 2. origem flutuante
  const rebased = world.maybeRebase(camera);
  if (rebased) ctx.scenePass.shiftOrigin(rebased.delta);
  ctx.carried.update(dt, time); // a lanterna na mão (Peregrinação)

  // 3. mundo
  shared.uTime.value = time;
  shared.uFogBase.value = camera.position.y + FOG_ABOVE_EYE;
  ctx.signal.uniforms.uTime.value = time;
  dust.material.uniforms.uTime.value = time;
  dust.material.uniforms.uCam.value.copy(camera.position);
  world.update(time, dt, camera, controls.scale);
  ctx.reflection.update(world.field, world.toGlobal(camera.position, globalPos), dt);
  ctx.sound.update(dt);

  // caiu no abismo por tempo demais: realoca (só se ligado nas configurações)
  // Peregrinação: a queda sem fim também acaba em desmaio (app/wake.js)
  if (ctx.rules.deathWake && !ctx.wake.active && controls.mode === 'walk' && controls.walker.airTime > VOID_FAINT_AFTER) ctx.wake.start('void');
  const rescue = ctx.rules.fallRescue === 'always' || (ctx.rules.fallRescue === 'setting' && ctx.settings.fallRescue);
  if (rescue && controls.mode === 'walk' && controls.walker.airTime > FALL_RESCUE_AFTER) {
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
