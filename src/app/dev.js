// ─────────────────────────────────────────────────────────────────────────────
//  Flags de desenvolvimento (ver main.js): --goto, --outage, --collapse,
//  --stats e --check (teste de fumaça). Nada disso roda no `npm start` normal.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { CONCEPTS, NEED } from '../lang/ancient.js';
import { setArchiveTab } from '../ui/archive.js';
import { subDraws } from '../world/batches.js';

export function setupDev(ctx) {
  const { params, world, camera, renderer } = ctx;
  const trigger = (system) => system.trigger(world.toGlobal(camera.position), camera.getWorldDirection(new THREE.Vector3()), ctx.time);

  // --goto=construtores (ou qualquer tipo do painel de transporte)
  if (params.get('goto')) ctx.ui.teleport(params.get('goto'), t(`dest.${params.get('goto')}`));
  // --gounique=village|graveyard|cradle|…: a estrutura única mais perto desse tipo
  if (params.get('gounique')) console.warn('GOUNIQUE: ' + !!ctx.ui.teleport('unica', params.get('gounique'), { uniqueKind: params.get('gounique') }));
  // --outage=4 / --collapse=4: força o acontecimento aos N segundos
  if (params.get('outage')) setTimeout(() => trigger(world.outages), Number(params.get('outage')) * 1000);
  if (params.get('collapse')) setTimeout(() => trigger(world.collapses), Number(params.get('collapse')) * 1000);
  // --lantern: a lanterna já acesa (Peregrinação)
  // --lantern (ou --lantern=N: aos N s — para ver a mão trazendo a lanterna)
  if (params.get('lantern')) setTimeout(() => ctx.carried.toggleLantern(), params.get('lantern') === '1' ? 500 : Number(params.get('lantern')) * 1000);
  // --sensor=terminal|energy|motion: com o sensor, já ligado nesse modo (Peregrinação) — só nesta sessão
  if (params.get('sensor')) {
    if (!ctx.player.inventory.includes('sensor')) ctx.player.inventory.push('sensor');
    setTimeout(() => {
      for (const k of ['terminal', 'energy', 'motion']) {
        ctx.carried.cycleSensor();
        if (ctx.carried.sensorMode === params.get('sensor')) break;
      }
    }, 500);
  }
  // --lexicon=1: já entende as palavras até essa classe (1 comuns, 2 incomuns, 3 raras) — só nesta sessão
  if (params.get('lexicon')) {
    const upTo = Number(params.get('lexicon'));
    for (const [w, cls] of Object.entries(CONCEPTS)) if (cls <= upTo) ctx.lexicon.counts[w] = NEED[cls];
  }
  // --archive=records|lexicon: a aba do diário na tela de entrada
  if (params.get('archive')) {
    setArchiveTab(params.get('archive'));
    ctx.travel.renderDiary();
  }
  // --read=12: abre a leitura do terminal em frente aos N segundos
  if (params.get('read')) setTimeout(() => ctx.reading.tryUse(), Number(params.get('read')) * 1000);
  // --ride=6: aos N s, põe o corpo sobre a longarina da máquina colossal mais perto e,
  // 8 s depois, diz no console se ele foi junto (o convés carrega quem está em cima)
  if (params.get('ride')) {
    setTimeout(() => {
      const g = world.toGlobal(camera.position);
      const m = world.colossi.nearest(world.field, g, ctx.time);
      if (!m) return console.warn('RIDE: nenhuma máquina');
      const lat = 45; // a longarina
      const top = m.lane.b.bottom + 38 + 1.75;
      const x = m.lane.axis === 'x' ? m.x : m.x + lat;
      const z = m.lane.axis === 'x' ? m.z + lat : m.z;
      ctx.controls.setMode('walk');
      ctx.controls.setView({ pos: new THREE.Vector3(x, top, z).sub(world.origin), yaw: 0, pitch: -0.3, scale: 1 });
      const p0 = world.toGlobal(camera.position).clone();
      setTimeout(() => {
        const p1 = world.toGlobal(camera.position);
        const along = m.lane.axis === 'x' ? p1.x - p0.x : p1.z - p0.z;
        console.warn(`RIDE: andou ${along.toFixed(1)} m ao longo em 8 s (a máquina: ${(m.dir * 4 * 8).toFixed(1)}), altura ${(p1.y - p0.y).toFixed(1)} m`);
      }, 8000);
    }, Number(params.get('ride')) * 1000);
  }
  // --mark=8: pinta uma marca onde se olha aos N s
  if (params.get('mark')) setTimeout(() => ctx.marks.toggle(), Number(params.get('mark')) * 1000);
  // --restore=8: religa o setor da subestação em frente aos N s
  if (params.get('restore')) setTimeout(() => ctx.power.tryUse(), Number(params.get('restore')) * 1000);
  // --controls=3: abre a aba CONTROLES aos N segundos
  if (params.get('controls')) setTimeout(() => ctx.ui.openControls(), Number(params.get('controls')) * 1000);
  // --map=20: abre o mapa da travessia aos N segundos
  if (params.get('map')) setTimeout(() => ctx.ui.toggleMap(), Number(params.get('map')) * 1000);
  // --wake=4: desmaio (queda fatal) aos N segundos — para ver a sequência de despertar
  if (params.get('wake')) setTimeout(() => ctx.wake.start('impact'), Number(params.get('wake')) * 1000);

  // --body=6: aos N s, um corpo de teste (fase 5) na plataforma ou passarela mais perto,
  // andando até um lugar a ~--bodydist m (padrão 200); --follow: a câmera vai atrás dele
  if (params.get('body')) {
    setTimeout(() => {
      const e = ctx.beings.spawnTest(world.toGlobal(camera.position), Number(params.get('bodydist') ?? 200), Number(params.get('bodyseed') ?? 1));
      console.warn(e ? `BODY: caminho de ${Math.round(e.path?.length ?? 0)} m, ${e.path?.pts.length ?? 0} pontos, estado ${e.state}` : 'BODY: nenhum lugar por perto');
      if (e && params.get('follow')) followBody(ctx, e);
      // o rastro do corpo no terminal, a cada 2 s
      if (e) {
        const iv = setInterval(() => {
          if (!world.entities.list.has(e.id)) return clearInterval(iv);
          const p = e.path?.pts[e.pi];
          console.warn(`BODY ${e.state} ${e.pi}/${e.path?.pts.length} pés ${[e.feet.x, e.feet.y, e.feet.z].map((v) => v.toFixed(1))} alvo ${p ? [p.x, p.y, p.z].map((v) => v.toFixed(1)) : '-'} vel ${e.speed.toFixed(2)} parado ${e.stuckT.toFixed(1)} chão ${e.walker.grounded} · ${e.why ?? ''}`);
        }, 2000);
      }
    }, Number(params.get('body')) * 1000);
  }

  // --sgwatch: o estado dos Safeguards no terminal a cada 3 s (fase 6)
  if (params.get('sgwatch')) {
    setInterval(() => {
      const sg = world.safeguards;
      const g = world.toGlobal(camera.position);
      let near = null;
      for (const e of sg.all()) {
        const d = e.feet.distanceTo(g);
        if (!near || d < near.d) near = { e, d };
      }
      console.warn(`SG: ${sg.enabled ? 'ligados' : 'desligados'} · ${sg.byTerritory.size} rondas · ${sg.hunters.size} caçadores · sem ronda ${sg.none.size} · fila ${sg.queue.length}` +
        (near ? ` · mais perto ${near.d.toFixed(0)} m (${near.e.sg.state}, ${near.e.tier}) em ${[near.e.feet.x, near.e.feet.y, near.e.feet.z].map((v) => v.toFixed(0))}` : '') + ` · vistos ${sg.stats.spotted} pegos ${sg.stats.caught} perdidos ${sg.stats.lost} saídos ${sg.stats.emerged}`);
    }, 3000);
  }
  // --sgnear=N: aos N s, o jogador é posto a --sgdist m (padrão 25) do Safeguard de ronda mais perto,
  // olhando para ele; --sgemerge=N: aos N s, força a saída de 1 caçador de uma parede
  if (params.get('sgnear')) {
    setTimeout(() => {
      const g = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.safeguards.byTerritory.values()) {
        const d = e.feet.distanceTo(g);
        if (!near || d < near.d) near = { e, d };
      }
      if (!near) return console.warn('SGNEAR: nenhum');
      const e = near.e;
      const D = Number(params.get('sgdist') ?? 25);
      // um ponto do próprio circuito, D m à frente dele: de frente para quem vem
      const c = e.sg.c;
      const { circuitAt } = world.safeguards._circ;
      const p = circuitAt(c, e.sg.s + D);
      ctx.controls.setMode('walk');
      const yaw = Math.atan2(-(e.feet.x - p.x), -(e.feet.z - p.z));
      ctx.controls.setView({ pos: new THREE.Vector3(p.x, p.y + 1.7, p.z).sub(world.origin), yaw, pitch: -0.05, scale: 1 });
      console.warn(`SGNEAR: posto a ${D} m de ${e.id}`);
    }, Number(params.get('sgnear')) * 1000);
  }
  // --strikepose=w,s: o Safeguard mais perto fica na pose do golpe (para capturas — world/bodies.js strike)
  // (--strikepose=cycle,N: aos N s ele para e as três poses — parado, preparando, golpeando — são
  //  capturadas lado a lado no mesmo lugar: strike-rest/wind/swing.png ao lado da --capture; e ferido: strike-hurt.png)
  if (params.get('strikepose')?.startsWith('cycle')) {
    const at = Number(params.get('strikepose').split(',')[1] ?? 14);
    const shot = (name) => /** @type {any} */ (window).cybercosmic?.devCapture?.(name);
    setTimeout(async () => {
      const g0 = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.safeguards.all()) if (!near || e.feet.distanceTo(g0) < near.feet.distanceTo(g0)) near = e;
      if (!near) return console.warn('STRIKEPOSE: nenhum');
      near.sg.state = 'grab'; // (parado: o 'grab' só zera a velocidade)
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const [n, pose] of [['rest', null], ['wind', { w: 1, s: 0 }], ['swing', { w: 1, s: 1 }]]) {
        near.strikePose = pose;
        await wait(700);
        await shot(`strike-${n}.png`);
      }
      near.strikePose = null;
      // ferido (o cofre, Dano-do-emissor §4): a pose de recuo no meio, e as faíscas do peito
      const keep = setInterval(() => (near.staggerT = 0.3), 10);
      const THREE_ = await import('three');
      ctx.beam.fx.hitSparks(new THREE_.Vector3(near.feet.x, near.feet.y + 1.3, near.feet.z), 40);
      await wait(120);
      await shot('strike-hurt.png');
      clearInterval(keep);
      near.sg.state = 'patrol';
    }, at * 1000);
  } else if (params.get('strikepose')) {
    const [pw, ps] = params.get('strikepose').split(',').map(Number);
    const tick = () => {
      requestAnimationFrame(tick);
      const g0 = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.safeguards.all()) if (!near || e.feet.distanceTo(g0) < near.feet.distanceTo(g0)) near = e;
      if (near) near.strikePose = { w: pw, s: ps };
    };
    tick();
  }
  // --chambercam=N: aos N s, a câmera dentro da câmara de reconstrução mais perto, olhando o berço (capturas)
  if (params.get('chambercam')) {
    setTimeout(() => {
      const g = world.toGlobal(camera.position);
      let u = null;
      for (const x of world.field.uniquesNear(g.x, g.y, g.z, 90000)) if (x.kind === 'chamber' && (!u || Math.hypot(x.x - g.x, x.z - g.z) < Math.hypot(u.x - g.x, u.z - g.z))) u = x;
      if (!u) return console.warn('CHAMBERCAM: nenhuma');
      const b = world.field.chamberBed(u);
      const fx = Math.sin(b.yaw);
      const fz = Math.cos(b.yaw);
      // do lado da porta, 6 m do berço, um pouco de lado, na altura dos olhos
      const p = new THREE.Vector3(b.x + fx * 6 + fz * 2, u.y + 1.2 + 1.7, b.z + fz * 6 - fx * 2);
      ctx.controls.setMode('fly');
      const yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z));
      ctx.controls.setView({ pos: p.sub(world.origin), yaw, pitch: -0.12, scale: 1 });
      console.warn('CHAMBERCAM: ' + u.id);
    }, Number(params.get('chambercam')) * 1000);
  }
  // --vaultcam=N: aos N s, a câmera no depósito do gene mais perto da origem, olhando o pedestal (capturas);
  // --endingshow=destroy|village: aos 6 s, a tela do fim
  if (params.get('vaultcam')) {
    setTimeout(async () => {
      const { vaultsNear } = await import('../gen/gene.js');
      const vs = vaultsNear(world.field, 0, 0, 0, 160000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const v = vs.find((x) => world.field.vaultGuarded(x)) ?? vs[0];
      if (!v) return console.warn('VAULTCAM: nenhum');
      const ped = world.field.vaultPedestal(v);
      const d = v.door;
      const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
      const p = new THREE.Vector3(ped.x + ax[0] * 3, v.y + 1.2 + 1.6, ped.z + ax[1] * 3);
      ctx.controls.setMode('fly');
      const yaw = Math.atan2(-(ped.x - p.x), -(ped.z - p.z));
      ctx.controls.setView({ pos: p.sub(world.origin), yaw, pitch: -0.2, scale: 1 });
      world.safeguards.senses = () => null;
      ctx.rules = { ...ctx.rules, safeguards: false }; // (ninguém na frente da câmera)
      console.warn('VAULTCAM: ' + v.id);
    }, Number(params.get('vaultcam')) * 1000);
  }
  if (params.get('endingshow')) setTimeout(() => ctx.gene.showEnding(params.get('endingshow')), 6000);
  // --sparkshot=N: dos N s em diante, as faíscas de um ser ferido (beamfx hitSparks) a 2 m à frente da câmera,
  // a cada 0,15 s, para a captura conferir que se veem
  if (params.get('sparkshot')) {
    setTimeout(() => {
      const tick = () => {
        const f = new THREE.Vector3();
        camera.getWorldDirection(f);
        const g = world.toGlobal(camera.position).addScaledVector(f, 2.5).add(new THREE.Vector3(0, 0.5, 0));
        ctx.beam.fx.hitSparks(g);
      };
      setInterval(tick, 150);
    }, Number(params.get('sparkshot')) * 1000);
  }
  // --buildercam=N: vai aos Construtores; aos N s, a câmera presa ao pórtico de um canteiro que anda
  // (olhando uma perna, de perto) e duas capturas com 1,5 s de diferença: builder-a.png, builder-b.png —
  // com o desenho preso ao objeto, as placas não andam pela perna (shaders/materials.js movingMaterial)
  if (params.get('buildercam')) {
    setTimeout(() => ctx.ui.teleport('construtores', 'construtores'), 2000);
    setTimeout(async () => {
      const B = world.builders;
      // um pórtico que ainda vai andar um bom trecho (o alvo longe de onde ele está)
      const far = (x) => {
        const t = x.task?.cell && B._cellPos(x, x.task.cell);
        return t ? Math.abs((x.def.axis === 'x' ? t.z : t.x) - (x.gx ?? 0)) : 0;
      };
      const live = [...B.sites.values()].filter((x) => !x.dead && x.task?.phase === 'move').sort((a, b) => far(b) - far(a));
      const site = live[0] ?? [...B.sites.values()].find((x) => !x.dead);
      if (!site) return console.warn('BUILDERCAM: nenhum');
      const shot = (name) => /** @type {any} */ (window).cybercosmic?.devCapture?.(name);
      // (o pórtico 25 m para trás: ele volta andando a 3 m/s enquanto as capturas são feitas)
      site.gx = (site.gx ?? 0) - 25;
      if (site.task) site.task.phase = 'move';
      ctx.controls.canFly = true; // (voando: o corpo não cai — a câmera fica presa ao pórtico)
      ctx.controls.setMode('fly');
      ctx.player.energy.value = 1;
      if (!ctx.carried.lanternOn) ctx.carried.toggleLantern(); // (a lanterna: a perna iluminada de perto)
      let on = true;
      const tick = () => {
        if (!on) return;
        requestAnimationFrame(tick);
        // a perna +SPAN/2 do pórtico, no mundo; a câmera 9 m ao lado dela, 25 m acima do chão
        const leg = new THREE.Vector3(0, 25, 0);
        if (site.def.axis === 'x') leg.x = 75;
        else leg.z = 75;
        site.gantry.updateMatrixWorld(true);
        const wpos = leg.clone().applyMatrix4(site.gantry.matrixWorld);
        const off = site.def.axis === 'x' ? new THREE.Vector3(0, 0, 5) : new THREE.Vector3(5, 0, 0);
        camera.position.copy(wpos).add(off);
        const d = off.clone().negate();
        ctx.controls.yaw = Math.atan2(-d.x, -d.z);
        ctx.controls.pitch = 0;
      };
      tick();
      console.warn('BUILDERCAM: ' + site.def.id + ' ' + site.task?.phase);
      await new Promise((r) => setTimeout(r, 2500));
      const g0 = site.gx ?? 0;
      await shot('builder-a.png');
      await new Promise((r) => setTimeout(r, 2000));
      await shot('builder-b.png');
      console.warn('BUILDERCAM: o pórtico andou ' + ((site.gx ?? 0) - g0).toFixed(2) + ' m entre as capturas (faltava ' + far(site).toFixed(1) + ')');
    }, Number(params.get('buildercam')) * 1000);
  }
  // --cutcar=N: vai a um transportador; aos N s corta a parede cega de um vagão (não essencial) e a câmera
  // o acompanha de lado — duas capturas com 2 s: cutcar-a.png, cutcar-b.png (o furo anda com o vagão)
  if (params.get('cutcar')) {
    setTimeout(() => ctx.ui.teleport('transportador', 'transportador'), 2000);
    setTimeout(async () => {
      const T = world.transit;
      const car = [...T.cars.values()].sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0))[0];
      if (!car) return console.warn('CUTCAR: nenhum');
      const shot = (name) => /** @type {any} */ (window).cybercosmic?.devCapture?.(name);
      car.group.updateMatrixWorld(true);
      const W = 4; // (a largura do vagão, mais ou menos: o corte atravessa a parede cega, x > 0)
      const c = new THREE.Vector3(W / 2, 2, 0).applyMatrix4(car.group.matrixWorld).add(world.origin);
      const dw = new THREE.Vector3(1, 0, 0).transformDirection(car.group.matrixWorld);
      const a = c.clone().addScaledVector(dw, -3);
      const b = c.clone().addScaledVector(dw, 3);
      world.addCut({ a: a.toArray(), b: b.toArray(), r: 1.4 }, a, { now: true });
      ctx.controls.canFly = true;
      ctx.controls.setMode('fly');
      const tick = () => {
        requestAnimationFrame(tick);
        car.group.updateMatrixWorld(true);
        const p = new THREE.Vector3(W / 2 + 9, 2.2, 0).applyMatrix4(car.group.matrixWorld);
        const t = new THREE.Vector3(W / 2, 2, 0).applyMatrix4(car.group.matrixWorld);
        camera.position.copy(p);
        const d = t.sub(p);
        ctx.controls.yaw = Math.atan2(-d.x, -d.z);
        ctx.controls.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      };
      tick();
      console.warn('CUTCAR: ' + car.line.id + ':' + car.k + ' ' + JSON.stringify(world.dyn.info('car:' + car.line.id + ':' + car.k)));
      await new Promise((r) => setTimeout(r, 1500));
      const t0 = car.t;
      await shot('cutcar-a.png');
      await new Promise((r) => setTimeout(r, 2000));
      await shot('cutcar-b.png');
      console.warn('CUTCAR: o vagão andou ' + Math.abs(car.t - t0).toFixed(1) + ' m');
    }, Number(params.get('cutcar')) * 1000);
  }
  // --cutobj=col|car|lift|gantry: uma estrutura ativa recebe TRÊS cortes encavalados (fora do essencial) e a
  // câmera, presa a ela, olha o furo de viés: cutobj-<tipo>.png — as faces em brasa em todos (nada oco)
  if (params.get('cutobj')) {
    const kind = params.get('cutobj');
    const place = { col: 'colosso', colcore: 'colosso', car: 'transportador', lift: 'poco', gantry: 'construtores' }[kind];
    setTimeout(() => ctx.ui.teleport(place, place), 2000);
    setTimeout(async () => {
      const shot = (name) => /** @type {any} */ (window).cybercosmic?.devCapture?.(name);
      const g0 = world.toGlobal(camera.position.clone());
      const near = (list, pos) => list.sort((a, b) => pos(a).distanceTo(g0) - pos(b).distanceTo(g0))[0];
      // o objeto: a raiz, o id, o ponto (local) do furo, a direção do corte, o raio, e a câmera (local)
      let o = null;
      if (kind === 'col') {
        const m = near([...world.colossi.machines.values()], (x) => x.pos);
        if (m) o = { root: m.group, id: `col:${m.lane.id}:${m.k}`, p: [40, 4, 95], dir: [0, 1, 0], r: 2.8, cam: [40, 10, 103], half: 20 };
      } else if (kind === 'colcore') {
        // o bloco central (dentro da trincheira, acima do fundo da laje): a face da frente, de viés
        const m = near([...world.colossi.machines.values()], (x) => x.pos);
        const Hc = 56 - 18 + 14;
        if (m) o = { root: m.group, id: `col:${m.lane.id}:${m.k}`, p: [8, Hc / 2 + 2, 30], dir: [0, 0, -1], r: 2.8, cam: [15, Hc / 2 + 6, 44], half: 30 };
      } else if (kind === 'car') {
        const c = [...world.transit.cars.values()][0];
        if (c) o = { root: c.group, id: `car:${c.line.id}:${c.k}`, p: [2, 2, 2], dir: [1, 0, 0], r: 1.2, cam: [8, 3.2, 5], half: 4 };
      } else if (kind === 'lift') {
        const c = [...world.elevators.cars.values()][0];
        if (c) o = { root: c.group, id: `lift:${c.def.id}`, p: [0, -0.4, 0], dir: [0, 1, 0], r: 0.9, cam: [2.5, 3, 3.5], half: 4 };
      } else if (kind === 'gantry') {
        const s = [...world.builders.sites.values()].find((x) => !x.dead);
        if (s) {
          const ax = s.def.axis === 'x';
          o = { root: s.gantry, id: `bg:${s.def.id}`, p: ax ? [75, 30, 0] : [0, 30, 75], dir: ax ? [0, 0, 1] : [1, 0, 0], r: 1.4, cam: ax ? [72, 33, 8] : [8, 33, 72], half: 6 };
        }
      }
      if (!o) return console.warn('CUTOBJ: nenhum ' + kind);
      ctx.controls.canFly = true;
      ctx.controls.setMode('fly');
      ctx.player.energy.value = 1;
      if (!ctx.carried.lanternOn) ctx.carried.toggleLantern();
      const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
      const offs = [[0, 0, 0], [0.9 * o.r, 0, 0.5 * o.r], [-0.4 * o.r, 0, 1.1 * o.r]];
      for (const off of offs) {
        o.root.updateMatrixWorld(true);
        // (o desvio de lado: perpendicular à direção do corte)
        const d = V(o.dir);
        const side = Math.abs(d.y) > 0.5 ? V(off) : Math.abs(d.x) > 0.5 ? new THREE.Vector3(0, off[2], off[0]) : new THREE.Vector3(off[0], off[2], 0);
        const c = V(o.p).add(side).applyMatrix4(o.root.matrixWorld).add(world.origin);
        const dw = d.clone().transformDirection(o.root.matrixWorld);
        const a = c.clone().addScaledVector(dw, -o.half);
        // (até onde o feixe chegaria de a: o mesmo trecho de um tiro — gen/beamreach.js)
        const { beamReach } = await import('../gen/beamreach.js');
        const reach = beamReach(world.field, a, dw, 2 * o.half);
        if (reach.t < 2 * o.half) console.warn(`CUTOBJ: o feixe parou a ${reach.t.toFixed(1)} de ${2 * o.half} (${reach.stop})`);
        const b = a.clone().addScaledVector(dw, reach.t);
        world.addCut({ a: a.toArray(), b: b.toArray(), r: o.r }, a, { now: true });
      }
      const caps = [];
      o.root.traverse((m) => m.userData.cutCaps && caps.push(m.geometry.index?.count ?? m.geometry.attributes.position.count));
      const tick = () => {
        requestAnimationFrame(tick);
        o.root.updateMatrixWorld(true);
        const p = V(o.cam).applyMatrix4(o.root.matrixWorld);
        const t = V(o.p).applyMatrix4(o.root.matrixWorld);
        camera.position.copy(p);
        const d = t.sub(p);
        ctx.controls.yaw = Math.atan2(-d.x, -d.z);
        ctx.controls.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      };
      tick();
      const dbg = [...(world.dyn.objs.get(o.id)?.cut?.values() ?? [])].map((st) => st.pieces.map((pc) => (pc.cut ? (pc.caps ? 'F' : 'O') : '-')).join('')); // F: cortada, com faces · O: cortada, oca
      console.warn('CUTOBJ: ' + o.id + ' ' + JSON.stringify(world.dyn.info(o.id)) + ' faces=' + JSON.stringify(caps) + ' peças=' + JSON.stringify(dbg));
      await new Promise((r) => setTimeout(r, 1500));
      await shot(`cutobj-${kind}.png`);
    }, 14000);
  }
  // --hurt=v: aos 5 s a vida vai a v (o aparelho mostra — app/health.js)
  if (params.get('hurt')) setTimeout(() => ctx.health.set(Number(params.get('hurt'))), 5000);
  // --hosetest=N: aos N s, os cabos grossos ('hose' — world/cables.js) em volta: quantos, e se a colisão
  // do corpo bate num deles (um raio do lado de fora, apontado para o meio do tubo); e o corpo empurrado
  // contra ele para (não atravessa). Uma captura: hose.png
  if (params.get('hosetest')) {
    setTimeout(async () => {
      const col = ctx.controls.walker.col;
      const g = world.toGlobal(camera.position.clone());
      const hoses = [];
      for (const L of [world.chunkLayer]) for (const e of L.chunks.values()) for (const m of e.group?.children ?? []) if (m.userData.mat === 'hose') hoses.push(m);
      const cables = [];
      for (const e of world.chunkLayer.chunks.values()) for (const m of e.group?.children ?? []) if (m.userData.mat === 'cable') cables.push(m);
      // o ponto de um cabo grosso mais perto da câmera: um vértice da malha
      let best = null;
      const v = new THREE.Vector3();
      for (const m of hoses) {
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 7) {
          v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          const d = v.distanceTo(camera.position);
          if (!best || d < best.d) best = { d, p: v.clone(), m };
        }
      }
      if (!best) return console.warn(`HOSETEST: nenhum cabo grosso perto (${cables.length} malhas de cabos finos)`);
      // de fora: 3 m acima do ponto, para baixo
      col._t = -1e9;
      col.buildsPerFrame = 600;
      const from = best.p.clone().add(new THREE.Vector3(0, 3, 0));
      col.refresh(from, 20);
      col.buildsPerFrame = 2;
      const hit = col.ray(from, new THREE.Vector3(0, -1, 0), 6);
      const inCol = col.meshes.includes(best.m);
      console.warn(`HOSETEST: ${hoses.length} malhas de cabos grossos · a mais perta a ${best.d.toFixed(0)} m · na colisão do corpo ${inCol} · o raio de cima bate em ${hit ? `${hit.object.userData.mat} a ${hit.distance.toFixed(2)} m` : 'nada'}`);
      // a câmera de lado, olhando o ponto (a captura)
      ctx.controls.canFly = true;
      ctx.controls.setMode('fly');
      ctx.controls.setView({ pos: best.p.clone().add(new THREE.Vector3(4, 2, 4)), yaw: Math.atan2(-4, -4), pitch: -0.35, scale: 1 });
      await new Promise((r) => setTimeout(r, 1500));
      await /** @type {any} */ (window).cybercosmic?.devCapture?.('hose.png');
    }, Number(params.get('hosetest')) * 1000);
  }
  // --holdstats=N: aos N s, o levantamento dos APOIOS (o cofre, Mobilidade §4) nas paredes em volta (40 m):
  // em colunas de parede de 0,5 a 14 m de altura, os rebordos onde cabe a mão (a face recua acima, um
  // topo plano de ≥ 5 cm); uma coluna é "escalável" se tem apoios encadeados (até 1,5 m um do outro)
  // por ≥ 4 m. O console: quantas colunas, quantas com algum apoio, quantas escaláveis, e o que forma
  // os apoios (o material)
  if (params.get('holdstats')) {
    setTimeout(() => {
      const w = ctx.controls.walker;
      const col = w.col;
      col._t = -1e9;
      col.buildsPerFrame = 900;
      const g = camera.position.clone();
      col.refresh(g, 60);
      col.buildsPerFrame = 2;
      const DOWNV = new THREE.Vector3(0, -1, 0);
      const stats = { cols: 0, withHold: 0, climbable: 0, holds: 0, mats: {} };
      const o = new THREE.Vector3();
      for (let r = 3; r <= 40; r += 4) {
        for (let a = 0; a < 36; a++) {
          const ang = (a / 36) * Math.PI * 2 + r * 0.37;
          const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
          // um ponto de chão a r m, e a parede mais perto nessa direção (até 6 m)
          const base = g.clone().addScaledVector(dir, r);
          const fl = col.ray(base.clone().setY(g.y + 1), DOWNV, 12);
          if (!fl || !fl.face || fl.face.normal.y < 0.7) continue;
          const y0 = fl.point.y;
          const wall = col.ray(o.copy(fl.point).setY(y0 + 1.2), dir, 6);
          if (!wall || !wall.face || Math.abs(wall.face.normal.y) > 0.3) continue;
          stats.cols++;
          // de baixo para cima, de 5 em 5 cm: onde a face recua (o rebordo) com um topo plano
          const holds = [];
          let prev = wall.distance;
          for (let h = 0.5; h <= 14; h += 0.05) {
            const hit = col.ray(o.copy(fl.point).setY(y0 + h), dir, 6.5);
            const d = hit && hit.face && Math.abs(hit.face.normal.y) < 0.5 ? hit.distance : Infinity;
            if (d > prev + 0.05 && prev < 6) {
              // o topo do rebordo: um raio para baixo logo além da face de baixo
              const top = col.ray(o.copy(fl.point).addScaledVector(dir, prev + 0.03).setY(y0 + h + 0.25), DOWNV, 0.4);
              if (top && top.face && top.face.normal.y > 0.7) {
                holds.push(h);
                const m = top.object.userData.mat ?? '?';
                stats.mats[m] = (stats.mats[m] ?? 0) + 1;
              }
            }
            prev = d;
          }
          stats.holds += holds.length;
          if (holds.length) stats.withHold++;
          // encadeados: a maior corrida com degraus ≤ 1,5 m, a partir do alcance de pé (≤ 2,25 m)
          let run = 0;
          let best = 0;
          let last = null;
          for (const h of holds) {
            if (last === null ? h <= 2.25 : h - last <= 1.5) run += last === null ? h : h - last;
            else run = 0;
            last = last === null && h > 2.25 ? null : h;
            best = Math.max(best, run);
          }
          if (best >= 4) stats.climbable++;
        }
      }
      const where = world.regionAt(camera.position);
      console.warn(`HOLDSTATS ${where}: ${stats.cols} colunas de parede · com algum apoio ${stats.withHold} · escaláveis (≥ 4 m) ${stats.climbable} · apoios ${stats.holds} · materiais ${JSON.stringify(stats.mats)}`);
    }, Number(params.get('holdstats')) * 1000);
  }
  // --progswitch: quais materiais trocam de programa de shader entre as chamadas renderer.render de um
  // quadro (o three reavalia o programa a cada troca: getProgram/getParameters) — a cada 3 s, os piores
  if (params.get('progswitch')) {
    const r = ctx.renderer;
    const props = r.properties;
    const last = new WeakMap();
    const count = new Map();
    let mats = [];
    setInterval(() => {
      const s = new Set();
      ctx.scene.traverse((o) => o.material && (Array.isArray(o.material) ? o.material.forEach((m) => s.add(m)) : s.add(o.material)));
      mats = [...s];
    }, 1000);
    // dentro de um render: o programa de um material mudou de um objeto para o outro?
    const rbd = r.renderBufferDirect.bind(r);
    r.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
      const before = props.get(material)?.currentProgram;
      const out = rbd(camera, scene, geometry, material, object, group);
      const after = props.get(material)?.currentProgram;
      if (before && after && before !== after) {
        const a = (before.cacheKey ?? '').split(',');
        const b = (after.cacheKey ?? '').split(',');
        // quem é: o material no mundo (world.materials) e o caminho de pais do objeto
        const wm = Object.entries(world.materials).find(([, v]) => v === material)?.[0] ?? (material.defines?.USE_OBJECT_PATTERN ? 'movendo' : '?');
        const path = [];
        for (let o = object; o && path.length < 4; o = o.parent) path.push(o.name || o.type + (o.userData?.mat ? ':' + o.userData.mat : '') + (o.isBatchedMesh ? '[lote]' : ''));
        const k = `${wm} em ${path.join(' < ')}: ${a.filter((x) => !b.includes(x)).slice(0, 2).join('|') || '·'}→${b.filter((x) => !a.includes(x)).slice(0, 2).join('|') || '·'}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
      return out;
    };
    const render = r.render.bind(r);
    let calls = 0;
    const kinds = new Map();
    r.render = (scene, cam) => {
      const t0 = performance.now();
      const out = render(scene, cam);
      calls++;
      const rt = r.getRenderTarget();
      const k = `${scene === ctx.scene ? 'CENA' : scene.name || scene.type + '(' + scene.children.length + ')'} · ${cam.name || cam.type} · ${rt ? `alvo ${rt.width}×${rt.height}` : 'tela'}`;
      const v = kinds.get(k) ?? { n: 0, ms: 0 };
      v.n++;
      v.ms += performance.now() - t0;
      kinds.set(k, v);
      for (const m of mats) {
        const p = props.get(m)?.currentProgram;
        if (!p) continue;
        const was = last.get(m);
        if (was && was !== p) {
          const k = `${m.type}${m.name ? ':' + m.name : ''} ${(was.cacheKey ?? '').split(',').filter((x, i, a) => !(p.cacheKey ?? '').split(',').includes(x)).slice(0, 3).join('|')} → ${(p.cacheKey ?? '').split(',').filter((x) => !(was.cacheKey ?? '').split(',').includes(x)).slice(0, 3).join('|')}`;
          count.set(k, (count.get(k) ?? 0) + 1);
        }
        last.set(m, p);
      }
      return out;
    };
    setInterval(() => {
      const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.warn(`PROGSWITCH ${calls} chamadas em 3 s · ${[...count.values()].reduce((a, b) => a + b, 0)} trocas · ${top.map(([k, v]) => `${v}× ${k}`).join(' ;; ') || '—'}`);
      console.warn(`PROGSWITCH chamadas por tipo (3 s): ${[...kinds].sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => `${v.n}× ${k} = ${v.ms.toFixed(0)} ms`).join(' ;; ')}`);
      kinds.clear();
      count.clear();
      calls = 0;
    }, 3000);
  }
  // --hitch: cada quadro de mais de 150 ms vai para o console, com o que apareceu nele — programas de
  // shader novos (e quais: compilar trava), geometrias e texturas novas
  if (params.get('hitch')) {
    let last = performance.now();
    let progs = 0;
    let geos = 0;
    let texs = 0;
    const seen = new Set();
    const t0 = performance.now();
    let heap = 0;
    // as tarefas longas do navegador (fora do quadro também: mensagens de worker, timers, coleta de lixo)
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.duration > 120) console.warn(`HITCH tarefa longa ${e.duration.toFixed(0)} ms aos ${((e.startTime - t0) / 1000).toFixed(1)} s (${e.name})`);
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
    // (a cada quadro DESENHADO — app.js frameHooks: um rAF pode passar a vez)
    const tick = () => {
      const now = performance.now();
      const info = ctx.renderer.info;
      const P = info.programs ?? [];
      const fresh = P.filter((p) => !seen.has(p));
      for (const p of fresh) seen.add(p);
      const h = /** @type {any} */ (performance).memory?.usedJSHeapSize ?? 0;
      if (now - last > 150) {
        const g = world.toGlobal(camera.position.clone());
        console.warn(`HITCH ${(now - last).toFixed(0)} ms aos ${((now - t0) / 1000).toFixed(1)} s @ ${[g.x, g.y, g.z].map(Math.round)} · heap ${(heap / 1e6).toFixed(0)}→${(h / 1e6).toFixed(0)} MB · programas ${progs}→${P.length} (${fresh.map((p) => p.name || p.cacheKey?.slice(0, 40)).join(', ') || '—'}) · geometrias ${geos}→${info.memory.geometries} · texturas ${texs}→${info.memory.textures}`);
      }
      progs = P.length;
      heap = h;
      geos = info.memory.geometries;
      texs = info.memory.textures;
      last = now;
    };
    ctx.frameHooks.add(tick);
  }
  // --sgcam=N: dos N s em diante, a câmera (voando: ninguém percebe) acompanha o Safeguard
  // mais perto de frente, a --sgdist m (padrão 4,5), na altura do peito
  if (params.get('sgcam')) {
    setTimeout(() => {
      const g0 = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.safeguards.all()) {
        const d = e.feet.distanceTo(g0);
        if (!near || d < near.d) near = { e, d };
      }
      if (!near) return console.warn('SGCAM: nenhum');
      const e = near.e;
      const D = Number(params.get('sgdist') ?? 4.5);
      ctx.controls.setMode('fly');
      const tick = () => {
        if (!world.entities.list.has(e.id)) return;
        requestAnimationFrame(tick);
        const fx = -Math.sin(e.yaw);
        const fz = -Math.cos(e.yaw);
        const side = params.get('followside') ? 1 : 0;
        const px = e.feet.x + (side ? fz : fx) * D;
        const pz = e.feet.z + (side ? -fx : fz) * D;
        camera.position.set(px, e.feet.y + (side ? 0.6 : 1.6), pz).sub(world.origin);
        const dx = e.feet.x - px;
        const dz = e.feet.z - pz;
        ctx.controls.yaw = Math.atan2(-dx, -dz);
        ctx.controls.pitch = side ? 0.12 : 0.05;
      };
      tick();
      console.warn(`SGCAM: ${e.id} (${e.sg.state})`);
    }, Number(params.get('sgcam')) * 1000);
  }
  // --talk=N: aos N s, de pé diante do morador mais perto (fase 7), e a conversa aberta;
  // --talkpick=cargo,teach…: escolhe essas opções, uma a cada 1,5 s
  if (params.get('talk')) {
    setTimeout(() => {
      const g = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.npcs.all()) {
        const d = e.feet.distanceTo(g);
        if (!near || d < near.d) near = { e, d };
      }
      if (!near) return console.warn('TALK: ninguém');
      const e = near.e;
      const fx = -Math.sin(e.yaw);
      const fz = -Math.cos(e.yaw);
      ctx.controls.setMode('walk');
      ctx.controls.setView({ pos: new THREE.Vector3(e.feet.x + fx * 2.3, e.feet.y + 1.7, e.feet.z + fz * 2.3).sub(world.origin), yaw: e.yaw + Math.PI, pitch: -0.12, scale: 1 });
      setTimeout(() => {
        console.warn('TALK: ' + ctx.people.tryUse());
        const picks = (params.get('talkpick') ?? '').split(',').filter(Boolean);
        picks.forEach((id, i) => setTimeout(() => {
          document.querySelector(`#talk button[data-id="${id}"]`)?.click();
          console.warn(`TALK ${id}: ${document.querySelector('#talk .talk-line')?.textContent} · carga ${JSON.stringify(ctx.player.carried)}`);
        }, 1500 * (i + 1)));
      }, 1200);
    }, Number(params.get('talk')) * 1000);
  }
  // --wcam=N: a câmera (voando) de frente para o andarilho mais perto (fase 7);
  // --wreveal: ele é vida de silício e se revela
  if (params.get('wcam')) {
    setTimeout(() => {
      const g0 = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.npcs.wanderers.values()) {
        // (na Peregrinação a câmera não voa: de perto, a vida de silício se mostraria — use o modo Livre)
        const d = e.feet.distanceTo(g0);
        if (!near || d < near.d) near = { e, d };
      }
      if (!near) return console.warn('WCAM: nenhum');
      const e = near.e;
      if (params.get('wreveal')) {
        e.npc.silicon = true;
        world.npcs.reveal(e);
        e.npc.state = 'walk';
      }
      ctx.controls.setMode('fly');
      const tick = () => {
        if (!world.entities.list.has(e.id)) return;
        requestAnimationFrame(tick);
        const fx = -Math.sin(e.yaw);
        const fz = -Math.cos(e.yaw);
        const px = e.feet.x + fx * 3.4;
        const pz = e.feet.z + fz * 3.4;
        camera.position.set(px, e.feet.y + 1.4, pz).sub(world.origin);
        ctx.controls.yaw = Math.atan2(-(e.feet.x - px), -(e.feet.z - pz));
        ctx.controls.pitch = -0.05;
      };
      tick();
      let sgd = Infinity;
      for (const x of world.safeguards.all()) sgd = Math.min(sgd, x.feet.distanceTo(e.feet));
      console.warn(`WCAM: ${e.id} (${e.kind}) · Safeguard mais perto a ${sgd.toFixed(1)} m`);
      setTimeout(() => {
        let n = 0;
        e.rig.group.traverse((o) => o.isMesh && n++);
        const wp = e.rig.group.getWorldPosition(new THREE.Vector3());
        console.warn(`WCAM: corpo a ${wp.distanceTo(camera.position).toFixed(2)} m da câmera · ${n} peças · visível ${e.rig.group.visible} · tier ${e.tier} · pés ${e.feet.toArray().map((v) => v.toFixed(1))}`);
      }, 2500);
    }, Number(params.get('wcam')) * 1000);
  }
  // --hang=N: aos N s, de frente para a quina alta mais perto (fase de movimento: quinas),
  // pula e fica pendurado; --hang=N --climbup: e sobe em seguida (1,5 s depois)
  if (params.get('hang')) {
    setTimeout(async () => {
      const { scanLedges } = await import('../dev/climbtest.js');
      const f = scanLedges(ctx);
      const c = params.get('vault') ? f.vault : f.hang;
      if (!c) return console.warn('HANG: nenhuma quina por perto');
      ctx.controls.setMode('walk');
      ctx.controls.setView({ pos: c.feet.clone().setY(c.feet.y + 1.7), yaw: c.yaw, pitch: 0.05, scale: 1 });
      setTimeout(() => {
        ctx.controls.forceInput = { f: 0, r: 0, jump: true };
        setTimeout(() => (ctx.controls.forceInput = { f: 0, r: 0, jump: false }), 150);
        if (params.get('climbup')) setTimeout(() => (ctx.controls.forceInput = { f: 1, r: 0, jump: false }), 1500);
        if (params.get('shimmy')) setTimeout(() => (ctx.controls.forceInput = { f: 0, r: Number(params.get('shimmy')), jump: false }), 1500);
        console.warn(`HANG: quina de ${c.l.h.toFixed(2)} m`);
      }, 700);
    }, Number(params.get('hang')) * 1000);
  }
  // --ledgestats=N: aos N s, por que as paredes em volta (22 m) não são quinas (histograma dos motivos)
  if (params.get('ledgestats')) {
    setTimeout(() => {
      const w = ctx.controls.walker;
      const col = w.col;
      const g = camera.position.clone();
      col.buildsPerFrame = 600;
      col.refresh(g, 40);
      col.buildsPerFrame = 2;
      const hist = {};
      const hs = [];
      const save = w.feet.clone();
      for (let r = 1.5; r <= 22; r += 1.5) {
        for (let a = 0; a < 24; a++) {
          const ang = (a / 24) * Math.PI * 2 + r;
          const p = new THREE.Vector3(g.x + Math.cos(ang) * r, g.y + 2, g.z + Math.sin(ang) * r);
          const fl = col.ray(p, new THREE.Vector3(0, -1, 0), 8);
          if (!fl || !fl.face || fl.face.normal.y < 0.7) continue;
          w.feet.copy(fl.point);
          for (let q = 0; q < 8; q++) {
            const yaw = (q / 8) * Math.PI * 2;
            const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            w.ledgeWhy = null;
            const l = w._findLedge(dir, 1, 0.62, 2.25);
            const k = l ? (l.h <= 1.3 ? 'VAULT' : 'AGARRA') : (w.ledgeWhy ?? '?').replace(/altura [-\d.]+/, 'altura');
            if (k === 'parede') continue;
            hist[k] = (hist[k] ?? 0) + 1;
            if (k === 'altura' || k === 'topo') hs.push(w.ledgeWhy);
          }
        }
      }
      w.feet.copy(save);
      console.warn('LEDGES: ' + JSON.stringify(hist) + ' alturas: ' + hs.filter((x) => x?.startsWith('altura')).slice(0, 12).join(' '));
    }, Number(params.get('ledgestats')) * 1000);
  }
  // --ambient=8: a luz ambiente ×N (só para capturas — ver de perto o que está no escuro)
  if (params.get('ambient')) world.shared.uAmbient.value.multiplyScalar(Number(params.get('ambient')));
  // --nonpcs: sem os raros vivos (para medir o custo deles)
  if (params.get('nonpcs')) world.npcs.enabled = false;
  // --shaderprobe: compila cada material do mundo sozinho e diz qual dá aviso do compilador
  if (params.get('shaderprobe')) {
    setTimeout(() => {
      const warn = console.warn;
      const out = [];
      for (const [name, mat] of Object.entries(world.materials)) {
        let hit = null;
        console.warn = (...a) => {
          if (String(a[0]).includes('X3595') || String(a[0]).includes('Program Info Log')) hit = String(a[0]).slice(0, 80);
        };
        const sc = new THREE.Scene();
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        sc.add(m);
        try {
          renderer.compile(sc, camera);
        } catch (e) {
          hit = 'erro ' + e.message;
        }
        console.warn = warn;
        if (hit) out.push(name);
      }
      console.warn('SHADERPROBE: ' + (out.join(', ') || 'nenhum'));
    }, 8000);
  }
  // --inventory=N: abre o inventário aos N s; --equip=lantern,device: equipa isso antes
  if (params.get('equip')) setTimeout(() => params.get('equip').split(',').forEach((id) => ctx.inventory.equip(id)), 4000);
  // (--beamhold=S: segura o gatilho do emissor a partir de S s — capturas da carga)
  if (params.get('beamhold')) setTimeout(() => (ctx.beam.testHeld = true), Number(params.get('beamhold')) * 1000);
  // (--fxshots=lugar: os efeitos do emissor capturados no instante certo — com --capture e
  //  um --delay longo: vai ao lugar, mira a parede mais perto, captura carregando e depois
  //  do disparo em +0,03 · 0,12 · 0,5 · 2 · 6 s; os arquivos ficam ao lado da captura final)
  if (params.get('fxshots')) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = (name) => /** @type {any} */ (window).cybercosmic?.devCapture?.(name);
    (async () => {
      await sleep(5000);
      const place = params.get('fxshots');
      ctx.ui.teleport(place, place);
      ctx.controls.setMode('walk');
      await sleep(9000);
      for (let i = 0; i < 150 && ctx.wake?.active; i++) await sleep(200);
      ctx.inventory.equip('emitter');
      // a parede mais perto, na altura dos olhos
      const w = ctx.controls.walker;
      w.col._t = -1e9;
      w.col.refresh(ctx.camera.position, 40);
      let best = null;
      for (let q = 0; q < 24; q++) {
        const yaw = (q / 24) * Math.PI * 2;
        const h = w.col.ray(ctx.camera.position, new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 40);
        if (h && h.distance > 5 && (!best || h.distance < best.d)) best = { yaw, d: h.distance };
      }
      if (best) ctx.controls.yaw = best.yaw;
      // (--fxfar=cima: atira reto para baixo — o poço visto de 700 m acima)
      ctx.controls.pitch = params.get('fxfar') === 'cima' ? -1.55 : -0.05;
      await sleep(1500);
      // (--fxhold=S: segura S s — a sobrecarga: 3 a 6,5 s; a captura "carregando" 1,1 s antes de soltar)
      const holdS = Number(params.get('fxhold') || 2.7);
      ctx.player.energy.value = 1;
      ctx.beam.testHeld = true;
      await sleep((holdS - 1.1) * 1000);
      await shot('fx-carregando.png');
      await sleep(1100);
      ctx.beam.testHeld = false;
      const t0 = performance.now();
      /** @type {[number, string][]} */
      const when = [[30, 'fx-0.03s'], [120, 'fx-0.12s'], [500, 'fx-0.5s'], [2000, 'fx-2s'], [6000, 'fx-6s']];
      // (--fxfar: em vez da sequência, recua 600 m e olha de volta — o túnel nos chunks de longe)
      const far = !!params.get('fxfar');
      const eye0 = ctx.camera.position.clone().add(ctx.world.origin);
      const yaw0 = ctx.controls.yaw;
      for (const [ms, name] of far ? when.slice(0, 2) : when) {
        await sleep(Math.max(0, ms - (performance.now() - t0)));
        await shot(`${name}.png`);
      }
      if (far) {
        await sleep(1200);
        const d = new THREE.Vector3(-Math.sin(yaw0), 0, -Math.cos(yaw0));
        ctx.controls.setMode('fly');
        // (--fxfar=dentro: 40 m dentro do túnel, olhando ao longo dele — o fim, além de 420 m, nos chunks de longe)
        if (params.get('fxfar') === 'dentro') ctx.controls.setView({ pos: eye0.clone().addScaledVector(d, 40).sub(ctx.world.origin), yaw: yaw0, pitch: -0.05, scale: 1 });
        else if (params.get('fxfar') === 'cima') ctx.controls.setView({ pos: eye0.clone().add(new THREE.Vector3(0, 700, 0)).sub(ctx.world.origin), yaw: yaw0, pitch: -1.55, scale: 1 });
        else ctx.controls.setView({ pos: eye0.clone().addScaledVector(d, -600).add(new THREE.Vector3(0, 20, 0)).sub(ctx.world.origin), yaw: yaw0, pitch: -0.02, scale: 1 });
        await sleep(2500);
        let lod = 0;
        let lodCut = 0;
        for (const L of ctx.world.layers) {
          if (!L.level) continue;
          for (const e of L.chunks.values()) {
            if (!e.received || !L.cutsFor(e.cx, e.cy, e.cz).length) continue;
            lod++;
            if ((e.cutStats?.cut ?? 0) > 0) lodCut++;
          }
        }
        console.warn(`FXFAR: lod ligado ${ctx.world.lod.enabled} · chunks de longe com cortes ${lod} · com peças cortadas ${lodCut}`);
        await shot('fx-longe.png');
      }
      console.warn('FXSHOTS: pronto');
    })();
  }
  // (--beamfire=S: segura a partir de S s e solta na carga cheia — capturas do tiro)
  if (params.get('beamfire')) {
    const s = Number(params.get('beamfire'));
    setTimeout(() => (ctx.beam.testHeld = true), s * 1000);
    setTimeout(() => (ctx.beam.testHeld = false), (s + 2.6) * 1000);
  }
  if (params.get('inventory')) setTimeout(() => ctx.inventory.open(), Number(params.get('inventory')) * 1000);
  // --golink=bottom|top: a passagem mais perto com as pontes até a rede (Field.passageLinks),
  // olhando a ponte de baixo (do anel) ou a rampa de cima (do fim da ponte da passagem)
  // --cutshot=N: aos N s, um tiro do emissor "cheio" (400 m, raio 2,8 m) da câmera para onde ela olha
  // — o protótipo de risco da arma (o cofre, Arma-do-Killy, F1): só o corte, sem efeitos
  if (params.get('cutshot')) {
    setTimeout(async () => {
      const { beamReach } = await import('../gen/beamreach.js');
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      const a = world.toGlobal(camera.position).addScaledVector(d, 0.6);
      const { t, stop } = beamReach(world.field, a, d, Number(params.get('cutrange') || 400));
      const b = a.clone().addScaledVector(d, t);
      const r = Number(params.get('cutr') || 2.8);
      const t0 = performance.now();
      for (const L of [...world.layers, world.macroLayer]) /** @type {any} */ (L).debugRecut = true;
      const n = world.addCut({ a: a.toArray(), b: b.toArray(), r }, a.clone());
      console.warn(`CUTSHOT: ${t.toFixed(0)} m (${stop ?? 'livre'}) · raio ${r} · chunks pedidos ${JSON.stringify(n)}`);
      // quanto cada chunk refeito levou até a malha nova entrar (do disparo) — só os refeitos
      for (const L of [...world.layers, world.macroLayer]) {
        L.onRecut = (en) => {
          const dist = Math.round(L._chunkCenter(en, new THREE.Vector3()).distanceTo(a));
          console.warn(`CUTSHOT: ${L.layer}${L.level ? ' lod' + L.level : ''} a ${dist} m do disparo · trocado em ${(performance.now() - t0).toFixed(0)} ms (worker ${en.recutMs?.toFixed(0)} ms) · peças cortadas ${en.cutStats?.cut ?? '?'} · limites ${en.bounds ? [3, 4, 5].map((k) => Math.round(en.bounds[k] - en.bounds[k - 3])).join('×') : '-'}`);
        };
      }
    }, Number(params.get('cutshot')) * 1000);
  }
  // --colreach: até onde o feixe chega numa máquina colossal — de várias distâncias, de baixo e de lado,
  // mirando a plataforma, o bloco central e a longarina: o trecho (t), onde parou e por quê (o console)
  if (params.get('colreach')) {
    setTimeout(() => ctx.ui.teleport('colosso', 'colosso'), 2000);
    setTimeout(async () => {
      const { beamReach } = await import('../gen/beamreach.js');
      const { jamAt, shotOf } = await import('./beam.js');
      const C = world.colossi;
      const g0 = world.toGlobal(camera.position.clone());
      const m = [...C.machines.values()].sort((a, b) => a.pos.distanceTo(g0) - b.pos.distanceTo(g0))[0];
      if (!m) return console.warn('COLREACH: nenhuma');
      m.group.updateMatrixWorld(true);
      const H = 56 - 18 + 14;
      const W = (p) => new THREE.Vector3(...p).applyMatrix4(m.group.matrixWorld).add(world.origin);
      const targets = { plataforma: W([0, 4, 60]), bloco: W([0, H / 2 + 2, -18]), longarina: W([45, H - 5, 0]) };
      const b = m.lane.b;
      const lines = [`COLREACH: ${m.lane.id}:${m.k} eixo ${m.lane.axis} · laje ${b.bottom.toFixed(0)}..${b.top.toFixed(0)} · pé ${m.pos.y.toFixed(0)}`];
      const side = m.lane.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const along = m.lane.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      for (const [name, tg] of Object.entries(targets)) {
        for (const D of [40, 120, 250, 380, 600, 1000]) {
          for (const [how, off] of /** @type {[string, THREE.Vector3][]} */ ([['de baixo', new THREE.Vector3(0, -D * 0.5, 0).addScaledVector(along, D * 0.87)], ['de lado', side.clone().multiplyScalar(D).setY(-20)], ['ao longo', along.clone().multiplyScalar(D).setY(-10)]])) {
            const a = tg.clone().add(off);
            const d = tg.clone().sub(a).normalize();
            const out = [];
            for (const [k, o] of [[1, 0], [1, 1], [1, 2]]) {
              const S = shotOf(k, o);
              const r = beamReach(world.field, a, d, S.range);
              const jam = jamAt(world.field, a, d, r.t);
              const dist = tg.distanceTo(a);
              out.push(`${o ? 'sobre' + o : 'cheio'} ${r.t >= dist ? 'CHEGA' : `para a ${r.t.toFixed(0)} (${jam < r.t ? 'jam' : r.stop ?? 'alcance'})`}`);
            }
            lines.push(`  ${name} · ${D} m ${how}: ${out.join(' · ')}`);
          }
        }
      }
      // tiros de verdade (o trecho do feixe → world.addCut, como app/beam.js fire): a resistência cai?
      const id = `col:${m.lane.id}:${m.k}`;
      for (const [name, D, o] of /** @type {[string, number, number][]} */ ([['plataforma', 100, 0], ['bloco', 100, 0], ['plataforma', 380, 0], ['longarina', 380, 0], ['bloco', 900, 2]])) {
        m.group.updateMatrixWorld(true);
        const tg = { plataforma: W([0, 4, 60]), bloco: W([0, H / 2 + 2, -18]), longarina: W([45, H - 5, 0]) }[name];
        const a = tg.clone().add(new THREE.Vector3(0, -D * 0.5, 0).addScaledVector(along, D * 0.87));
        const d = tg.clone().sub(a).normalize();
        const S = shotOf(1, o);
        const r = beamReach(world.field, a, d, S.range);
        const hp0 = world.dyn.info(id)?.cuts;
        world.addCut({ a: a.toArray(), b: a.clone().addScaledVector(d, r.t).toArray(), r: S.r }, a, { now: true });
        const hp1 = world.dyn.info(id)?.cuts;
        lines.push(`  TIRO ${name} de ${D} m (${o ? 'sobre' + o : 'cheio'}): feixe ${r.t.toFixed(0)} m de ${tg.distanceTo(a).toFixed(0)} · cortes na máquina ${hp0} → ${hp1} (${JSON.stringify(world.dyn.info(id))}) ${hp1 > hp0 ? 'CORTOU' : 'NADA'}`);
      }
      console.warn(lines.join('\n'));
    }, 16000);
  }
  if (params.get('golink')) {
    setTimeout(() => {
      const F = world.field;
      const g = world.toGlobal(camera.position);
      const P = 1920;
      let found = null;
      for (let r = 0; r <= 8 && !found; r++) {
        for (const b of [...F.barriersNear(g.y), ...F.barriersNear(g.y + 2880), ...F.barriersNear(g.y - 2880)]) {
          for (let pi = Math.floor(g.x / P) - r; pi <= Math.floor(g.x / P) + r && !found; pi++) {
            for (let pk = Math.floor(g.z / P) - r; pk <= Math.floor(g.z / P) + r && !found; pk++) {
              const p = F.passage(b.n, pi, pk);
              if (!p) continue;
              const L = F.passageLinks(b, p);
              if (L.bottom && L.top) found = L;
            }
          }
        }
      }
      if (!found) return console.warn('GOLINK: nenhuma');
      const link = found[params.get('golink') === 'top' ? 'top' : 'bottom'];
      const a = link.a;
      const e = link.e;
      // um pouco atrás da ponta, de lado, olhando a ponte inteira
      const d = Math.hypot(e.x - a.x, e.z - a.z);
      const ux = (e.x - a.x) / d;
      const uz = (e.z - a.z) / d;
      const pos = new THREE.Vector3(a.x - ux * 6 - uz * 5, a.y + 3.5, a.z - uz * 6 + ux * 5);
      const v = new THREE.Vector3(e.x, e.y, e.z).sub(pos);
      ctx.controls.canFly = true;
      ctx.controls.setMode('fly');
      ctx.controls.setView({ pos: pos.sub(world.origin), yaw: Math.atan2(-v.x, -v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) - 0.05, scale: 1 });
      console.warn(`GOLINK: passagem ${found.b.n},${found.p.pi},${found.p.pk} · ponte ${Math.round(d)} m`);
    }, Number(params.get('golinkat') || 4) * 1000);
  }
  // --grabtest=N: aos N s, o Safeguard de ronda mais perto fica 1,5 m atrás de você e te pega
  // (para ver a animação de ser pego — app/wake.js)
  if (params.get('grabtest')) {
    setTimeout(() => {
      const g = world.toGlobal(camera.position);
      let near = null;
      for (const e of world.safeguards.all()) {
        const d = e.feet.distanceTo(g);
        if (!near || d < near.d) near = { e, d };
      }
      if (!near) return console.warn('GRABTEST: nenhum');
      const e = near.e;
      // você: 1,5 m à frente dele, de costas para ele
      const fx = -Math.sin(e.yaw);
      const fz = -Math.cos(e.yaw);
      ctx.controls.setMode('walk');
      ctx.controls.setView({ pos: new THREE.Vector3(e.feet.x + fx * 1.5, e.feet.y + 1.7, e.feet.z + fz * 1.5).sub(world.origin), yaw: e.yaw, pitch: 0, scale: 1 });
      setTimeout(() => world.safeguards.onCatch(e), 400);
      console.warn('GRABTEST: ' + e.id);
    }, Number(params.get('grabtest')) * 1000);
  }
  if (params.get('sgemerge')) setTimeout(() => console.warn('SGEMERGE: ' + world.safeguards.emerge(world.toGlobal(camera.position), world.origin, 1) + ' ' + JSON.stringify(world.safeguards.wallWhy) + ' @ ' + world.toGlobal(camera.position).toArray().map(Math.round)), Number(params.get('sgemerge')) * 1000);

  // --check: roteiro automático por todos os destinos (npm run check)
  // --check=pad: o teste do controle (um controle falso joga sozinho — dev/padtest.js)
  if (params.get('check') === 'pad') import('../dev/padtest.js').then((m) => m.runPadTest(ctx));
  else if (params.get('check') === 'beings') import('../dev/beingtest.js').then((m) => m.runBeingTest(ctx));
  else if (params.get('check') === 'climb') import('../dev/climbtest.js').then((m) => m.runClimbTest(ctx));
  else if (params.get('check') === 'npcs') import('../dev/npctest.js').then((m) => m.runNpcTest(ctx));
  else if (params.get('check') === 'beam') import('../dev/beamtest.js').then((m) => m.runBeamTest(ctx));
  else if (params.get('check') === 'profile') import('../dev/profile.js').then((m) => m.runProfile(ctx));
  else if (params.get('check') === 'moves') import('../dev/movetest.js').then((m) => m.runMoveTest(ctx));
  else if (params.get('check') === 'arms') import('../dev/armtest.js').then((m) => m.runArmTest(ctx));
  else if (params.get('check') === 'gene') import('../dev/genetest.js').then((m) => m.runGeneTest(ctx));
  else if (params.get('check') === 'health') import('../dev/healthtest.js').then((m) => m.runHealthTest(ctx));
  else if (params.get('check') === 'safeguards') import('../dev/sgtest.js').then((m) => m.runSafeguardTest(ctx));
  else if (params.get('check')) {
    import('../dev/check.js').then((m) => m.runCheck({ teleport: ctx.ui.teleport, world, controls: ctx.controls, camera, THREE, getTime: () => ctx.time, only: params.get('check'), app: ctx }));
  }

  // --stats: FPS e streaming no terminal a cada 2 s
  if (params.get('stats')) {
    // tempo de CPU montando as listas de desenho dos lotes (por quadro)
    let batchMs = 0;
    let batchCalls = 0;
    const timeLists = () => {
      ctx.scene.traverse((o) => {
        if (!o.isBatchedMesh || o._timed) return;
        const obr = o.onBeforeRender;
        o.onBeforeRender = function (...a) {
          const t0 = performance.now();
          obr.apply(this, a);
          batchMs += performance.now() - t0;
          batchCalls++;
        };
        o._timed = true;
      });
    };
    const gl = renderer.getContext();
    // tempo de GPU do reflexo (EXT_disjoint_timer_query_webgl2)
    let reflMs = 0;
    let reflN = 0;
    let reflDraws = 0;
    let reflTris = 0;
    const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (tq && ctx.reflection) {
      const pending = [];
      const render = ctx.reflection.render.bind(ctx.reflection);
      ctx.reflection.render = (...a) => {
        while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
          const q = pending.shift();
          if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) {
            reflMs += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
            reflN++;
          }
          gl.deleteQuery(q);
        }
        if (ctx.reflection.level === null || pending.length > 4) return render(...a);
        const q = gl.createQuery();
        gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
        const c0 = renderer.info.render.calls;
        const t0 = renderer.info.render.triangles;
        render(...a);
        gl.endQuery(tq.TIME_ELAPSED_EXT);
        reflDraws = renderer.info.render.calls - c0;
        reflTris = renderer.info.render.triangles - t0;
        pending.push(q);
      };
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    console.warn(`gpu=${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`);
    let frames = 0;
    // (os quadros DESENHADOS — app.js frameHooks: um rAF pode passar a vez)
    ctx.frameHooks.add(() => frames++);
    setInterval(() => {
      const g = world.toGlobal(camera.position);
      const s = world.stats;
      const info = renderer.info.render;
      const bs = world.batches.stats;
      console.warn(
        `fps=${(frames / 2).toFixed(0)} chunks=${s.chunks} lod1=${s.lod1} lod2=${s.lod2} macro=${s.macro} fila=${s.pending} ` +
          `lotes=${bs.pages} uso=${Math.round((100 * bs.used) / bs.cap)}% livres=${bs.freeSlots} mats=${bs.materials} comp=${world.batches.compactions ?? 0}/${(world.batches.compactMs ?? 0).toFixed(1)}ms draws=${info.calls} tris=${(info.triangles / 1e6).toFixed(2)}M pos=${g.x.toFixed(0)},${g.y.toFixed(0)},${g.z.toFixed(0)} região=${world.regionAt(camera.position)}` +
          (/** @type {any} */ (performance).memory ? ` heap=${Math.round(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576)}MB` : ''),
      );
      timeLists();
      console.warn(`  vagas desenhadas/quadro: cena ${Math.round(subDraws.main / Math.max(1, frames))} · reflexo ${Math.round(subDraws.reflection / Math.max(1, frames))}`);
      subDraws.main = subDraws.reflection = 0;
      if (reflN) console.warn(`  reflexo: ${(reflMs / reflN).toFixed(2)} ms de GPU · ${reflDraws} desenhos · ${(reflTris / 1e6).toFixed(2)}M triângulos · cena ${renderer.info.render.calls}`);
      reflMs = 0;
      reflN = 0;
      console.warn(`  listas: ${(batchMs / Math.max(1, frames)).toFixed(2)} ms/quadro em ${Math.round(batchCalls / Math.max(1, frames))} chamadas`);
      batchMs = 0;
      batchCalls = 0;
      frames = 0;
    }, 2000);
  }
}

/** A câmera (voando) acompanha um corpo: atrás e um pouco acima, olhando para ele. Devolve a função que para. */
export function followBody(ctx, e) {
  const { camera, world, controls } = ctx;
  controls.setMode('fly');
  const target = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let on = true;
  const tick = () => {
    if (!on || !world.entities.list.has(e.id)) return;
    requestAnimationFrame(tick);
    target.copy(e.feet).sub(world.origin);
    target.y += 1.2;
    // atrás do corpo (ele olha para −sen yaw, −cos yaw)
    // --followside: de lado, na altura do joelho (para ver os pés no chão)
    if (ctx.params.get('followside')) pos.set(target.x + Math.cos(e.yaw) * 3.2, target.y - 0.6, target.z - Math.sin(e.yaw) * 3.2);
    else pos.set(target.x + Math.sin(e.yaw) * 6, target.y + 2.6, target.z + Math.cos(e.yaw) * 6);
    camera.position.lerp(pos, camera.position.distanceTo(pos) > 30 ? 1 : 0.08);
    const d = target.clone().sub(camera.position);
    controls.yaw = Math.atan2(-d.x, -d.z);
    controls.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  };
  tick();
  return () => {
    on = false;
  };
}
