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
