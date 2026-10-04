// ─────────────────────────────────────────────────────────────────────────────
//  Teste do gene de terminal (`npm run check:gene`, na Peregrinação — o cofre, Gene-terminal):
//
//    depositos  há depósitos, todos a mais de 40 km da origem; guardados e esquecidos; cada um
//               com a cadeia de 5 estruturas, chegando mais perto dele a cada elo
//    levado     um depósito esquecido cujo gene um andarilho levou: o território dele tem andarilho
//    cadeia     ler um arquivo perto de uma cadeia revela o começo dela; ler um elo revela o seguinte
//    pegar      num depósito, o gene na cápsula do pedestal: E pega (um objeto no inventário)
//    guardas    perto de um depósito guardado, a Cidade manda Safeguards altos
//    perder     o desmaio perde o gene — ele volta ao pedestal
//    amostra    o analisador; um morador portador: analisar mostra o traço; colher a amostra
//    implante   no berço da câmara, com a amostra: ~40 s; implantado — os Safeguards não percebem
//               mais você, o mapa mostra a região, e a escolha do final aparece (manter)
//    finais     destruir (o tremor, o escuro, a tela do fim) e entregar a uma vila (a tela do fim)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GENE, chainOf, vaultsNear, vaultTakenBy, villageCarrier } from '../gen/gene.js';
import { villageFrame, villageLayout } from '../gen/villages.js';
import { IMPLANT_TIME } from '../app/gene.js';

const SETTLE = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runGeneTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  console.warn('CHECK:DONE');
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const P = ctx.player;
  const F = world.field;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + (e.error?.stack ?? e.message)));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(100);
    return cond();
  };
  const here = () => world.toGlobal(camera.position);
  const stand = (x, y, z, yaw = 0) => {
    controls.setMode('walk');
    controls.setView({ pos: new THREE.Vector3(x, y + 1.7, z).sub(world.origin), yaw, pitch: -0.1, scale: 1 });
  };
  const click = (id) => document.querySelector(`#talk button[data-id="${id}"]`)?.click();
  const has = (id) => !!document.querySelector(`#talk button[data-id="${id}"]`);
  const line = () => document.querySelector('#talk .talk-line')?.textContent ?? '';
  const ev = {};
  for (const k of ['gene:link', 'gene:chainStart', 'gene:guards', 'gene:lost', 'player:gene', 'player:implanted', 'ending', 'ending:shown', 'player:analyze', 'player:sample']) world.bus.on(k, (e) => (ev[k] = e ?? true));
  ctx.rules = { ...ctx.rules, health: false };
  await sleep(SETTLE);

  // ── depositos (puro) ──
  const vaults = vaultsNear(F, 0, 0, 0, 160000);
  const nearO = vaults.filter((v) => Math.hypot(v.x, v.z) < 40000).length;
  const guarded = vaults.filter((v) => F.vaultGuarded(v)).length;
  let chainsOk = 0;
  for (const v of vaults) {
    const ch = chainOf(F, v);
    const d = ch.map((u) => Math.hypot(u.x - v.x, u.z - v.z));
    if (ch.length >= 4 && d.every((x, i) => i === 0 || x < d[i - 1] + 3000)) chainsOk++;
  }
  report({ kind: 'depositos', ok: vaults.length > 0 && nearO === 0 && chainsOk === vaults.length, why: `${vaults.length} depósitos em 160 km (${guarded} guardados) · a menos de 40 km da origem: ${nearO} · cadeias boas ${chainsOk}/${vaults.length}` });

  // ── levado (puro) ──
  {
    const taken = vaults.map((v) => ({ v, t: vaultTakenBy(F, v) })).filter((x) => x.t);
    report({ kind: 'levado', ok: taken.length > 0, why: `${taken.length} depósitos esquecidos com o gene levado por um andarilho (o território ${taken[0]?.t ?? '—'})` });
  }

  // o depósito do teste: o mais perto da origem com o gene no pedestal (de preferência guardado)
  const sorted = vaults.filter((v) => !vaultTakenBy(F, v)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const V = sorted.find((v) => F.vaultGuarded(v)) ?? sorted[0];

  // ── cadeia ──
  {
    let ok = false;
    let why = 'sem depósito';
    if (V) {
      const ch = chainOf(F, V);
      const leads0 = ctx.leads.list().length;
      // um arquivo perto: o começo; o primeiro elo: o seguinte
      const arch = F.uniquesNear(V.x, V.y, V.z, GENE.archiveReach).find((u) => u.kind === 'archive' && u.id !== ch[0]?.id);
      if (arch) world.bus.emit('player:read', { id: `t:${arch.id}`, site: { kind: 'unique', unique: arch, id: `t:${arch.id}` } });
      const started = !!ev['gene:chainStart'];
      world.bus.emit('player:read', { id: `t:${ch[0].id}`, site: { kind: 'unique', unique: ch[0], id: `t:${ch[0].id}` } });
      const linked = ev['gene:link']?.i === 0;
      await sleep(200);
      ok = (started || !arch) && linked && ctx.leads.list().length >= leads0 + 1;
      why = `arquivo ${arch ? (started ? 'revelou o começo' : 'NÃO revelou') : 'nenhum perto'} · elo 1 → o 2 ${linked} · pistas ${leads0} → ${ctx.leads.list().length}`;
    }
    report({ kind: 'cadeia', ok, why });
  }

  // ── pegar e guardas ──
  if (V) {
    const ped = F.vaultPedestal(V);
    const guardedV = F.vaultGuarded(V);
    // chega pela porta (os guardas) e vai ao pedestal
    const c = F.uniqueConsole(V);
    stand(c.x, V.y + 1.2, c.z, c.yaw + Math.PI);
    await sleep(SETTLE + 3000);
    const guards = guardedV ? await waitFor(() => !!ev['gene:guards'], 8) : null;
    const levels = [...world.safeguards.hunters].map((h) => h.level);
    const states = [...world.safeguards.hunters].map((h) => h.sg.state).join(',');
    world.safeguards.senses = () => null; // (os guardas não pegam o jogador no teste)
    for (const h of [...world.safeguards.hunters]) world.safeguards._lose(h);
    const wakeAt = ctx.wake.active;
    await waitFor(() => !ctx.wake.active, 90);
    stand(ped.x + 1.2, V.y + 1.2, ped.z, Math.atan2(1, 0));
    await sleep(3000);
    const shown = await waitFor(() => [...ctx.gene.genes.keys()].includes(`vault:${V.id}`), 6);
    const dPed = Math.hypot(here().x - ped.x, here().z - ped.z);
    const used = ctx.gene.tryUse();
    const got = P.carried.some((x) => x.kind === 'gene' && x.from === V.id);
    report({ kind: 'pegar', ok: shown && used && got, why: `a ${(Math.hypot(V.x, V.z) / 1000).toFixed(0)} km da origem (${guardedV ? 'guardado' : 'esquecido'}) · no pedestal ${shown} · pegou ${got} · a ${dPed.toFixed(1)} m do pedestal · desmaio na chegada ${wakeAt}` });
    const gl = ev['gene:guards']?.levels ?? [];
    report({ kind: 'guardas', ok: !guardedV || (guards && gl.length > 0 && gl.every((l) => l === 'high')), why: guardedV ? `${guards ? `vieram ${gl.length}, níveis ${gl.join(',')} · ${wakeAt ? 'pegaram o jogador' : `depois: ${states || '—'}`}` : 'nenhum veio'}` : 'esquecido: sem guarda (não se aplica)' });

    // ── perder ──
    ctx.wake.start('impact');
    await waitFor(() => ctx.wake.active, 3);
    await waitFor(() => !ctx.wake.active, 90);
    await sleep(500);
    const gone = !P.carried.some((x) => x.kind === 'gene');
    const back = !ctx.slot.loot?.[`gene:${V.id}`];
    report({ kind: 'perder', ok: gone && back && !!ev['gene:lost'], why: `sem o gene ${gone} · de volta ao pedestal ${back}` });
  } else for (const k of ['pegar', 'guardas', 'perder']) report({ kind: k, ok: false, why: 'sem depósito' });

  // ── amostra: um morador portador ──
  let sampled = false;
  {
    let ok = false;
    let why = 'nenhuma vila com portador em 160 km';
    const g0 = here();
    const vs = world.npcs.inhabitedNear(g0.x, g0.y, g0.z, 160000).filter((o) => villageCarrier(F, o.u) >= 0);
    const vil = vs[0];
    if (vil) {
      ctx.gene.giveAnalyzer('test');
      const { P: VP } = villageFrame(vil.u);
      const L0 = villageLayout(F, vil.u);
      const [cx, cz] = VP(L0.console.a - 1.5, L0.console.c);
      stand(cx, vil.u.y + 1.2, cz);
      await sleep(SETTLE + 3000);
      const ppl = world.npcs.villages.get(vil.u.id)?.people ?? [];
      await waitFor(() => ppl.some((e) => e.npc.carrier && e.tier === 'near'), 10);
      const who = ppl.find((e) => e.npc.carrier);
      if (who) {
        P.energy.value = 0.9;
        let opened = false;
        for (let i = 0; i < 6 && !opened; i++) {
          stand(who.feet.x - Math.sin(who.yaw) * 2.2, who.feet.y, who.feet.z - Math.cos(who.yaw) * 2.2, who.yaw + Math.PI);
          await sleep(700);
          opened = ctx.people.tryUse();
          await sleep(300);
          opened = opened && has('analyze');
          if (!opened) ctx.people.close();
        }
        click('analyze');
        await sleep(300);
        const l1 = line();
        const tr = ev['player:analyze']?.trace ?? 0;
        const canSample = has('sample');
        click('sample');
        await sleep(300);
        ctx.people.close();
        sampled = P.carried.some((x) => x.kind === 'sample');
        ok = opened && tr > 0.5 && canSample && sampled;
        why = `vila a ${(vil.d / 1000).toFixed(0)} km · conversa ${opened} · traço ${Math.round(tr * 100)}% (“${l1.slice(0, 50)}”) · amostra ${sampled}`;
      } else why = `vila a ${(vil.d / 1000).toFixed(0)} km · o portador não apareceu`;
    }
    report({ kind: 'amostra', ok, why });
  }

  // ── implante: com a amostra, no berço da câmara mais perto ──
  {
    let ok = false;
    let why = sampled ? 'nenhuma câmara em 160 km' : 'sem amostra (o caso de antes)';
    if (!sampled) P.carried.push({ kind: 'sample', from: 'teste' });
    const g = here();
    let best = null;
    for (const u of F.uniquesNear(g.x, g.y, g.z, 160000)) {
      if (u.kind !== 'chamber') continue;
      const d = Math.hypot(u.x - g.x, u.y - g.y, u.z - g.z);
      if (!best || d < best.d) best = { u, d };
    }
    if (best) {
      const b = F.chamberBed(best.u);
      const side = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
      stand(b.x + side.x * 1.6, best.u.y + 1.2, b.z + side.z * 1.6);
      await sleep(SETTLE + 3000);
      const leads0 = ctx.leads.list().length;
      const used = ctx.arms.tryUse();
      const t0 = performance.now();
      const done = await waitFor(() => !!ev['player:implanted'], IMPLANT_TIME + 6);
      const secs = (performance.now() - t0) / 1000;
      const asked = await waitFor(() => has('keep') && has('destroy') && has('village'), 6);
      click('keep');
      await sleep(300);
      const sensesOff = world.safeguards.senses?.() === null;
      ok = used && done && P.gene === true && !P.carried.some((x) => x.kind === 'sample') && asked && ctx.slot.ending === 'keep' && sensesOff && ctx.leads.list().length > leads0;
      why = `${done ? `implantado em ${secs.toFixed(1)} s` : 'não terminou'} · a escolha ${asked} → ${ctx.slot.ending} · Safeguards não percebem ${sensesOff} · pistas ${leads0} → ${ctx.leads.list().length}`;
    }
    report({ kind: 'implante', ok, why });
  }

  // ── finais ──
  {
    ctx.gene.chooseEnding();
    await waitFor(() => has('destroy'), 4);
    click('destroy');
    const shown = await waitFor(() => ev['ending:shown']?.kind === 'destroy', 14);
    const overlay = document.getElementById('ending');
    const vis = overlay?.style.display === 'flex';
    document.getElementById('ending').style.display = 'none';
    ctx.signal.uniforms.uBlack.value = 0;
    // a vila: com o final pendente, um morador aceita o gene
    ev['ending:shown'] = null;
    ctx.slot.ending = 'pending-village';
    const g0 = here();
    const vil = world.npcs.inhabitedNear(g0.x, g0.y, g0.z, 160000)[0];
    let gave = false;
    if (vil) {
      const { P: VP } = villageFrame(vil.u);
      const L0 = villageLayout(F, vil.u);
      const [cx, cz] = VP(L0.console.a - 1.5, L0.console.c);
      stand(cx, vil.u.y + 1.2, cz);
      await sleep(SETTLE + 3000);
      const ppl = world.npcs.villages.get(vil.u.id)?.people ?? [];
      await waitFor(() => ppl.some((e) => e.tier === 'near'), 10);
      const who = ppl.find((e) => e.tier === 'near');
      for (let i = 0; i < 6 && who && !has('giveGene'); i++) {
        ctx.people.close();
        stand(who.feet.x - Math.sin(who.yaw) * 2.2, who.feet.y, who.feet.z - Math.cos(who.yaw) * 2.2, who.yaw + Math.PI);
        await sleep(700);
        ctx.people.tryUse();
        await sleep(300);
      }
      click('giveGene');
      gave = await waitFor(() => ev['ending:shown']?.kind === 'village', 6);
    }
    report({ kind: 'finais', ok: shown && vis && gave && ctx.slot.ending === 'village', why: `destruir: tela do fim ${shown && vis} · a vila: ${gave ? 'entregue, tela do fim' : 'não entregou'} (${ctx.slot.ending})` });
  }
}
