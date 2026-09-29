// ─────────────────────────────────────────────────────────────────────────────
//  CYBERCOSMIC — ponto de entrada do renderer.
//
//  Ordem de um frame:
//    1. controles (noclip) movem a câmera
//    2. origem flutuante (reindexa o mundo se longe demais do 0,0,0 da cena)
//    3. streaming de chunks, luzes, uniforms globais
//    4. máscara das silhuetas colossais
//    5. render principal (SSAO + TAA) → bloom → tone mapping → filme
//    6. interface alienígena + parâmetros do áudio
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { createSharedUniforms, createDust } from './shaders/materials.js';
import { SignalShader } from './shaders/post.js';
import { World, VIEWS } from './world/world.js';
import { NoclipControls } from './controls/noclip.js';
import { Walker } from './controls/walker.js';
import { CollisionWorld } from './world/collision.js';
import { AudioEngine } from './audio/audio.js';
import { AlienHUD } from './ui/hud.js';
import { createAlphabet, drawGlyph } from './ui/glyphs.js';
import { SettingsPanel, loadSettings } from './ui/settings.js';
import { ScenePass } from './render/pipeline.js';
import { ReflectionSystem } from './render/reflection.js';
import { loadSave, storeSave, Diary } from './ui/journey.js';
import { TrailMap } from './ui/trailmap.js';
import { TransportPanel } from './ui/transport.js';
import { findDestination } from './world/teleport.js';

const params = new URLSearchParams(location.search);
const AUTOSTART = params.get('autostart') === '1';
// continuar de onde parou (a não ser que uma flag de desenvolvimento escolha o lugar)
// só o `npm start` normal (sem nenhuma flag) lê e grava a travessia — sessões de
// teste/captura não tocam no seu salvamento nem no seu diário
const PERSIST = [...params.keys()].every((k) => k === 'autostart');
const saved = PERSIST ? loadSave() : null;
let seed = params.get('seed') ? parseInt(params.get('seed'), 36) : saved?.seed ?? Math.floor(Math.random() * 2 ** 31);

// ─── renderer / cena / câmera ───────────────────────────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = true;
renderer.info.autoReset = false; // zerado manualmente a cada frame (o composer faz vários renders)

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 12000);

const shared = createSharedUniforms();
const world = new World(scene, shared);
world.build(seed);
const dust = createDust();
scene.add(dust);

// A névoa de altura é relativa ao observador: sempre mais densa abaixo (o
// abismo brilha), mais rala acima — em qualquer altitude do mundo infinito.
const FOG_ABOVE_EYE = 40;

const controls = new NoclipControls(camera, canvas);
controls.walker = new Walker(new CollisionWorld(world));
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

const audio = new AudioEngine();
const hud = new AlienHUD(document.getElementById('hud'), seed);

// ─── pós-processamento ──────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
// cena + oclusão de ambiente + antialiasing temporal (render/pipeline.js)
const scenePass = new ScenePass(scene, camera, shared);
// reflexo planar nos setores inundados (render/reflection.js)
const reflection = new ReflectionSystem(shared);
reflection.attach(world.materials.flood);
composer.addPass(scenePass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.6, 0.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const signal = new ShaderPass(SignalShader);
signal.uniforms.uRes.value = new THREE.Vector2();
composer.addPass(signal);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio()); // os buffers internos acompanham a resolução
  composer.setSize(w, h);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  signal.uniforms.uRes.value.copy(db);
  dust.material.uniforms.uRes.value.copy(db);
  world.silhouettes.setSize(db.x, db.y);
  reflection.setSize(db.x, db.y);
  hud.resize();
}
window.addEventListener('resize', resize);
resize();


// ─── corpo: passos, quedas, troca de modo ───────────────────────────────────
// o som do passo depende do que está sob os pés (material da malha de colisão)
const STEP_SURFACE = {
  grate: 'grate', rungs: 'grate',
  rib: 'metal', duct: 'metal', machine: 'metal', frame: 'metal', conduit: 'metal', tube: 'metal', bridge: 'metal', door: 'metal',
  water: 'water',
};
controls.walker.onStep = (k) => audio.footstep(k, wading ? 'water' : STEP_SURFACE[controls.walker.groundObj?.userData.mat] ?? 'concrete');

// dentro d'água (setores inundados): passo mais lento, som de água
let wading = false;
function checkWading() {
  const w = controls.walker;
  if (controls.mode !== 'walk' || !w.grounded) {
    wading = false;
  } else {
    const g = world.toGlobal(camera.position);
    const feetY = g.y - w.eye;
    const lvl = world.field.floodLevelAt(g.x, feetY, g.z);
    wading = lvl !== null && feetY < lvl;
  }
  w.speedScale = wading ? 0.62 : 1;
}
controls.walker.onLand = (impact, height) => {
  audio.land(Math.min(1, impact / 30));
  audio.impact(impact);
  controls.rumble(Math.min(1, Math.max(0, impact - 6) / 40), Math.min(1, impact / 30), 120 + Math.min(500, impact * 10));
  diary.fall(height);
  if (height > 40) trail.mark(world.toGlobal(camera.position), 'queda', height);
  if (height > 80) hud.push(`QUEDA REGISTRADA :: ${Math.round(height)} m`);
};

// ─── sensação de velocidade e de queda ──────────────────────────────────────
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
let fovKick = 0;
// ─── a travessia: salvamento e diário ───────────────────────────────────────
const diary = new Diary(PERSIST);
const trail = new TrailMap(PERSIST);
trail.useSeed(seed);
const _lastG = new THREE.Vector3();
let hasLast = false;
let journeyTimer = 0;
let regionTimer = 0;
function saveNow() {
  if (!PERSIST) return;
  const g = world.toGlobal(camera.position);
  storeSave({ seed, pos: [g.x, g.y, g.z], yaw: controls.yaw, pitch: controls.pitch, mode: controls.mode });
  diary.save();
  trail.save();
}
function trackJourney(dt) {
  const g = world.toGlobal(camera.position, new THREE.Vector3());
  if (hasLast) {
    const d = g.distanceTo(_lastG);
    // saltos (transporte, novo mundo) não contam
    if (d < 120 * Math.max(dt, 1 / 60)) {
      const horiz = Math.hypot(g.x - _lastG.x, g.z - _lastG.z);
      if (world.transit.riding) diary.add('rode', horiz);
      else if (controls.mode === 'fly') diary.add('flown', d);
      else diary.add('walked', horiz);
    }
  }
  _lastG.copy(g);
  hasLast = true;
  trail.record(g, world.transit.riding ? 1 : 0);
  diary.altitude(g.y);
  if (controls.locked) diary.add('time', dt);
  regionTimer -= dt;
  if (regionTimer <= 0) {
    regionTimer = 1;
    diary.region(world.regionAt(camera.position));
  }
  journeyTimer -= dt;
  if (journeyTimer <= 0) {
    journeyTimer = 5;
    saveNow();
  }
}
window.addEventListener('beforeunload', saveNow);

/** Mostra o diário na tela de entrada. */
function renderDiary() {
  const el = document.getElementById('gate-diary');
  if (!el) return;
  el.innerHTML = '<div class="diary-title">DIÁRIO DA TRAVESSIA</div>' +
    diary.lines().map(([k, v]) => `<div class="diary-row"><span>${k}</span><b>${v}</b></div>`).join('');
}
renderDiary();
if (saved) document.querySelector('.gate-sub').textContent = 'clique para continuar a travessia';

/** Vagões vistos de fora: o mais próximo ronca; os que passam rente dão uma lufada. */
function hearCars() {
  let best = Infinity;
  let bestCar = null;
  for (const car of world.transit.cars.values()) {
    if (car === world.transit.riding || car.t === null) continue;
    const d = car.group.position.distanceTo(camera.position);
    if (d < best) {
      best = d;
      bestCar = car;
    }
    // lufada quando passa rente e rápido (uma vez por passagem)
    if (d < 16 && (car.speed ?? 0) > 10 && !car.passed) {
      car.passed = true;
      const p = car.group.position;
      audio.carPass(placeOf(p.x + world.origin.x, p.y + world.origin.y, p.z + world.origin.z)[0], car.speed);
      controls.rumble(0.35 * Math.min(1, car.speed / 30), 0.5, 600);
    } else if (d > 40) car.passed = false;
  }
  if (bestCar) {
    const p = bestCar.group.position;
    audio.setCarNear(placeOf(p.x + world.origin.x, p.y + world.origin.y, p.z + world.origin.z)[0], best, bestCar.speed ?? 0);
  } else audio.setCarNear(0, Infinity, 0);
}

let railAcc = 0;
/** A bordo de um vagão: ronco e as juntas do trilho a cada 12 m. */
function feelRide(dt) {
  const w = controls.walker;
  const car = controls.mode === 'walk' && w.grounded ? world.transit.carOf(w.groundObj) : null;
  world.transit.riding = car;
  if (car && !feelRide.last) diary.add('rides'); // embarcou
  if (car && car === feelRide.last && car.powered !== feelRide.powered) {
    hud.push(car.powered ? 'TRANSPORTADOR :: ENERGIA RESTABELECIDA' : 'TRANSPORTADOR :: SEM ENERGIA · aguardando religamento');
  }
  feelRide.last = car;
  feelRide.powered = car?.powered;
  const v = car?.speed ?? 0;
  audio.setRide(v);
  railAcc += v * dt;
  if (!car) railAcc = 0;
  else if (railAcc > 12) {
    railAcc -= 12;
    audio.railJoint(Math.min(1, v / 20));
    controls.rumble(0.05 + 0.1 * Math.min(1, v / 30), 0.12, 60);
  }
}

/** Vento, campo de visão abrindo, tremor e poeira em riscos — chamado a cada frame. */
function feelMotion(dt) {
  const walking = controls.mode === 'walk';
  const w = controls.walker;
  const vel = walking ? w.vel : controls.velocity;
  const fallV = walking && !w.grounded && !w.climbing ? Math.max(0, -w.vel.y) / controls.scale : 0;
  audio.setWind(Math.max(fallV, walking ? 0 : controls.speed * 0.6));
  // o campo de visão abre durante a queda (desligável: conforto)
  const fx = settings.motionFx ? 1 : 0;
  fovKick += (11 * smooth(14, 55, fallV) * fx - fovKick) * Math.min(1, dt * 3);
  const fov = settings.fov + fovKick;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // tremor (o quaternion é refeito pelos controles a cada frame: não acumula)
  const sh = smooth(22, 60, fallV) * 0.004 * fx;
  if (sh > 0) {
    camera.rotateX((Math.sin(time * 37.1) + Math.sin(time * 23.7 + 1.3)) * sh);
    camera.rotateY((Math.sin(time * 31.3 + 2.1) + Math.sin(time * 19.9)) * sh * 0.7);
  }
  // poeira em riscos
  const du = dust.material.uniforms;
  du.uVel.value.copy(vel);
  du.uStreak.value = 0.05 * smooth(8, 40, vel.length() / controls.scale);
}
controls.onModeChange = (mode) => {
  hud.push(mode === 'walk' ? 'LOCOMOÇÃO: SUPERFÍCIE · gravidade restaurada' : 'LOCOMOÇÃO: DERIVA · gravidade suspensa');
};
controls.walker.onClimbStep = () => audio.rung();

// ─── controle de videogame ──────────────────────────────────────────────────
controls.onPadStart = () => {
  // o controle não precisa (nem consegue) travar o mouse: entra direto
  audio.start();
  if (!settingsPanel.isOpen && !transportPanel.isOpen) gate.classList.add('hidden');
  hud.push('CONTROLE DETECTADO :: entrada aceita');
};
controls.onPadButton = (name) => {
  if (name === 'photo') takePhoto();
  if (name === 'hud') hud.toggle();
};

// ─── apagões de setor ───────────────────────────────────────────────────────
const sectorName = (ev) => ((Math.abs(Math.round(ev.c.x / 97) * 131 + Math.round(ev.c.z / 89) * 7) + ev.id) % 4096).toString(16).toUpperCase().padStart(3, '0');
world.outages.onStart = (ev) => {
  audio.powerDown(...placeOf(ev.c.x, ev.c.y, ev.c.z), ev.maxR);
  controls.rumble(0.25, 0.1, 300);
  diary.add('outages');
  hud.push(`SETOR 0x${sectorName(ev)} :: ENERGIA INTERROMPIDA`);
};
world.outages.onRestore = (ev) => {
  audio.powerUp(...placeOf(ev.c.x, ev.c.y, ev.c.z), ev.maxR);
  hud.push(`SETOR 0x${sectorName(ev)} :: RELIGAMENTO EM CASCATA`);
};
// ─── colapsos distantes ─────────────────────────────────────────────────────
world.collapses.onStart = (ev) => {
  const [pan, dist] = placeOf(ev.pos.x, ev.pos.y, ev.pos.z);
  audio.collapseStart(pan, dist, ev.delay);
  diary.add('collapses');
  hud.push('ESTRUTURA COMPROMETIDA :: desprendimento registrado');
};
world.collapses.onImpact = (ev) => {
  const [pan, dist] = placeOf(ev.pos.x, ev.pos.y, ev.pos.z);
  audio.collapseImpact(pan, dist);
  setTimeout(() => controls.rumble(Math.max(0, 0.6 - dist / 800), 0.3, 700), Math.min(dist, 3000) / 0.34);
};
if (params.get('collapse')) {
  setTimeout(() => {
    const f = camera.getWorldDirection(new THREE.Vector3());
    world.collapses.trigger(world.toGlobal(camera.position), f, time);
  }, Number(params.get('collapse')) * 1000);
}
// flag de desenvolvimento: --outage força um apagão logo no início
if (params.get('outage')) {
  setTimeout(() => {
    const f = camera.getWorldDirection(new THREE.Vector3());
    world.outages.trigger(world.toGlobal(camera.position), f, time);
  }, Number(params.get('outage')) * 1000);
}

// ─── sons posicionados no mundo (gotas, obras) ──────────────────────────────
const _rel = new THREE.Vector3();
const _right = new THREE.Vector3();
/** Panorâmica (−1..1) e distância de um ponto GLOBAL em relação à câmera. */
function placeOf(x, y, z) {
  const g = world.toGlobal(camera.position, globalPos);
  _rel.set(x - g.x, y - g.y, z - g.z);
  const dist = _rel.length();
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  return [dist > 0 ? _rel.dot(_right) / dist : 0, dist];
}
let spaceTimer = 0;

/** Tempo em queda livre até o sistema "realocar" o observador (s). */
const FALL_RESCUE_AFTER = 5.5;

// ─── portão de entrada ──────────────────────────────────────────────────────
const gate = document.getElementById('gate');
drawGateGlyphs();

gate.addEventListener('click', () => {
  audio.start();
  controls.lock();
});
controls.onLockChange = (locked) => {
  // com o painel aberto, a tela de entrada fica escondida atrás dele
  gate.classList.toggle('hidden', locked || settingsPanel.isOpen || transportPanel.isOpen || trail.open);
  if (!locked) {
    renderDiary();
    saveNow();
  }
};
if (AUTOSTART) {
  gate.style.display = 'none';
  audio.start();
}

function drawGateGlyphs() {
  const c = document.getElementById('gate-glyphs');
  const ctx = c.getContext('2d');
  const alphabet = createAlphabet(seed ^ 0x5eed);
  c.width = c.clientWidth * 2;
  c.height = c.clientHeight * 2;
  ctx.scale(2, 2);
  ctx.strokeStyle = ctx.fillStyle = 'rgba(178,188,172,0.7)';
  ctx.lineWidth = 1.4;
  const n = Math.floor(c.clientWidth / 22);
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.1) continue;
    if (Math.random() < 0.08) ctx.strokeStyle = ctx.fillStyle = 'rgba(196,110,62,0.8)';
    else ctx.strokeStyle = ctx.fillStyle = 'rgba(178,188,172,0.7)';
    drawGlyph(ctx, alphabet[Math.floor(Math.random() * alphabet.length)], i * 22 + 4, 16, 12, 24);
  }
}

// ─── teclas globais ─────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && !e.repeat) regenerate();
  if (e.code === 'KeyH' && !e.repeat) hud.toggle();
  if (e.code === 'KeyO' && !e.repeat) openSettings();
  if (e.code === 'KeyT' && !e.repeat) openTransport();
  if (e.code === 'F2' && !e.repeat) takePhoto();
  if (e.code === 'KeyM' && !e.repeat) toggleMap();
  if (e.code === 'Escape' && trail.open) toggleMap();
});

// ─── mapa da travessia (M) ──────────────────────────────────────────────────
function toggleMap() {
  if (trail.open) {
    trail.hide();
    if (!controls.locked) gate.classList.remove('hidden');
    return;
  }
  document.exitPointerLock?.();
  if (settingsPanel.isOpen) settingsPanel.close();
  if (transportPanel.isOpen) transportPanel.close();
  gate.classList.add('hidden');
  trail.show(world.toGlobal(camera.position));
}

// ─── modo foto (F2) ─────────────────────────────────────────────────────────
// Renderiza UM quadro em alta resolução (até 4K de largura), sem grão de filme
// e sem a interface (o HUD é outro canvas), e salva em Imagens/CYBERCOSMIC.
function takePhoto() {
  const prevRatio = renderer.getPixelRatio();
  const ratio = Math.max(prevRatio, Math.min(3, 3840 / window.innerWidth));
  const grain = signal.uniforms.uGrain.value;
  signal.uniforms.uGrain.value = 0;
  renderer.setPixelRatio(ratio);
  resize();
  // parado, vários quadros com tremor: o antialiasing temporal converge
  for (let i = 0; i < 16; i++) {
    renderViews();
    composer.render(0);
  }
  // lido na mesma tarefa do desenho: o buffer ainda não foi descartado
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = URL.createObjectURL(blob);
    a.download = `cybercosmic-${seed.toString(36)}-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    hud.push('REGISTRO SALVO :: Imagens/CYBERCOSMIC');
  }, 'image/png');
  signal.uniforms.uGrain.value = grain;
  renderer.setPixelRatio(prevRatio);
  resize();
  audio.shutter();
  diary.add('photos');
  trail.mark(world.toGlobal(camera.position), 'foto');
}

// ─── configurações ──────────────────────────────────────────────────────────
const settings = loadSettings();
// flags de desenvolvimento (--fog / --dist): valem só para esta sessão
if (params.get('fog') !== null) settings.fog = Number(params.get('fog'));
if (params.get('dist') !== null) settings.renderDistance = Number(params.get('dist'));
const settingsPanel = new SettingsPanel(settings, (s, key) => applySettings(s, key));
settingsPanel.onClose = () => gate.classList.remove('hidden');
document.getElementById('open-settings').addEventListener('click', (e) => {
  e.stopPropagation(); // não entra no mundo ao clicar no botão
  openSettings();
});

function openSettings() {
  document.exitPointerLock?.();
  if (transportPanel.isOpen) transportPanel.close();
  gate.classList.add('hidden');
  settingsPanel.open();
}

// ─── transporte ─────────────────────────────────────────────────────────────
const transportPanel = new TransportPanel((kind, label) => teleport(kind, label));
transportPanel.onClose = () => {
  if (!controls.locked) gate.classList.remove('hidden');
};
document.getElementById('open-transport').addEventListener('click', (e) => {
  e.stopPropagation();
  openTransport();
});

function openTransport() {
  document.exitPointerLock?.();
  if (settingsPanel.isOpen) settingsPanel.close();
  gate.classList.add('hidden');
  transportPanel.open();
}

/** Destinos já visitados por tipo (para "repetir" levar a outro exemplar). */
const visited = new Map();

/** Leva o observador ao exemplar mais próximo do tipo pedido. */
function teleport(kind, label) {
  const g = world.toGlobal(camera.position, new THREE.Vector3());
  const recent = visited.get(kind) ?? new Set();
  const dest = findDestination(world.field, kind, g, recent);
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
  return true;
}
// flag de desenvolvimento: --goto=construtores (ou qualquer tipo de DESTINATIONS)
if (params.get('goto')) teleport(params.get('goto'), params.get('goto'));

function applySettings(s, key) {
  if (!key || key === 'renderDistance' || key === 'fog') world.setView({ renderDistance: s.renderDistance, fog: s.fog });
  if (!key || key === 'fov') {
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
  }
  if (!key || key === 'sensitivity') controls.sensitivity = 0.0021 * s.sensitivity;
  if (!key || key === 'outages') world.outages.enabled = s.outages;
  if (!key || key === 'collapses') world.collapses.enabled = s.collapses;
  if (!key || key === 'ssao') scenePass.aoEnabled = s.ssao;
  if (!key || key === 'taa') scenePass.taaEnabled = s.taa;
  if (!key || key === 'shafts') scenePass.shaftsEnabled = s.shafts;
  if (!key || key === 'headBob') controls.walker.bobScale = s.headBob ? 1 : 0;
  if (!key || key === 'reflections') reflection.enabled = s.reflections;
  if (!key || key === 'motionFx') controls.walker.dipScale = s.motionFx ? 1 : 0;
  if (!key || key === 'invertY') controls.invertY = s.invertY;
  if (!key || key === 'resolution') {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, s.resolution));
    resize();
  }
}
applySettings(settings);

document.getElementById('new-world').addEventListener('click', (e) => {
  e.stopPropagation();
  regenerate();
  hasLast = false;
  saveNow();
  document.querySelector('.gate-sub').textContent = 'clique para entrar na Cidade';
});

function regenerate() {
  seed = Math.floor(Math.random() * 2 ** 31);
  hasLast = false;
  world.build(seed);
  world.setView({ renderDistance: settings.renderDistance, fog: settings.fog });
  hud.setSeed(seed);
  trail.useSeed(seed);
  controls.setView(VIEWS.spawn);
  scenePass.reset();
  reflection.materials = [];
  reflection.attach(world.materials.flood);
  resize();
}

/** Tudo que precisa estar pronto antes da cena: a máscara das silhuetas e o reflexo da água. */
function renderViews() {
  world.silhouettes.renderMask(renderer, camera);
  reflection.render(renderer, scene, camera, world.origin);
}

// ─── loop ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const globalPos = new THREE.Vector3();
let time = 0;

function frame() {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  // 1–2. movimento + portais
  controls.update(dt, time);
  feelMotion(dt);
  checkWading();
  feelRide(dt);
  hearCars();
  trackJourney(dt);
  camera.updateMatrixWorld();

  // 3. origem flutuante
  const rebased = world.maybeRebase(camera);
  if (rebased) scenePass.shiftOrigin(rebased.delta);

  // 4. mundo
  shared.uTime.value = time;
  shared.uFogBase.value = camera.position.y + FOG_ABOVE_EYE;
  signal.uniforms.uTime.value = time;
  dust.material.uniforms.uTime.value = time;
  dust.material.uniforms.uCam.value.copy(camera.position);
  world.lights.close = controls.mode === 'walk';
  world.update(time, dt, camera, controls.scale);
  reflection.update(world.field, world.toGlobal(camera.position, globalPos), dt);
  world.particles.onDrip ??= (x, y, z) => audio.dripAt(...placeOf(x, y, z));
  for (const ev of world.builders.events.splice(0)) {
    const [pan, dist] = placeOf(ev.x, ev.y, ev.z);
    if (ev.kind === 'clang') audio.clangAt(pan, dist);
    else audio.weldAt(pan, dist);
  }
  spaceTimer -= dt;
  if (spaceTimer <= 0) {
    spaceTimer = 0.5;
    audio.setSpace(world.spaceSize(camera.position));
    // rugido da cascata mais próxima (distância até a coluna d'água)
    const g = world.toGlobal(camera.position, globalPos);
    let best = Infinity;
    let bp = null;
    for (const c of world.field.cascadesNear(g.x, g.y, g.z, 900)) {
      const col = world.field.cascadeColumn(c);
      const y = Math.min(c.out.y, Math.max(c.bottom, g.y));
      const d = Math.hypot(g.x - col.x, g.y - y, g.z - col.z);
      if (d < best) {
        best = d;
        bp = [col.x, y, col.z];
      }
    }
    audio.setWaterfall(bp ? placeOf(...bp)[0] : 0, best);
  }

  // caiu no abismo por tempo demais: realoca (só se ligado nas configurações)
  if (settings.fallRescue && controls.mode === 'walk' && controls.walker.airTime > FALL_RESCUE_AFTER) {
    const landing = world.findLanding(camera.position);
    if (landing) {
      controls.placeFeet(landing);
      audio.reindex();
      hud.push('OBSERVADOR REALOCADO :: a queda não termina, ela é interrompida');
    } else {
      controls.walker.airTime = 0;
    }
  }

  // 5–6. render
  renderViews();
  composer.render(dt);

  // 7. interface + áudio
  hud.update(dt, time, {
    pos: world.toGlobal(camera.position, globalPos),
    scale: controls.scale,
    region: world.regionAt(camera.position),
    seed,
  });
  audio.update({ speed: controls.speed });
}
frame();

// ─── depuração: `npx electron . --stats` imprime FPS/streaming no terminal ──
if (params.get('stats')) {
  let frames = 0;
  const count = () => {
    frames++;
    requestAnimationFrame(count);
  };
  count();
  setInterval(() => {
    const g = world.toGlobal(camera.position);
    const s = world.stats;
    const info = renderer.info.render;
    console.warn(
      `fps=${(frames / 2).toFixed(0)} chunks=${s.chunks} lod1=${s.lod1} lod2=${s.lod2} macro=${s.macro} fila=${s.pending} ` +
        `lotes=${world.batches.stats.pages} draws=${info.calls} tris=${(info.triangles / 1e6).toFixed(2)}M pos=${g.x.toFixed(0)},${g.y.toFixed(0)},${g.z.toFixed(0)} região=${world.regionAt(camera.position)}`,
    );
    frames = 0;
  }, 2000);
}
