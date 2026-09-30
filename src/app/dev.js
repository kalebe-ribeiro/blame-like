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
  if (params.get('sgemerge')) setTimeout(() => console.warn('SGEMERGE: ' + world.safeguards.emerge(world.toGlobal(camera.position), world.origin, 1) + ' ' + JSON.stringify(world.safeguards.wallWhy) + ' @ ' + world.toGlobal(camera.position).toArray().map(Math.round)), Number(params.get('sgemerge')) * 1000);

  // --check: roteiro automático por todos os destinos (npm run check)
  // --check=pad: o teste do controle (um controle falso joga sozinho — dev/padtest.js)
  if (params.get('check') === 'pad') import('../dev/padtest.js').then((m) => m.runPadTest(ctx));
  else if (params.get('check') === 'beings') import('../dev/beingtest.js').then((m) => m.runBeingTest(ctx));
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
