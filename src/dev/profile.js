// ─────────────────────────────────────────────────────────────────────────────
//  Perfil por sistema (`npm run profile`): quanto cada parte gasta por quadro.
//
//  "Embrulha" o update de cada sistema (só neste modo — o jogo normal não paga
//  nada) e soma o tempo de CPU de cada um; o tempo de GPU do quadro vem da
//  consulta de tempo do WebGL (EXT_disjoint_timer_query_webgl2).
//
//  Percorre lugares típicos. Em cada um mede duas fases:
//    chegada   os primeiros SETTLE s (o mundo carregando: os picos)
//    parado    os MEASURE s seguintes (o custo de regime)
//  e reporta fps, o quadro médio e o pior, e os sistemas mais caros.
//  No fim, o resumo de todos os lugares (a média de cada sistema).
//
//  --profshot: em vez disso, o caso `tiro` (a arma de Killy — o cofre, Arma-do-Killy §8):
//  em cada lugar, parado (o regime), carregando (o CPU do emissor e o GPU a mais) e o
//  disparo (o quadro do tiro a mais que o regime, o pior quadro depois, e quanto tempo
//  até o fps voltar ao de antes).
// ─────────────────────────────────────────────────────────────────────────────

const SETTLE = 7000;
const MEASURE = 8000;
const PLACES = (new URLSearchParams(location.search).get('profplaces') ?? 'teia,colmeia,macico,vila,camada,transportador,safeguard,deposito,estrato').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runProfile(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  console.warn('CHECK:DONE');
}

async function run(ctx) {
  const { world, controls } = ctx;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  const log = (s) => console.warn('PROF ' + s);

  // ── os relógios ──
  const acc = new Map(); // nome → { ms, max, cur }
  const slot = (name) => {
    let s = acc.get(name);
    if (!s) acc.set(name, (s = { ms: 0, max: 0, cur: 0 }));
    return s;
  };
  const wrap = (obj, method, name) => {
    if (!obj || typeof obj[method] !== 'function') return;
    const fn = obj[method];
    const s = slot(name);
    obj[method] = function (...a) {
      const t0 = performance.now();
      try {
        return fn.apply(this, a);
      } finally {
        s.cur += performance.now() - t0;
      }
    };
  };
  // o que o quadro chama (app.js frame)
  wrap(controls, 'update', 'controles+corpo');
  wrap(ctx.body, 'update', 'corpo (sentidos)');
  wrap(ctx.travel, 'update', 'travessia');
  wrap(ctx.carried, 'update', 'lanterna/aparelho');
  wrap(ctx.marks, 'update', 'marcas');
  wrap(ctx.alert, 'update', 'alerta');
  wrap(ctx.safeguards, 'update', 'safeguards (app)');
  wrap(ctx.people, 'update', 'conversa (app)');
  wrap(ctx.reflection, 'update', 'reflexo (update)');
  wrap(ctx.reflection, 'render', 'reflexo (render)');
  wrap(world.silhouettes, 'renderMask', 'silhuetas (render)');
  wrap(ctx.composer, 'render', 'render (cena+pós)');
  wrap(ctx.sound, 'update', 'som (lugares)');
  wrap(ctx.hud, 'update', 'hud');
  wrap(ctx.beam, 'update', 'arma (emissor)');
  wrap(world, 'addCut', 'arma: addCut');
  wrap(ctx.beam.fx, 'fire', 'arma: efeitos do tiro');
  wrap(ctx.audio, 'update', 'áudio');
  // dentro de world.update
  for (const L of world.layers) {
    wrap(L, 'update', `chunks ${L.level ? 'lod' + L.level : 'perto'} (varrer)`);
    wrap(L, 'flushUploads', `chunks ${L.level ? 'lod' + L.level : 'perto'} (subir)`);
  }
  wrap(world.macroLayer, 'update', 'macro (varrer)');
  wrap(world.macroLayer, 'flushUploads', 'macro (subir)');
  wrap(world.pool, 'pump', 'workers (fila)');
  wrap(world.batches, 'tick', 'lotes (tick)');
  for (const k of ['elevators', 'builders', 'transit', 'colossi', 'terminals', 'substations', 'entities', 'safeguards', 'npcs', 'inscriptions', 'particles', 'outages', 'silhouettes', 'collapses', 'lights']) {
    wrap(world[k], 'update', `mundo: ${k}`);
  }
  // dentro do render: a cena (e o reflexo) × os passes de tela; as listas dos lotes; as chamadas
  {
    const r = ctx.renderer;
    const render = r.render.bind(r);
    const sScene = slot('  ↳ renderer.render(cena)');
    const sOther = slot('  ↳ renderer.render(telas/pós)');
    r.render = (scene, cam) => {
      const t0 = performance.now();
      try {
        return render(scene, cam);
      } finally {
        (scene === ctx.scene ? sScene : sOther).cur += performance.now() - t0;
      }
    };
    const sLists = slot('  ↳ listas dos lotes');
    const names = new Map();
    for (const [k, m] of Object.entries(world.materials)) names.set(m, k);
    for (const [k, m] of Object.entries(world.lodMaterials ?? {})) names.set(m, 'longe:' + k);
    const this_material = (m) => names.get(m) ?? m?.type ?? '?';
    const timeLists = () =>
      ctx.scene.traverse((o) => {
        if (!o.isBatchedMesh || o._prof) return;
        const obr = o.onBeforeRender;
        // de quem é este lote: o nome do material e se é dos chunks de longe (LOD)
        const mat = this_material(o.material);
        o.onBeforeRender = function (...a) {
          const t0 = performance.now();
          obr.apply(this, a);
          sLists.cur += performance.now() - t0;
          if (a[2] !== ctx.camera) return; // (só a câmera principal)
          let n = 0;
          for (let i = 0; i < this._multiDrawCount; i++) n += this._multiDrawCounts[i];
          triFrame.set(mat, (triFrame.get(mat) ?? 0) + n / 3);
        };
        o._prof = true;
      });
    setInterval(timeLists, 1000);
    const sCalls = slot('  ↳ chamadas de desenho (n)');
    const sObjs = slot('  ↳ objetos na cena (n)');
    const sTris = slot('  ↳ triângulos (milhares)');
    const info = r.info;
    info.autoReset = false;
    let last = 0;
    setInterval(() => {}, 1000);
    const onFrame = () => {
      sCalls.cur = info.render.calls;
      sTris.cur = info.render.triangles / 1000;
      let n = 0;
      ctx.scene.traverseVisible(() => n++);
      sObjs.cur = n;
      info.reset();
      last++;
    };
    ctx._profFrame = onFrame;
  }

  // o quadro inteiro (CPU): do começo ao fim do callback do requestAnimationFrame
  const frameS = slot('QUADRO (CPU total)');
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const t0 = performance.now();
      try {
        cb(t);
      } finally {
        frameS.cur += performance.now() - t0;
      }
    });

  // GPU: o quadro inteiro (da primeira chamada de desenho ao fim do composer)
  const gl = ctx.renderer.getContext();
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpu = { ms: 0, n: 0, max: 0, pending: [] };
  if (tq) {
    const render = ctx.composer.render;
    ctx.composer.render = function (...a) {
      while (gpu.pending.length && gl.getQueryParameter(gpu.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = gpu.pending.shift();
        if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) {
          const v = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
          gpu.ms += v;
          gpu.n++;
          gpu.max = Math.max(gpu.max, v);
        }
        gl.deleteQuery(q);
      }
      if (gpu.pending.length > 4) return render.apply(this, a);
      const q = gl.createQuery();
      gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
      try {
        return render.apply(this, a);
      } finally {
        gl.endQuery(tq.TIME_ELAPSED_EXT);
        gpu.pending.push(q);
      }
    };
  }

  // triângulos por material (só a câmera principal), somados por quadro
  const triFrame = new Map();
  const triAcc = new Map();
  // a cada quadro: fecha o que cada sistema gastou nele
  let frames = 0;
  const intervals = [];
  let last = performance.now();
  let on = false;
  /** @type {{ t: number, iv: number, cpu: number, beam: number, cut: number, fx: number, top: string }[]|null} o caso tiro: quadro a quadro */
  let rec = null;
  /** @type {string[]} */
  const newProgs = [];
  /** @type {any} */
  const tick = () => {
    raf(tick);
    ctx._profFrame?.();
    const now = performance.now();
    // (programas de shader novos neste quadro: uma compilação no meio do jogo)
    const progs = ctx.renderer.info.programs ?? [];
    if (rec && progs.length !== (tick.nProg ?? progs.length)) newProgs.push(`${((now - (rec[0]?.t ?? now)) / 1000).toFixed(2)} s: ${progs.slice(tick.nProg ?? 0).map((p) => p.name).join(', ')}`);
    tick.nProg = progs.length;
    rec?.push({ t: now, iv: now - last, cpu: frameS.cur, beam: acc.get('arma (emissor)')?.cur ?? 0, cut: acc.get('arma: addCut')?.cur ?? 0, fx: acc.get('arma: efeitos do tiro')?.cur ?? 0,
      top: now - last > 40 ? [...acc.entries()].filter(([k]) => !/\(n\)|milhares|QUADRO/.test(k)).sort((x, y) => y[1].cur - x[1].cur).slice(0, 3).map(([k, v]) => `${k} ${v.cur.toFixed(0)}`).join(', ') : '' });
    if (on) {
      intervals.push(now - last);
      frames++;
      for (const s of acc.values()) {
        s.ms += s.cur;
        s.max = Math.max(s.max, s.cur);
      }
    }
    for (const s of acc.values()) s.cur = 0;
    if (on) for (const [k, v] of triFrame) triAcc.set(k, (triAcc.get(k) ?? 0) + v);
    triFrame.clear();
    last = now;
  };
  raf(tick);

  const reset = () => {
    for (const s of acc.values()) {
      s.ms = 0;
      s.max = 0;
    }
    intervals.length = 0;
    frames = 0;
    triAcc.clear();
    gpu.ms = 0;
    gpu.n = 0;
    gpu.max = 0;
  };
  const total = new Map(); // nome → soma das médias (o resumo)
  const summarize = (label, phase) => {
    const iv = intervals.slice().sort((a, b) => a - b);
    const avgIv = iv.reduce((a, b) => a + b, 0) / Math.max(1, iv.length);
    const p95 = iv[Math.floor(iv.length * 0.95)] ?? 0;
    const worst = iv[iv.length - 1] ?? 0;
    const rows = [...acc.entries()].map(([k, s]) => ({ k, avg: s.ms / Math.max(1, frames), max: s.max })).sort((a, b) => b.avg - a.avg);
    const cpu = rows.find((r) => r.k.startsWith('QUADRO'));
    const top = rows.filter((r) => !r.k.startsWith('QUADRO')).slice(0, 10);
    const spikes = rows.filter((r) => !r.k.startsWith('QUADRO') && !/\(n\)|milhares|↳ renderer|render \(cena/.test(r.k)).sort((a, b) => b.max - a.max).slice(0, 4);
    const g = gpu.n ? gpu.ms / gpu.n : null;
    report({
      kind: `${label}:${phase}`,
      ok: true,
      why: `${(1000 / avgIv).toFixed(0)} fps · quadro ${avgIv.toFixed(1)} ms (p95 ${p95.toFixed(0)}, pior ${worst.toFixed(0)}) · CPU ${cpu ? cpu.avg.toFixed(1) : '?'} ms · GPU ${g !== null ? g.toFixed(1) + ' ms (pior ' + gpu.max.toFixed(0) + ')' : '?'}`,
    });
    log(`${label}:${phase} mais caros: ${top.map((r) => `${r.k} ${r.avg.toFixed(2)}`).join(' · ')}`);
    if (phase === 'parado') {
      const tri = [...triAcc.entries()].map(([k, v]) => [k, v / Math.max(1, frames)]).sort((x, y) => y[1] - x[1]);
      const all = tri.reduce((q, [, v]) => q + v, 0);
      const far = tri.filter(([k]) => k.startsWith('longe:')).reduce((q, [, v]) => q + v, 0);
      log(`${label}:${phase} triângulos ${(all / 1000).toFixed(0)} mil (longe ${((100 * far) / Math.max(1, all)).toFixed(0)}%): ${tri.slice(0, 8).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}k`).join(' · ')}`);
    }
    log(`${label}:${phase} picos: ${spikes.map((r) => `${r.k} ${r.max.toFixed(0)}`).join(' · ')}`);
    if (phase === 'parado') {
      for (const r of rows) total.set(r.k, (total.get(r.k) ?? 0) + r.avg);
      total.set('_GPU', (total.get('_GPU') ?? 0) + (g ?? 0));
      total.set('_quadro', (total.get('_quadro') ?? 0) + avgIv);
    }
  };

  // --profres=0.5: a resolução interna (para separar CPU de espera pela GPU)
  const res = Number(new URLSearchParams(location.search).get('profres') || 0);
  if (res) {
    ctx.renderer.setPixelRatio(res);
    window.dispatchEvent(new Event('resize'));
  }
  await sleep(SETTLE);
  if (new URLSearchParams(location.search).get('profshot')) {
    // ── o caso tiro ──
    const gpuWin = () => {
      const g0 = { ms: gpu.ms, n: gpu.n };
      return () => (gpu.n > g0.n ? (gpu.ms - g0.ms) / (gpu.n - g0.n) : 0);
    };
    const avg = (arr, f) => arr.reduce((q, x) => q + f(x), 0) / Math.max(1, arr.length);
    const all = { charge: [], gpu: [], fire: [], worst: [], back: [] };
    ctx.rules.safeguards = false; // (uma captura no meio estraga a medida)
    for (const place of PLACES) {
      if (!ctx.ui.teleport(place, place)) continue;
      controls.setMode('walk');
      ctx.inventory.equip('emitter');
      ctx.player.energy.value = 1;
      await sleep(SETTLE + 3000);
      for (let i = 0; i < 150 && ctx.wake?.active; i++) await sleep(200); // (o despertar do começo)
      controls.pitch = 0;
      // regime
      rec = [];
      let g = gpuWin();
      await sleep(3000);
      const base = rec;
      const gBase = g();
      // carregando (do 0,4 s em diante: a carga já começou)
      rec = [];
      ctx.beam.testHeld = true;
      await sleep(400);
      rec = [];
      g = gpuWin();
      // (--profhold=S: segura S s de carga do jogo — 6,8 vai até a sobrecarga máxima)
      const H = Number(new URLSearchParams(location.search).get('profhold') || 2.7);
      while (ctx.beam.held < H - 0.02 && ctx.beam.state === 'charging') await sleep(10);
      const charging = rec;
      const gCharge = g();
      // o disparo e os 4 s seguintes
      rec = [];
      ctx.beam.testHeld = false;
      await sleep(4000);
      ctx.beam.testHeld = null;
      const after = rec;
      rec = null;
      const baseIv = avg(base, (f) => f.iv);
      const baseCpu = avg(base, (f) => f.cpu);
      const fireF = after.reduce((q, f) => (f.beam > q.beam ? f : q), after[0]);
      const worst = Math.max(...after.map((f) => f.iv));
      // de volta: a primeira janela de 0,5 s com o quadro médio a menos de 10% do regime
      let back = -1;
      for (let i = 0; i < after.length; i++) {
        const w = after.filter((f) => f.t >= after[i].t && f.t < after[i].t + 500);
        if (w.length > 3 && avg(w, (f) => f.iv) < baseIv * 1.1) {
          back = (after[i].t - after[0].t) / 1000;
          break;
        }
      }
      const chargeCpu = avg(charging, (f) => f.beam);
      const fireExtra = fireF.cpu - baseCpu;
      all.charge.push(chargeCpu);
      all.gpu.push(gCharge - gBase);
      all.fire.push(fireExtra);
      all.worst.push(worst);
      all.back.push(back);
      report({
        kind: `tiro:${place}`,
        ok: chargeCpu <= 1 && gCharge - gBase <= 1.5 && fireExtra <= 8 && back >= 0 && back <= 3,
        why: `regime ${baseIv.toFixed(1)} ms (CPU ${baseCpu.toFixed(1)}, GPU ${gBase.toFixed(1)}) · carregando: emissor ${chargeCpu.toFixed(2)} ms CPU (≤ 1), GPU +${(gCharge - gBase).toFixed(2)} ms (≤ 1,5) · disparo: quadro +${fireExtra.toFixed(1)} ms CPU (≤ 8; emissor ${fireF.beam.toFixed(1)}: addCut ${fireF.cut.toFixed(1)}, efeitos ${fireF.fx.toFixed(1)}) · pior quadro depois ${worst.toFixed(0)} ms · fps de volta em ${back < 0 ? '>4' : back.toFixed(1)} s (≤ 3)`,
      });
      log(`tiro:${place} quadros depois do disparo (ms): ${after.slice(0, 40).map((f) => f.iv.toFixed(0)).join(' ')}`);
      log(`tiro:${place} programas novos: ${newProgs.splice(0).join(' | ') || 'nenhum'}`);
      log(`tiro:${place} quadros longos: ${after.filter((f) => f.top).map((f) => `${f.iv.toFixed(0)} ms em ${((f.t - after[0].t) / 1000).toFixed(2)} s [${f.top}]`).join(' | ') || 'nenhum'}`);
    }
    const mx = (a) => Math.max(...a);
    log(`TIRO: carregando ≤ ${mx(all.charge).toFixed(2)} ms CPU · GPU +${mx(all.gpu).toFixed(2)} ms · disparo +${mx(all.fire).toFixed(1)} ms · pior quadro ${mx(all.worst).toFixed(0)} ms · volta ${mx(all.back).toFixed(1)} s`);
    return;
  }
  let n = 0;
  for (const place of PLACES) {
    if (!ctx.ui.teleport(place, place)) continue;
    controls.setMode('walk');
    n++;
    reset();
    on = true;
    await sleep(SETTLE);
    summarize(place, 'chegada');
    reset();
    await sleep(MEASURE);
    summarize(place, 'parado');
    on = false;
  }
  // o resumo: a média de cada sistema em todos os lugares (parado)
  const rows = [...total.entries()].filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v / Math.max(1, n)]).sort((a, b) => b[1] - a[1]);
  log(`RESUMO (${n} lugares, parado): quadro ${((total.get('_quadro') ?? 0) / n).toFixed(1)} ms · GPU ${((total.get('_GPU') ?? 0) / n).toFixed(1)} ms`);
  for (const [k, v] of rows) if (v > 0.05) log(`  ${k.padEnd(28)} ${v.toFixed(2)} ms`);
}
