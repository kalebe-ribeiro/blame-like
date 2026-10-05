// ─────────────────────────────────────────────────────────────────────────────
//  Teste das quinas (`npm run check:climb`): o corpo do jogador agarrando e
//  subindo quinas de verdade do mundo, dirigido pelo teste (controls.forceInput).
//
//  Em vários lugares (colmeia, maciço, depósito, máquinas, estrato, galeria,
//  escadaria, construtores…) procura, em volta, pontos de chão com uma quina à
//  frente (a mesma busca do Walker) e separa:
//    vault   quina baixa (até 1,3 m): pular de frente → passa por cima
//    agarra  quina alta (1,3–2,25 m): pular de frente → agarra → sobe
//    queda   a borda de uma plataforma da teia com o vazio embaixo: caindo de
//            costas para ela, as mãos pegam; depois sobe
//    ponte   o mesmo, caindo do lado de uma ponte suspensa (as mãos no piso dela)
//  Passa se em cada caso o corpo termina de pé EM CIMA (na altura do topo, além
//  da quina). Depois de subir, o peito não atravessou nada (raio do ponto de
//  partida ao de chegada, por cima da quina).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { edgeDist } from '../gen/nav.js';
import { EDGE_DIRS } from '../gen/field.js';
import { buildArena } from './arena.js';

const SETTLE = 7000;
const PLACES = ['colmeia', 'macico', 'deposito', 'maquinas', 'estrato', 'escadaria', 'construtores', 'galeria', 'silo', 'teia'];
const DOWN = new THREE.Vector3(0, -1, 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runClimbTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  ctx.controls.forceInput = null;
  console.warn('CHECK:DONE');
}

/** Pontos de chão em volta do jogador com uma quina à frente: { vault, hang } — cada um { feet, yaw, l } (cena). */
export function scanLedges(ctx) {
  const { camera, controls } = ctx;
  const w = controls.walker;
  const col = w.col;
  const g = camera.position.clone();
  col.buildsPerFrame = 600;
  col.refresh(g, 40);
  col.buildsPerFrame = 2;
  const found = { vault: null, hang: null };
  const save = w.feet.clone();
  for (let r = 1.5; r <= 22 && !(found.vault && found.hang); r += 1.5) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2 + r;
      const p = new THREE.Vector3(g.x + Math.cos(ang) * r, g.y + 2, g.z + Math.sin(ang) * r);
      const fl = col.ray(p, DOWN, 8);
      if (!fl || !fl.face || fl.face.normal.y < 0.7) continue;
      w.feet.copy(fl.point);
      for (let q = 0; q < 8; q++) {
        const yaw = (q / 8) * Math.PI * 2;
        const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const l = w._findLedge(dir, 1, 0.62, 2.25);
        if (!l) continue;
        const kind = l.h <= 1.3 ? 'vault' : 'hang';
        if (!found[kind]) found[kind] = { feet: fl.point.clone(), yaw, l };
      }
    }
  }
  w.feet.copy(save);
  return found;
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const w = controls.walker;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(100);
    return cond();
  };
  const standAt = (feet, yaw) => {
    controls.setMode('walk');
    controls.setView({ pos: feet.clone().setY(feet.y + 1.7), yaw, pitch: 0, scale: 1 });
  };

  const scan = () => scanLedges(ctx);
  /** Pula de frente e segura "para a frente" até terminar. Devolve o resultado. */
  const climb = async (c) => {
    standAt(c.feet, c.yaw);
    await sleep(600);
    controls.forceInput = { f: 1, r: 0, jump: true };
    await sleep(120);
    controls.forceInput = { f: 1, r: 0, jump: false };
    const grabbed = await waitFor(() => !!w.ledge || !!w.climb, 1.5);
    await waitFor(() => !w.ledge && !w.climb, 4);
    controls.forceInput = { f: 0, r: 0, jump: false };
    await sleep(500);
    controls.forceInput = null;
    const top = c.l.landY ?? c.l.topY;
    const onTop = Math.abs(w.feet.y - top) < 0.25 && w.grounded;
    // por cima da quina: do lado de dentro do topo
    const beyond = (w.feet.x - c.l.edge.x) * -c.l.nrm.x + (w.feet.z - c.l.edge.z) * -c.l.nrm.z;
    return { grabbed, onTop, beyond, dy: w.feet.y - top };
  };

  await sleep(SETTLE);
  const only = ctx.params.get('climbonly'); // (--climbonly=corrimao: só esse caso)
  if (!only) {
  // em cada lugar: a primeira quina baixa e a primeira alta que aparecerem, subidas de verdade
  let nv = 0;
  let nh = 0;
  for (const place of PLACES) {
    if (!ctx.ui.teleport(place, place)) continue;
    controls.setMode('walk');
    await sleep(SETTLE);
    const f = scan();
    for (const kind of ['vault', 'hang']) {
      const c = f[kind];
      if (!c) continue;
      const r = await climb(c);
      if (kind === 'vault') nv++;
      else nh++;
      const ok = r.onTop && r.beyond > 0.15 && (kind === 'vault' || r.grabbed);
      report({ kind: `${kind === 'vault' ? 'vault' : 'agarra'}:${place}`, ok, why: `quina de ${c.l.h.toFixed(2)} m · ${kind === 'hang' ? `agarrou ${r.grabbed} · ` : ''}${r.onTop ? 'em cima' : `parou ${r.dy.toFixed(2)} m do topo`} · ${r.beyond.toFixed(2)} m além da quina`, ...(ok ? {} : { at: [c.feet.x + world.origin.x, c.feet.y + world.origin.y, c.feet.z + world.origin.z].map(Math.round) }) });
      // volta ao lugar de chegada (a outra quina foi achada de lá)
      ctx.ui.teleport(place, place);
      await sleep(2500);
    }
  }
  if (!nv) report({ kind: 'vault', ok: false, why: 'nenhuma quina baixa achada' });
  if (!nh) report({ kind: 'agarra', ok: false, why: 'nenhuma quina alta achada' });

  // ── queda: a borda de uma plataforma da teia, o vazio embaixo ──
  ctx.ui.teleport('teia', 'teia');
  controls.setMode('walk');
  await sleep(SETTLE);
  const F = world.field;
  const g = world.toGlobal(camera.position);
  let best = null;
  for (let tries = 0; tries < 3 && !best; tries++) {
    const n = F.nearestNode(g.x, g.y - 1.7, g.z, { below: 2, above: 1, reach: 2 + tries });
    if (!n) continue;
    w.col.buildsPerFrame = 600;
    w.col.refresh(new THREE.Vector3(n.x, n.y, n.z).sub(world.origin), 30);
    w.col.buildsPerFrame = 2;
    for (let q = 0; q < 16 && !best; q++) {
      const a = (q / 16) * Math.PI * 2;
      const ux = Math.sin(a);
      const uz = Math.cos(a);
      const R = edgeDist(n, ux, uz);
      const out = new THREE.Vector3(n.x + ux * (R + 0.55), n.y, n.z + uz * (R + 0.55)).sub(world.origin);
      // nada embaixo por 8 m, e nada saindo dali (ponte, conector)
      if (w.col.ray(out.clone().setY(out.y + 0.5), DOWN, 9)) continue;
      best = { n, out, yawAway: Math.atan2(-ux, -uz), topY: n.y - world.origin.y };
    }
  }
  if (!best) report({ kind: 'queda', ok: false, why: 'nenhuma borda sobre o vazio achada' });
  else {
    // de costas para a plataforma (olhando para fora), caindo rente à borda
    const feet = best.out.clone();
    feet.y = best.topY - 0.9;
    standAt(feet, best.yawAway);
    w.vel.set(0, -3, 0);
    w.grounded = false;
    w.airTime = 0.5;
    // diagnóstico: de onde a mão estaria, a quina é achada?
    const diag = [];
    {
      const save = w.feet.clone();
      w.feet.copy(feet);
      w.feet.y = best.topY - 1.7;
      w.col.buildsPerFrame = 600;
      w.col.refresh(w.feet, 30);
      w.col.buildsPerFrame = 2;
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const d = new THREE.Vector3(-Math.sin(best.yawAway + yaw), 0, -Math.cos(best.yawAway + yaw));
        diag.push(w._findLedge(d, 1, 1.25, 2.25) ? 'S' : `n(${w.ledgeWhy})`);
      }
      w.feet.copy(save);
    }
    const caught = await waitFor(() => !!w.ledge, 1.5);
    await sleep(500);
    controls.forceInput = { f: 1, r: 0, jump: false };
    await waitFor(() => !w.ledge && !w.climb, 4);
    controls.forceInput = { f: 0, r: 0, jump: false };
    await sleep(500);
    controls.forceInput = null;
    const onTop = Math.abs(w.feet.y - best.topY) < 0.3 && w.grounded;
    report({ kind: 'queda', ok: caught && onTop, why: `pegou a borda ${caught} · ${onTop ? 'subiu, em cima' : `parou ${(w.feet.y - best.topY).toFixed(2)} m do topo`} · achável (frente/esq/trás/dir): ${diag.join('')}`, ...(caught && onTop ? {} : { at: [best.out.x + world.origin.x, best.topY + world.origin.y, best.out.z + world.origin.z].map(Math.round) }) });
  }

  // ── ponte suspensa: caindo do lado dela, as mãos pegam o piso ──
  const nav = world.entities.nav;
  let sus = null;
  for (let k = 0; k < 4 && !sus; k++) {
    if (k) {
      ctx.ui.teleport('teia', 'teia');
      controls.setMode('walk');
      await sleep(SETTLE);
    }
    const g2 = world.toGlobal(camera.position);
    for (let reach = 1; reach <= 4 && !sus; reach++) {
      const n0 = F.nearestNode(g2.x, g2.y - 1.7, g2.z, { below: 2, above: 2, reach });
      if (!n0) continue;
      for (const d of EDGE_DIRS) {
        const e = F.edge(n0, d);
        if (!e || e.kind !== 'suspended') continue;
        const pts = nav.edgePath(e, e.a);
        const p = pts[Math.floor(pts.length / 2)];
        const dx = pts[pts.length - 1].x - pts[0].x;
        const dz = pts[pts.length - 1].z - pts[0].z;
        const L = Math.hypot(dx, dz) || 1;
        sus = { p, side: new THREE.Vector3(dz / L, 0, -dx / L), w: Math.min(e.width, 4) };
        break;
      }
    }
  }
  if (!sus) report({ kind: 'ponte', ok: false, why: 'nenhuma ponte suspensa perto' });
  else {
    const top = new THREE.Vector3(sus.p.x, sus.p.y, sus.p.z).sub(world.origin);
    // o lado em que não há nada embaixo
    w.col.buildsPerFrame = 600;
    w.col.refresh(top, 30);
    w.col.buildsPerFrame = 2;
    let out = null;
    for (const sg of [1, -1]) {
      const o = top.clone().addScaledVector(sus.side, sg * (sus.w / 2 + 0.5));
      if (!w.col.ray(o.clone().setY(o.y + 0.5), DOWN, 9)) {
        out = { o, away: Math.atan2(-sg * sus.side.x, -sg * sus.side.z) };
        break;
      }
    }
    if (!out) report({ kind: 'ponte', ok: false, why: 'os dois lados têm algo embaixo' });
    else {
      // o piso no ponto (a ponte cede): a altura de verdade
      const dn = w.col.ray(top.clone().setY(top.y + 2), DOWN, 4);
      const deckY = dn ? dn.point.y : top.y;
      const feet = out.o.clone();
      feet.y = deckY - 0.9;
      standAt(feet, out.away);
      w.vel.set(0, -3, 0);
      w.grounded = false;
      w.airTime = 0.5;
      const caught = await waitFor(() => !!w.ledge, 1.5);
      const why0 = caught ? '' : (() => {
        const d = new THREE.Vector3(-Math.sin(out.away + Math.PI), 0, -Math.cos(out.away + Math.PI));
        w.feet.copy(feet).setY(deckY - 1.7);
        return w._findLedge(d, 1, 1.25, 2.25) ? '' : ` (${w.ledgeWhy})`;
      })();
      await sleep(500);
      controls.forceInput = { f: 1, r: 0, jump: false };
      await waitFor(() => !w.ledge && !w.climb, 4);
      controls.forceInput = { f: 0, r: 0, jump: false };
      await sleep(500);
      controls.forceInput = null;
      const onTop = Math.abs(w.feet.y - deckY) < 0.35 && w.grounded;
      report({ kind: 'ponte', ok: caught && onTop, why: `pegou o piso da ponte ${caught}${why0} · ${onTop ? 'subiu, em cima' : `parou ${(w.feet.y - deckY).toFixed(2)} m do piso`}` });
    }
  }

  }
  // ── corrimão: andando contra o corrimão da ponte inicial (1,1 m, fino), o corpo não passa ──
  ctx.ui.teleport('ponte', 'ponte');
  controls.setMode('walk');
  await sleep(SETTLE);
  {
    const g0 = world.toGlobal(camera.position);
    // a ponte inicial corre ao longo de z em x = 0, 6 m de largura: corrimãos em x = ±2,8
    standAt(new THREE.Vector3(0.5, g0.y - 1.7, g0.z).sub(new THREE.Vector3(world.origin.x, world.origin.y, world.origin.z)).setY(camera.position.y - 1.7), -Math.PI / 2);
    await sleep(500);
    controls.forceInput = { f: 1, r: 0, jump: false, run: true };
    await sleep(3000);
    controls.forceInput = null;
    const x = world.toGlobal(camera.position).x;
    report({ kind: 'corrimao', ok: x < 2.8, why: `andando 3 s contra o corrimão: parou em x = ${x.toFixed(2)} m (o corrimão está em 2,8)` });
  }

  // ── pela borda: pendurado, andar de lado ──
  if (!only) {
    let ok = false;
    let why = 'nenhuma quina alta perto';
    for (const place of ['silo', 'colmeia', 'macico', 'escadaria']) {
      ctx.ui.teleport(place, place);
      controls.setMode('walk');
      await sleep(SETTLE);
      const c = scanLedges(ctx).hang;
      if (!c) continue;
      standAt(c.feet, c.yaw);
      await sleep(600);
      controls.forceInput = { f: 0, r: 0, jump: true };
      await sleep(150);
      controls.forceInput = { f: 0, r: 0, jump: false };
      const hung = await waitFor(() => !!w.ledge, 1.5);
      if (!hung) {
        why = `${place}: não agarrou`;
        continue;
      }
      await sleep(400);
      const p0 = w.feet.clone();
      // tenta um lado; se a borda acaba logo, o outro
      let moved = 0;
      for (const r of [1, -1]) {
        controls.forceInput = { f: 0, r, jump: false };
        await sleep(2000);
        moved = Math.hypot(w.feet.x - p0.x, w.feet.z - p0.z);
        if (moved > 0.8) break;
      }
      controls.forceInput = { f: 0, r: 0, jump: false };
      await sleep(300);
      const still = !!w.ledge;
      controls.forceInput = null;
      ok = still && moved > 0.8;
      why = `${place}: andou ${moved.toFixed(2)} m pela borda em 2 s · ${still ? 'ainda pendurado' : 'caiu'}`;
      break;
    }
    report({ kind: 'borda', ok, why });
  }

  // ── mobilidade (o cofre, Mobilidade): na arena, com a fachada de lajes sob a borda −x ──
  if (!only || only === 'mobilidade') {
    const arena = await buildArena(ctx, { facade: true });
    if (!arena) report({ kind: 'descer-borda', ok: false, why: 'sem arena' });
    else {
      const { y0, edgeX, c } = arena;
      // de costas para a borda −x (olhando +x: yaw −π/2), andando para trás
      arena.place(edgeX + 1.2, c.z, -Math.PI / 2);
      await sleep(800);
      controls.forceInput = { f: -1, r: 0, jump: false };
      const hung = await waitFor(() => !!w.ledge, 4);
      await sleep(300);
      const g = () => w.feet.clone().add(world.origin);
      const top0 = w.ledge ? w.ledge.topY + world.origin.y : NaN;
      const fy = g().y;
      report({ kind: 'descer-borda', ok: hung && Math.abs(top0 - y0) < 0.1 && Math.abs(fy - (y0 - w.eye - 0.02)) < 0.15, why: `andando de costas: ${hung ? `pendurado na borda (topo ${(top0 - y0).toFixed(2)} m, pés ${(fy - y0).toFixed(2)} m)` : `não se pendurou (pés ${(fy - y0).toFixed(2)} m, ${w.grounded ? 'no chão' : 'no ar'})`}` });
      // ainda segurando "trás": não solta (pede apertar de novo)
      await sleep(800);
      const held = !!w.ledge;
      // solta: as mãos pegam a laje de baixo, e a outra
      const tops = [];
      for (let i = 0; i < 2 && w.ledge; i++) {
        controls.forceInput = { f: 0, r: 0, jump: false };
        await sleep(300);
        controls.forceInput = { f: -1, r: 0, jump: false };
        await sleep(250);
        controls.forceInput = { f: 0, r: 0, jump: false };
        const t0 = w.ledge;
        await waitFor(() => !!w.ledge && w.ledge !== t0, 3);
        tops.push(w.ledge ? +(w.ledge.topY + world.origin.y - y0).toFixed(2) : null);
      }
      controls.forceInput = null;
      const want = arena.facadeTops.map((t) => +(t - y0).toFixed(2));
      const okDown = held && tops.length === 2 && tops.every((t, i) => t !== null && Math.abs(t - want[i]) < 0.1);
      report({ kind: 'soltar-baixo', ok: okDown, why: `segurando trás: ${held ? 'continuou pendurado' : 'SOLTOU'} · soltando: pegou as bordas em ${JSON.stringify(tops)} (as lajes em ${JSON.stringify(want)})` });
      controls.forceInput = null;
      arena.remove();
    }
    // os cantos e os saltos, no ginásio
    const gym = await buildArena(ctx, { gym: true });
    if (gym) {
      const { c, y0 } = gym;
      const G = () => w.feet.clone().add(world.origin);
      /** de pé em (x, z) (relativos ao centro), olhando −z, pula e agarra a borda à frente */
      const hangAt = async (x, z) => {
        controls.forceInput = null;
        w.ledge = null;
        w.climb = null;
        gym.place(c.x + x, c.z + z, 0);
        await sleep(700);
        controls.forceInput = { f: 0, r: 0, jump: true };
        await sleep(150);
        controls.forceInput = { f: 0, r: 0, jump: false };
        return await waitFor(() => !!w.ledge, 2);
      };
      const nrmTxt = () => (w.ledge ? `(${w.ledge.nrm.x.toFixed(1)}, ${w.ledge.nrm.z.toFixed(1)})` : '—');
      // canto de fora: no L, indo para −x até o fim do braço
      {
        const hung = await hangAt(3.5, 4.6);
        controls.forceInput = { f: 0, r: -1, jump: false };
        await waitFor(() => w.ledge && w.ledge.nrm.x < -0.9, 5);
        await sleep(600);
        const p = G();
        const ok = hung && !!w.ledge && w.ledge.nrm.x < -0.9 && p.x < c.x + 2;
        report({ kind: 'canto-fora', ok, why: `pendurado ${hung} · a borda agora olha para ${nrmTxt()} · pés em x ${(p.x - c.x).toFixed(2)}, z ${(p.z - c.z).toFixed(2)} (o canto em x 2, z 4)` });
      }
      // canto de dentro: indo para +x até o outro braço do L
      {
        const hung = await hangAt(3.5, 4.6);
        controls.forceInput = { f: 0, r: 1, jump: false };
        await waitFor(() => w.ledge && w.ledge.nrm.x < -0.9, 6);
        await sleep(600);
        const p = G();
        const ok = hung && !!w.ledge && w.ledge.nrm.x < -0.9 && p.x > c.x + 5 && p.z > c.z + 4;
        report({ kind: 'canto-dentro', ok, why: `pendurado ${hung} · a borda agora olha para ${nrmTxt()} · pés em x ${(p.x - c.x).toFixed(2)}, z ${(p.z - c.z).toFixed(2)} (o canto em x 6, z 4)` });
      }
      // salto de lado: do A para o B (o vão de 1,5 m)
      {
        const hung = await hangAt(-5, -5.4);
        await sleep(400);
        controls.forceInput = { f: 0, r: 1, jump: true };
        await sleep(150);
        controls.forceInput = { f: 0, r: 0, jump: false };
        await sleep(1200);
        const p = G();
        const ok = hung && !!w.ledge && p.x > c.x - 2.6;
        report({ kind: 'salto-lado', ok, why: `pendurado no A ${hung} · depois do salto: ${w.ledge ? 'pendurado' : 'NÃO pendurado'} em x ${(p.x - c.x).toFixed(2)} (o B começa em −2,5)` });
      }
      // salto para trás: do A para o C (a 2,5 m, atrás)
      {
        const hung = await hangAt(-6, -5.4);
        await sleep(400);
        controls.forceInput = { f: -1, r: 0, jump: true };
        await sleep(150);
        controls.forceInput = { f: 0, r: 0, jump: false };
        await sleep(1200);
        const p = G();
        const ok = hung && !!w.ledge && w.ledge.nrm.z < -0.9 && p.z > c.z - 4.2;
        report({ kind: 'salto-tras', ok, why: `pendurado no A ${hung} · depois do salto: ${w.ledge ? `pendurado, a borda olhando ${nrmTxt()}` : 'NÃO pendurado'} · pés em z ${(p.z - c.z).toFixed(2)} (a face do C em −3,5)` });
      }
      controls.forceInput = null;
      gym.remove();
    } else report({ kind: 'canto-fora', ok: false, why: 'sem arena' });
  }
}
