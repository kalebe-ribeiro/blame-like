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
import { createHands } from './hands.js';

// (a célula rende o triplo do que rendia — pedido do usuário, 2026-10-01: "a bateria acaba muito rápido")
const DRAIN = 1 / 1260; // lanterna: carga cheia dura 21 min
const SENSOR_DRAIN = 1 / 2700; // sensor ligado: carga cheia dura 45 min
const CHARGE = 1 / 25; // tomada: de vazio a cheio em 25 s
const REACH = 2.2; // m até a tomada
// A lanterna é um FACHO (uFlash* nos shaders — ver flashProfile em shaders/chunks.js):
// cone com miolo quente, anel do refletor, alcance de ~30 m, visível na poeira.
// Além dele, só um resto de luz rebatida perto do corpo (a luz 'carried' do LightRig).
const FLASH = 150; // intensidade do facho
const FLASH_COLOR = new THREE.Vector3(1.0, 0.94, 0.84); // branco quente de lâmpada velha, pouco saturado
const SPILL = 0.35; // luz rebatida em volta (o facho batendo nas coisas perto)
const HAND_LAG = 11; // 1/s: o facho segue o olhar com um pouco de atraso (a mão)
const AIM = 14; // m: a mão aponta o facho para onde os olhos olham, a essa distância
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
  device.position.set(0.14, -0.1, -0.32);
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
  device.add(body, screen);
  // (as quinas de borracha e o conector de trás — o rework gráfico, frente 4)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.046, 0.018), m.cable ?? m.machine);
      c.position.set(sx * 0.038, 0, sz * 0.073);
      device.add(c);
    }
  }
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.016, 8), m.machine);
  plug.rotation.x = Math.PI / 2;
  plug.position.set(0.02, 0, 0.086);
  device.add(plug);

  // ── a lanterna: um objeto à parte, na mão esquerda ──
  //  Guardada (fora da vista, embaixo) até ser ligada: sobe para a frente, e
  //  só então o facho acende; ao desligar, apaga e desce. Aponta para onde o
  //  facho vai (com o mesmo atraso da mão).
  const flashlight = new THREE.Group();
  const tube = new THREE.CylinderGeometry(0.015, 0.016, 0.12, 12);
  tube.rotateX(Math.PI / 2);
  const headGeo = new THREE.CylinderGeometry(0.025, 0.017, 0.04, 14);
  headGeo.rotateX(Math.PI / 2);
  const bezelGeo = new THREE.TorusGeometry(0.023, 0.003, 6, 18);
  const lensGeo = new THREE.CircleGeometry(0.021, 18);
  const flBody = new THREE.Mesh(tube, m.machine);
  const flHead = new THREE.Mesh(headGeo, m.machine);
  flHead.position.z = -0.078;
  const bezel = new THREE.Mesh(bezelGeo, m.machine);
  bezel.position.z = -0.098;
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0b }); // a lente: escura apagada, acesa quando o facho acende
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.z = -0.0985;
  lens.rotation.y = Math.PI; // a face para a frente (−z)
  const knurl = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.035, 8), m.machine); // a empunhadura
  knurl.rotation.x = Math.PI / 2;
  knurl.position.z = 0.03;
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.012), m.machine);
  button.position.set(0, 0.016, -0.02);
  flashlight.add(flBody, flHead, bezel, lens, knurl, button);
  // (o rework gráfico, frente 4: os anéis da empunhadura e a tampa de trás)
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0168, 0.0016, 5, 14), m.machine);
    ring.position.z = 0.017 + i * 0.013;
    flashlight.add(ring);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.012, 12), m.machine);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.066;
  flashlight.add(tail);
  flashlight.visible = false;
  // guardada · na mão (em relação à câmera); x vira de lado conforme a mão (−1 esquerda, 1 direita)
  const FL_DOWN = new THREE.Vector3(0.2, -0.36, -0.2);
  const FL_UP = new THREE.Vector3(0.15, -0.1, -0.34); // (a mão e o antebraço à vista no canto — app/limbs.js)
  const _flDown = new THREE.Vector3();
  const _flUp = new THREE.Vector3();
  const _qDowns = { 1: new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, -0.5, -0.4)), [-1]: new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, 0.5, 0.4)) };
  let flSide = -1; // a mão da lanterna (a última em que esteve, para ela descer pelo mesmo lado)
  const _qAim = new THREE.Quaternion();
  const _qCam = new THREE.Quaternion();
  const _m4 = new THREE.Matrix4();
  const _zero = new THREE.Vector3();
  const LENS_ON = new THREE.Color(1.0, 0.94, 0.84);
  const LENS_OFF = new THREE.Color(0.045, 0.045, 0.042);
  let raise = 0; // 0 guardada · 1 na mão
  let lanternWant = false; // o que o jogador pediu (o facho só acende quando a mão chega)
  camera.add(device);
  camera.add(flashlight);
  // as mãos: seguram o aparelho e a lanterna; agarram as quinas (app/hands.js)
  const hands = createHands(ctx, { device, flashlight });
  let stow = 0; // 0 nas mãos · 1 guardados (pendurado numa quina, subindo)

  let lanternOn = false; // o facho aceso
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
  let note = null; // aviso curto na telinha: { text, until } (say())
  let nearSub = null; // a subestação ao alcance (app/power.js)
  const _g = new THREE.Vector3();
  const _lens = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const flashDir = new THREE.Vector3(0, 0, -1);
  const sh = world.shared;

  /** A tomada tem energia? (setor não apagado, sem apagão, onda do instável em alta) */
  function socketPowered(s, time) {
    const f = world.field;
    return world.outages.power(s.x, s.y, s.z, 2.1, time) >= 0.5 && f.sectorLight(s.x, s.y, s.z, time) >= 0.5;
  }

  // ── o sensor: o sinal mais forte do que ele escuta ──
  const strength = (d, R) => Math.max(0, 1 - d / R);

  function listen(g, time) {
    // a antena de transmissão (app/uniques.js) amplia o alcance
    const boost = ctx.uniques?.sensorBoost() ?? 1;
    const RR = (k) => RANGE[k] * boost;
    const F = world.field;
    let best = null;
    const consider = (x, y, z, R, lead = false) => {
      const k = strength(Math.hypot(x - g.x, y - g.y, z - g.z), R) * (lead ? 1.4 : 1);
      if (k > 0 && (!best || k > best.k)) best = { x, y, z, k: Math.min(1, k), lead };
    };
    if (sensor === 'terminal') {
      for (const s of terminalSitesNear(F, g.x, g.y, g.z, RR('terminal'))) if (s.kind !== 'unique') consider(s.x, s.y + 1, s.z, RR('terminal'), ctx.leads?.isOpenTarget(s.id));
      for (const u of F.uniquesNear(g.x, g.y, g.z, RR('unique'))) {
        const s = uniqueTerminal(F, u);
        consider(s.x, s.y + 1, s.z, RR('unique'), ctx.leads?.isOpenTarget(s.id));
      }
    } else if (sensor === 'energy') {
      // energia viva: o setor com energia mais perto (e as tomadas carregadas)
      for (let r = 100; r <= RR('energy'); r += 110) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + r * 0.01;
          const x = g.x + Math.cos(a) * r;
          const z = g.z + Math.sin(a) * r;
          if (F.sectorLight(x, g.y, z, time) >= 0.5 && world.outages.power(x, g.y, z, 2, time) >= 0.5) consider(x, g.y, z, RR('energy'));
        }
        if (best) break; // o anel mais perto que tiver energia
      }
      for (const s of world.sockets()) if (socketPowered(s, time)) consider(s.x, s.y, s.z, RR('energy'));
      for (const u of F.uniquesNear(g.x, g.y, g.z, RR('unique'))) consider(u.x, u.y + 10, u.z, RR('unique'));
    } else if (sensor === 'motion') {
      // o que se move: máquinas colossais e vagões
      const c = world.colossi.nearest(F, g, time, (m) => !m.stopped); // (a parada não se move)
      if (c) consider(c.x, c.y, c.z, RR('motion'));
      for (const car of world.transit.cars.values()) {
        if (world.transit.stoppedForGood(car.line)) continue; // (a linha parada de vez não se move mais)
        const p = car.group.position;
        consider(p.x + world.origin.x, p.y + world.origin.y, p.z + world.origin.z, RR('motion') * 0.5);
      }
      // os Safeguards (fase 6): no escuro, o sensor é o jeito de saber que um está perto
      for (const e of world.safeguards?.all() ?? []) consider(e.feet.x, e.feet.y + 1.5, e.feet.z, RR('motion') * 0.2);
      // os andarilhos (fase 7) também se movem
      for (const e of world.npcs?.wanderers.values() ?? []) consider(e.feet.x, e.feet.y + 1.2, e.feet.z, RR('motion') * 0.15);
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
    // a vida, ao lado da carga (V1 — app/health.js): um traço contínuo, só quando muda (V2)
    const hl = ctx.health;
    if (hl?.visible) {
      const v = hl.value;
      const y = on ? 11 : 31;
      const hh = on ? 2 : 3;
      g2.fillStyle = '#1c211d';
      g2.fillRect(8, y, 110, hh);
      g2.fillStyle = v < 0.35 ? (Math.floor(time * 3) % 2 ? '#c8603c' : '#7a3a26') : '#c9a08a';
      g2.fillRect(8, y, 110 * v, hh);
    }
    g2.textBaseline = 'top';
    g2.fillStyle = '#9fae9f';
    let line = '';
    if (plugged) line = socketPowered(plugged, time) ? t('device.charging') : t('device.noPower');
    else if (note && time < note.until) line = note.text;
    else if (ctx.arms?.hint) line = ctx.arms.hint;
    else if (ctx.gene?.hint) line = ctx.gene.hint;
    else if (nearSub) line = world.substations.isLive(nearSub.site) ? t('device.substationLive') : t('device.substation', { key: bindings.label('use') });
    else if (near) line = t('device.socket', { key: bindings.label('use') });
    else if (ctx.people?.near) line = t('device.talk', { key: bindings.label('use') });
    else if (e <= 0) line = t('device.empty');
    else if (found > 0) line = t('device.sensorFound', { key: bindings.label('sensor') });
    else {
      const cg = ctx.people?.cargoInfo();
      if (cg) line = t('device.cargo', { dist: cg.d < 1000 ? `${Math.round(cg.d)} M` : `${(cg.d / 1000).toFixed(1)} KM` });
    }
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

  /** Liga (a mão traz a lanterna e ela acende) ou desliga (apaga e a mão guarda). */
  function toggleLantern() {
    if (ctx.wake?.active) return; // (no modo Livre também: sem célula, sem gasto)
    // fora da mão: a mão a pega antes (app/inventory.js — a regra das mãos)
    if (!lanternWant) ctx.inventory?.ensure('lantern');
    lanternWant = !lanternWant;
    if (!lanternWant && lanternOn) {
      lanternOn = false;
      audio.deviceClick?.(false);
    }
  }

  /** Atalho do sensor (G): terminais → energia → movimento → desligado. */
  function cycleSensor() {
    if (!active() || ctx.wake?.active || !hasSensor()) return;
    ctx.inventory?.ensure('device'); // o sensor é do aparelho: ele vem para a mão
    sensor = sensor === null ? MODES[0] : MODES[MODES.indexOf(sensor) + 1] ?? null;
    signal = null;
    sensorScan = 0;
    redraw = 0;
    audio.deviceClick?.(!!sensor);
  }

  function togglePlug() {
    if (!active() || ctx.wake?.active) return;
    if (plugged) plugged = null;
    else if (near) {
      ctx.inventory?.ensure('device'); // conectar é com o aparelho na mão
      plugged = near;
    } else return;
    audio.deviceClick?.(!!plugged);
  }

  document.addEventListener('keydown', (e) => {
    if (e.repeat || !controls.locked) return;
    if (bindings.is('lantern', e.code) || bindings.is('torch', e.code)) toggleLantern();
    if (bindings.is('sensor', e.code)) cycleSensor();
    // E é tratado em app/ui.js (terminal primeiro, depois tomada)
  });

  return {
    toggleLantern,
    togglePlug,
    /** As mãos deste lado (app/limbs.js). */
    handGroups: (side) => hands.handGroups(side),
    /** Um aviso curto na telinha do aparelho (s segundos). */
    say(text, s = 3) {
      note = { text, until: (ctx.time ?? 0) + s };
      redraw = 0;
    },
    cycleSensor,
    /** Acabou de pegar o sensor: ele já liga, escutando terminais. */
    gotSensor() {
      found = 6;
      sensor = MODES[0];
      sensorScan = 0;
    },
    get lanternOn() {
      return lanternWant;
    },
    get sensorMode() {
      return sensor;
    },
    update(dt, time) {
      const light = world.carriedLight;
      const awake = !ctx.wake?.active;
      // o aparelho (célula, tomadas, sensor) é da Peregrinação; a lanterna, dos dois modos
      const on = active() && awake;
      // pendurado ou subindo: as duas mãos estão na quina — o aparelho e a lanterna saem
      hands.setKinds(player.armKind);
      hands.update(dt);
      const busy = hands.busy;
      stow = busy ? Math.min(1, stow + dt / 0.18) : Math.max(0, stow - dt / 0.4);
      // em que mão está cada coisa (app/inventory.js); fora das mãos, não aparece nem funciona
      const inv = ctx.inventory;
      const dSide = on ? inv?.sideOf('device') ?? 1 : 0;
      const lSide = inv?.sideOf('lantern') ?? -1;
      if (lSide) flSide = lSide;
      hands.setHolding(dSide, lSide);
      device.visible = !!dSide && stow < 1;
      device.position.set(0.14 * (dSide || 1), -0.1 - 0.32 * stow * stow, -0.32);
      device.rotation.set(0.75, -0.15 * (dSide || 1), 0);
      if (!lSide && lanternWant) {
        // a lanterna foi guardada: apaga
        lanternWant = false;
        lanternOn = false;
      }
      if (!awake) {
        if (light) light.intensity = 0;
        sh.uFlashColor.value.set(0, 0, 0);
        flashlight.visible = false;
        raise = 0;
        return;
      }
      const en = on ? player.energy : { value: 1, max: 1 }; // no Livre: carga infinita
      world.toGlobal(camera.position, _g);
      if (on) {

      // a tomada mais próxima (a cada 0,25 s)
      scan -= dt;
      if (scan <= 0) {
        scan = 0.25;
        nearSub = ctx.power?.near() ?? null;
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
        lanternWant = false;
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

      } // (fim do que é só do aparelho)

      // a mão esquerda: sobe com a lanterna (0,45 s), acende quando chega; desce ao apagar
      // (pendurado, a lanterna desce e apaga; depois de subir, volta acesa)
      if (busy && lanternOn) lanternOn = false;
      raise = lanternWant && !busy ? Math.min(1, raise + dt / 0.45) : Math.max(0, raise - dt / (busy ? 0.18 : 0.35));
      if (lanternWant && !busy && !lanternOn && raise >= 1 && en.value > 0) {
        lanternOn = true;
        audio.deviceClick?.(true);
      }
      flashlight.visible = raise > 0;
      if (flashlight.visible) {
        // subida com um leve passar do ponto (a mão para, a lanterna balança)
        const r = raise;
        const e = lanternWant ? 1 - Math.pow(1 - r, 3) + Math.sin(r * Math.PI) * 0.06 * r : r * r * (3 - 2 * r);
        _flDown.copy(FL_DOWN).setX(FL_DOWN.x * flSide);
        _flUp.copy(FL_UP).setX(FL_UP.x * flSide);
        flashlight.position.lerpVectors(_flDown, _flUp, e);
        // em mãos: aponta para onde vai o facho (no espaço da câmera); guardada: tombada
        camera.getWorldQuaternion(_qCam);
        _m4.lookAt(_zero, flashDir, camera.up); // −z do modelo (a lente) na direção do facho
        _qAim.setFromRotationMatrix(_m4).premultiply(_qCam.invert());
        flashlight.quaternion.slerpQuaternions(_qDowns[flSide], _qAim, e);
      }

      // a lanterna: um facho saindo da lente, na direção do olhar (com o atraso da mão);
      // com pouca carga, falha
      lens.getWorldPosition(_lens);
      camera.getWorldDirection(_fwd);
      // a lente fica embaixo e à direita: mira num ponto à frente dos olhos, não paralela a eles
      _fwd.multiplyScalar(AIM).add(camera.getWorldPosition(_aim)).sub(_lens).normalize();
      flashDir.lerp(_fwd, 1 - Math.exp(-dt * HAND_LAG)).normalize();
      let k = lanternOn ? 1 : 0;
      const e = en.value / en.max;
      if (lanternOn && e < 0.15) {
        const r = Math.sin(time * 37.1) * Math.sin(time * 13.7 + 1.3);
        if (r > 0.6 - e * 3) k *= 0.15;
        k *= 0.55 + e * 3; // e mais fraca
      }
      sh.uFlashPos.value.copy(_lens);
      lensMat.color.copy(LENS_OFF).lerp(LENS_ON, Math.min(1, k));
      sh.uFlashDir.value.copy(flashDir);
      sh.uFlashColor.value.copy(FLASH_COLOR).multiplyScalar(FLASH * k);
      if (light) {
        // o resto: luz rebatida, um palmo à frente da lente
        light.pos.copy(_lens).addScaledVector(flashDir, 1.2);
        light.intensity = SPILL * k;
      }

      redraw -= dt;
      if (on && redraw <= 0) {
        redraw = sensor ? 0.08 : 0.25;
        draw(time);
      }
    },
  };
}
