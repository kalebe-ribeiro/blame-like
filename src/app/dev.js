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
  if (params.get('inventory')) setTimeout(() => ctx.inventory.open(), Number(params.get('inventory')) * 1000);
  // --beamshot=N: aos N s, procura uma parede a 6–25 m em volta, atira nela (potência --beampower, 4)
  // e fica olhando o buraco de um passo para o lado (para as capturas do emissor — app/beam.js)
  if (params.get('beamhold')) ctx.beamHold = true;
  if (params.get('beamshot')) {
    setTimeout(() => {
      const col = ctx.controls.walker.col;
      const eye = camera.position.clone();
      col.buildsPerFrame = 600;
      col.refresh(eye, 40);
      col.buildsPerFrame = 2;
      let best = null;
      for (let q = 0; q < 32; q++) {
        const yaw = (q / 32) * Math.PI * 2;
        const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const h = col.ray(eye, dir, 25);
        if (h && h.distance > 6 && h.face && Math.abs(h.face.normal.y) < 0.3 && (!best || Math.abs(h.distance - 12) < Math.abs(best.d - 12))) best = { yaw, dir, d: h.distance };
      }
      if (!best) return console.warn('BEAMSHOT: nenhuma parede');
      ctx.controls.setView({ pos: eye, yaw: best.yaw, pitch: 0, scale: 1 });
      ctx.beam.setPower(Number(params.get('beampower') || 4));
      ctx.inventory.equip('emitter');
      setTimeout(() => {
        ctx.beam.fire();
        console.warn('BEAMSHOT: parede a ' + best.d.toFixed(1) + ' m');
        // depois do tiro: um passo para o lado, olhando a boca do buraco de viés
        setTimeout(() => {
          const side = new THREE.Vector3(-best.dir.z, 0, best.dir.x);
          const at = eye.clone().addScaledVector(side, 3.5).addScaledVector(best.dir, best.d * 0.35);
          const tgt = eye.clone().addScaledVector(best.dir, best.d);
          const v = tgt.sub(at);
          ctx.controls.setView({ pos: at, yaw: Math.atan2(-v.x, -v.z), pitch: -0.05, scale: 1 });
        }, Number(params.get('beamlook') || 1200));
      }, 300);
    }, Number(params.get('beamshot')) * 1000);
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
  else if (params.get('check') === 'moves') import('../dev/movetest.js').then((m) => m.runMoveTest(ctx));
  else if (params.get('check') === 'beam') import('../dev/beamtest.js').then((m) => m.runBeamTest(ctx));
  else if (params.get('check') === 'safeguards') import('../dev/sgtest.js').then((m) => m.runSafeguardTest(ctx));
  else if (params.get('check')) {
    import('../dev/check.js').then((m) => m.runCheck({ teleport: ctx.ui.teleport, world, controls: ctx.controls, camera, THREE, getTime: () => ctx.time, only: params.get('check') }));
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
    const count = () => {
      frames++;
      requestAnimationFrame(count);
    };
    count();
    setInterval(() => {
      const g = world.toGlobal(camera.position);
      const s = world.stats;
      const info = renderer.info.render;
      const bs = world.batches.stats;
      console.warn(
        `fps=${(frames / 2).toFixed(0)} chunks=${s.chunks} lod1=${s.lod1} lod2=${s.lod2} macro=${s.macro} fila=${s.pending} ` +
          `lotes=${bs.pages} uso=${Math.round((100 * bs.used) / bs.cap)}% livres=${bs.freeSlots} mats=${bs.materials} comp=${world.batches.compactions ?? 0}/${(world.batches.compactMs ?? 0).toFixed(1)}ms draws=${info.calls} tris=${(info.triangles / 1e6).toFixed(2)}M pos=${g.x.toFixed(0)},${g.y.toFixed(0)},${g.z.toFixed(0)} região=${world.regionAt(camera.position)}` +
          (performance.memory ? ` heap=${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : ''),
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
