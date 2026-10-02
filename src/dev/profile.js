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
    const timeLists = () =>
      ctx.scene.traverse((o) => {
        if (!o.isBatchedMesh || o._prof) return;
        const obr = o.onBeforeRender;
        o.onBeforeRender = function (...a) {
          const t0 = performance.now();
          obr.apply(this, a);
          sLists.cur += performance.now() - t0;
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

  // a cada quadro: fecha o que cada sistema gastou nele
  let frames = 0;
  const intervals = [];
  let last = performance.now();
  let on = false;
  const tick = () => {
    raf(tick);
    ctx._profFrame?.();
    const now = performance.now();
    if (on) {
      intervals.push(now - last);
      frames++;
      for (const s of acc.values()) {
        s.ms += s.cur;
        s.max = Math.max(s.max, s.cur);
      }
    }
    for (const s of acc.values()) s.cur = 0;
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
