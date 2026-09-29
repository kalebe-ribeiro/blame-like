// ─────────────────────────────────────────────────────────────────────────────
//  O que o corpo carrega (modo Peregrinação — ver o cofre, Luz-como-recurso e
//  Interface-diegetica): um aparelho na mão, com uma lanterna na frente e uma
//  telinha em cima. Não há barra na tela do jogo: a carga aparece no aparelho.
//
//  • Célula de energia (ctx.player.energy): a lanterna gasta; sem carga, você
//    ainda anda — só enxerga o que a Cidade ilumina. Carga baixa: a luz falha.
//  • F liga/desliga a lanterna (na Peregrinação não se voa, a tecla fica livre).
//  • Tomadas (ChunkBuilder.socket): perto de uma, E conecta; recarrega enquanto
//    você fica ali — se o setor tiver energia.
//  • A lanterna é uma luz de verdade (o espaço 'carried' do LightRig), presa à
//    lente do aparelho: ilumina o caminho e a poeira em volta.
//  (Sensor e leitor portátil — fases 2 e 3 — também gastarão desta célula.)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';

const DRAIN = 1 / 420; // lanterna: carga cheia dura 7 min
const CHARGE = 1 / 25; // tomada: de vazio a cheio em 25 s
const REACH = 2.2; // m até a tomada
const LANTERN = 2.4; // intensidade da lanterna (perto do corpo: pouco já ilumina — e espalha na poeira)
const W = 128;
const H = 64;

export function createCarried(ctx) {
  const { camera, world, audio, controls, scene } = ctx;
  const player = ctx.player;
  const m = world.materials;
  const active = () => ctx.rules.resources;

  // ── o aparelho, preso à câmera (a câmera entra na cena para ele aparecer) ──
  if (!camera.parent) scene.add(camera);
  const device = new THREE.Group();
  device.position.set(0.12, -0.11, -0.28);
  device.rotation.set(0.75, -0.15, 0); // a tela virada para os olhos
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.04, 0.16), m.machine);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.033), new THREE.MeshBasicMaterial({ map: tex, color: 0x8f9a90 }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, 0.0205, 0.015);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.026, 0.006), m.lamp);
  lens.position.set(0, 0, -0.083);
  device.add(body, screen, lens);
  camera.add(device);

  let lanternOn = false;
  let plugged = null; // a tomada conectada
  let near = null; // a tomada mais próxima ao alcance
  let scan = 0;
  let redraw = 0;
  const _g = new THREE.Vector3();
  const _lens = new THREE.Vector3();

  /** A tomada tem energia? (setor não apagado, sem apagão, onda do instável em alta) */
  function socketPowered(s, time) {
    const f = world.field;
    return world.outages.power(s.x, s.y, s.z, 2.1, time) >= 0.5 && f.sectorLight(s.x, s.y, s.z, time) >= 0.5;
  }

  function draw(time) {
    const e = player.energy.value / player.energy.max;
    g2.fillStyle = '#050706';
    g2.fillRect(0, 0, W, H);
    // dez gomos de carga
    for (let i = 0; i < 10; i++) {
      const full = e * 10 > i + 0.5;
      g2.fillStyle = full ? (e < 0.15 ? '#c8864a' : '#b8c4b4') : '#1c211d';
      g2.fillRect(8 + i * 11.3, 10, 8.5, 18);
    }
    g2.font = '12px Consolas, monospace';
    g2.textBaseline = 'top';
    g2.fillStyle = '#9fae9f';
    let line = '';
    if (plugged) line = socketPowered(plugged, time) ? t('device.charging') : t('device.noPower');
    else if (near) line = t('device.socket');
    else if (e <= 0) line = t('device.empty');
    if (line && !(plugged && Math.floor(time * 2) % 2)) g2.fillText(line, 8, 38);
    tex.needsUpdate = true;
  }

  function toggleLantern() {
    if (!active() || ctx.wake?.active) return;
    lanternOn = !lanternOn;
    audio.deviceClick?.(lanternOn);
  }

  function togglePlug() {
    if (!active() || ctx.wake?.active) return;
    if (plugged) plugged = null;
    else if (near) plugged = near;
    else return;
    audio.deviceClick?.(!!plugged);
  }

  document.addEventListener('keydown', (e) => {
    if (e.repeat || !controls.locked) return;
    if (e.code === 'KeyF' && !ctx.rules.fly) toggleLantern();
    if (e.code === 'KeyE') togglePlug();
  });

  return {
    toggleLantern,
    togglePlug,
    get lanternOn() {
      return lanternOn;
    },
    update(dt, time) {
      const light = world.carriedLight;
      const on = active() && !ctx.wake?.active;
      device.visible = on;
      if (!on) {
        if (light) light.intensity = 0;
        return;
      }
      const en = player.energy;
      world.toGlobal(camera.position, _g);

      // a tomada mais próxima (a cada 0,25 s)
      scan -= dt;
      if (scan <= 0) {
        scan = 0.25;
        near = null;
        let best = REACH;
        for (const s of world.sockets()) {
          const d = Math.hypot(s.x - _g.x, s.y - (_g.y - 0.8), s.z - _g.z);
          if (d < best) {
            best = d;
            near = s;
          }
        }
        if (plugged && Math.hypot(plugged.x - _g.x, plugged.y - (_g.y - 0.8), plugged.z - _g.z) > REACH + 0.5) {
          plugged = null; // afastou: desconectou
          audio.deviceClick?.(false);
        }
      }

      // carga e descarga
      if (plugged && socketPowered(plugged, time)) en.value = Math.min(en.max, en.value + CHARGE * dt);
      if (lanternOn && en.value > 0) en.value = Math.max(0, en.value - DRAIN * dt);
      if (en.value <= 0) lanternOn = false;

      // a lanterna: presa à lente; com pouca carga, falha
      if (light) {
        lens.getWorldPosition(_lens);
        light.pos.copy(_lens);
        let k = lanternOn ? 1 : 0;
        const e = en.value / en.max;
        if (lanternOn && e < 0.15) {
          const r = Math.sin(time * 37.1) * Math.sin(time * 13.7 + 1.3);
          if (r > 0.6 - e * 3) k *= 0.15;
        }
        light.intensity = LANTERN * k;
      }

      redraw -= dt;
      if (redraw <= 0) {
        redraw = 0.25;
        draw(time);
      }
    },
  };
}
