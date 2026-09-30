// ─────────────────────────────────────────────────────────────────────────────
//  O que o corpo carrega (modo Peregrinação — ver o cofre, Luz-como-recurso,
//  Ferramentas e Interface-diegetica): um aparelho na mão, com uma lanterna na
//  frente e uma telinha em cima. Não há barra na tela do jogo: a carga e o
//  sensor aparecem no aparelho.
//
//  • Célula de energia (ctx.player.energy): a lanterna e o sensor gastam; sem
//    carga, você ainda anda — só enxerga o que a Cidade ilumina. Carga baixa:
//    a luz falha.
//  • A lanterna liga/desliga pelo atalho 'lantern' (F — controls/bindings.js).
//  • Tomadas (ChunkBuilder.socket): perto de uma, E conecta (se não houver
//    um terminal em frente — app/ui.js decide); recarrega enquanto
//    você fica ali — se o setor tiver energia.
//  • A lanterna é uma luz de verdade (o espaço 'carried' do LightRig), presa à
//    lente do aparelho: ilumina o caminho e a poeira em volta.
//  • SENSOR (quando achado — ctx.player.inventory): o atalho troca o que ele escuta
//    (terminais → energia → movimento → desligado). Na tela: de que lado vem
//    o sinal mais forte, se está ACIMA ou ABAIXO (▲ ▼ — as pistas trocam de
//    camada) e o quanto ele é nítido — nunca a que distância. No
//    modo terminais, o lugar de uma pista aberta soa diferente (◆): é assim
//    que você sabe que chegou. O console das estruturas únicas tem energia
//    própria e se ouve de muito mais longe.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { bindings } from '../controls/bindings.js';
import { terminalSitesNear, uniqueTerminal } from '../gen/sites.js';

const DRAIN = 1 / 420; // lanterna: carga cheia dura 7 min
const SENSOR_DRAIN = 1 / 900; // sensor ligado: carga cheia dura 15 min
const CHARGE = 1 / 25; // tomada: de vazio a cheio em 25 s
const REACH = 2.2; // m até a tomada
const LANTERN = 2.4; // intensidade da lanterna (perto do corpo: pouco já ilumina — e espalha na poeira)
const W = 128;
const H = 64;
const MODES = ['terminal', 'energy', 'motion'];
// alcance do sensor (m), por modo; o console das únicas se ouve de mais longe
const RANGE = { terminal: 600, unique: 2500, energy: 1200, motion: 3000 };

export function createCarried(ctx) {
  const { camera, world, audio, controls, scene } = ctx;
  const player = ctx.player;
  const m = world.materials;
  const active = () => ctx.rules.resources;
  const hasSensor = () => player.inventory.includes('sensor');

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
  let sensor = null; // o que o sensor escuta agora: null (desligado) ou um de MODES
  let signal = null; // { x, y, z, k (0..1 nitidez), lead }
  let sensorScan = 0;
  let bearing = 0; // de que lado vem o sinal (rad, suavizado; + = à esquerda)
  let vert = 0; // acima (+1), abaixo (−1) ou no mesmo nível (0)
  let found = 0; // s: "SENSOR  [G]" na tela depois de pegar o sensor
  const _g = new THREE.Vector3();
  const _lens = new THREE.Vector3();

  /** A tomada tem energia? (setor não apagado, sem apagão, onda do instável em alta) */
  function socketPowered(s, time) {
    const f = world.field;
    return world.outages.power(s.x, s.y, s.z, 2.1, time) >= 0.5 && f.sectorLight(s.x, s.y, s.z, time) >= 0.5;
  }

  // ── o sensor: o sinal mais forte do que ele escuta ──
  const strength = (d, R) => Math.max(0, 1 - d / R);

  function listen(g, time) {
    const F = world.field;
    let best = null;
    const consider = (x, y, z, R, lead = false) => {
      const k = strength(Math.hypot(x - g.x, y - g.y, z - g.z), R) * (lead ? 1.4 : 1);
      if (k > 0 && (!best || k > best.k)) best = { x, y, z, k: Math.min(1, k), lead };
    };
    if (sensor === 'terminal') {
      for (const s of terminalSitesNear(F, g.x, g.y, g.z, RANGE.terminal)) if (s.kind !== 'unique') consider(s.x, s.y + 1, s.z, RANGE.terminal, ctx.leads?.isOpenTarget(s.id));
      for (const u of F.uniquesNear(g.x, g.y, g.z, RANGE.unique)) {
        const s = uniqueTerminal(F, u);
        consider(s.x, s.y + 1, s.z, RANGE.unique, ctx.leads?.isOpenTarget(s.id));
      }
    } else if (sensor === 'energy') {
      // energia viva: o setor com energia mais perto (e as tomadas carregadas)
      for (let r = 100; r <= RANGE.energy; r += 110) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + r * 0.01;
          const x = g.x + Math.cos(a) * r;
          const z = g.z + Math.sin(a) * r;
          if (F.sectorLight(x, g.y, z, time) >= 0.5 && world.outages.power(x, g.y, z, 2, time) >= 0.5) consider(x, g.y, z, RANGE.energy);
        }
        if (best) break; // o anel mais perto que tiver energia
      }
      for (const s of world.sockets()) if (socketPowered(s, time)) consider(s.x, s.y, s.z, RANGE.energy);
      for (const u of F.uniquesNear(g.x, g.y, g.z, RANGE.unique)) consider(u.x, u.y + 10, u.z, RANGE.unique);
    } else if (sensor === 'motion') {
      // o que se move: máquinas colossais e vagões
      const c = world.colossi.nearest(F, g, time);
      if (c) consider(c.x, c.y, c.z, RANGE.motion);
      for (const car of world.transit.cars.values()) {
        const p = car.group.position;
        consider(p.x + world.origin.x, p.y + world.origin.y, p.z + world.origin.z, RANGE.motion * 0.5);
      }
    }
    return best;
  }

  function draw(time) {
    const e = player.energy.value / player.energy.max;
    const on = !!sensor;
    g2.fillStyle = '#050706';
    g2.fillRect(0, 0, W, H);
    // dez gomos de carga (menores com o sensor ligado: ele usa o resto da tela)
    for (let i = 0; i < 10; i++) {
      const full = e * 10 > i + 0.5;
      g2.fillStyle = full ? (e < 0.15 ? '#c8864a' : '#b8c4b4') : '#1c211d';
      if (on) g2.fillRect(8 + i * 11.3, 4, 8.5, 6);
      else g2.fillRect(8 + i * 11.3, 10, 8.5, 18);
    }
    g2.textBaseline = 'top';
    g2.fillStyle = '#9fae9f';
    let line = '';
    if (plugged) line = socketPowered(plugged, time) ? t('device.charging') : t('device.noPower');
    else if (near) line = t('device.socket', { key: bindings.label('use') });
    else if (e <= 0) line = t('device.empty');
    else if (found > 0) line = t('device.sensorFound', { key: bindings.label('sensor') });
    if (on) {
      g2.font = '10px Consolas, monospace';
      g2.fillText(t(`device.sensor.${sensor}`), 8, 14);
      // a faixa: o sinal aparece do lado de onde vem; atrás, uma seta na borda
      g2.strokeStyle = '#56615a';
      g2.strokeRect(8, 27, 112, 14);
      g2.fillStyle = '#56615a';
      g2.fillRect(63, 27, 2, 3); // o meio: em frente
      // chiado: quanto mais fraco o sinal, mais ruído
      const k = signal?.k ?? 0;
      g2.fillStyle = '#56615a';
      for (let i = 0; i < 40 * (1 - k); i++) g2.fillRect(9 + Math.random() * 110, 28 + Math.random() * 12, 1, 1);
      if (signal) {
        const b = Math.max(-1, Math.min(1, bearing / (Math.PI / 2)));
        const x = 64 - b * 54;
        g2.fillStyle = signal.lead ? '#d7c49a' : '#b8c4b4';
        const h = 3 + 9 * k;
        if (Math.abs(bearing) > Math.PI / 2) {
          // atrás de você: seta na borda
          const L = bearing > 0;
          g2.beginPath();
          g2.moveTo(L ? 10 : 118, 34);
          g2.lineTo(L ? 16 : 112, 30);
          g2.lineTo(L ? 16 : 112, 38);
          g2.fill();
        } else g2.fillRect(x - 1.5, 34 - h / 2, 3, h);
        // acima / abaixo: um triângulo no canto de baixo; no mesmo nível, um traço
        const vx = 118;
        if (vert) {
          g2.beginPath();
          g2.moveTo(vx - 4, vert > 0 ? 55 : 46);
          g2.lineTo(vx + 4, vert > 0 ? 55 : 46);
          g2.lineTo(vx, vert > 0 ? 46 : 55);
          g2.fill();
        } else g2.fillRect(vx - 4, 50, 8, 2);
      }
      if (!line && signal?.lead) line = t('device.sensor.lead');
      if (line && !(plugged && Math.floor(time * 2) % 2)) g2.fillText(line, 8, 48);
    } else {
      g2.font = '12px Consolas, monospace';
      if (line && !(plugged && Math.floor(time * 2) % 2)) g2.fillText(line, 8, 38);
    }
    tex.needsUpdate = true;
  }

  function toggleLantern() {
    if (!active() || ctx.wake?.active) return;
    lanternOn = !lanternOn;
    audio.deviceClick?.(lanternOn);
  }

  /** Atalho do sensor (G): terminais → energia → movimento → desligado. */
  function cycleSensor() {
    if (!active() || ctx.wake?.active || !hasSensor()) return;
    sensor = sensor === null ? MODES[0] : MODES[MODES.indexOf(sensor) + 1] ?? null;
    signal = null;
    sensorScan = 0;
    redraw = 0;
    audio.deviceClick?.(!!sensor);
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
    if (bindings.is('lantern', e.code)) toggleLantern();
    if (bindings.is('sensor', e.code)) cycleSensor();
    // E é tratado em app/ui.js (terminal primeiro, depois tomada)
  });

  return {
    toggleLantern,
    togglePlug,
    cycleSensor,
    /** Acabou de pegar o sensor: ele já liga, escutando terminais. */
    gotSensor() {
      found = 6;
      sensor = MODES[0];
      sensorScan = 0;
    },
    get lanternOn() {
      return lanternOn;
    },
    get sensorMode() {
      return sensor;
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
      if (sensor && en.value > 0) en.value = Math.max(0, en.value - SENSOR_DRAIN * dt);
      if (en.value <= 0) {
        lanternOn = false;
        sensor = null;
      }
      if (found > 0) found -= dt;

      // o sensor escuta (a cada 0,5 s); a faixa acompanha a cabeça a cada quadro
      if (sensor) {
        sensorScan -= dt;
        if (sensorScan <= 0) {
          sensorScan = 0.5;
          signal = listen(_g, time);
        }
        if (signal) {
          // com folga (histerese), para o triângulo não piscar perto do limite
          const dy = signal.y - _g.y;
          if (Math.abs(dy) > 30) vert = Math.sign(dy);
          else if (Math.abs(dy) < 18) vert = 0;
          const want = Math.atan2(-(signal.x - _g.x), -(signal.z - _g.z)) - controls.yaw;
          const d = Math.atan2(Math.sin(want - bearing), Math.cos(want - bearing));
          bearing += d * Math.min(1, dt * 6);
          bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
        }
      }

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
        redraw = sensor ? 0.08 : 0.25;
        draw(time);
      }
    },
  };
}
