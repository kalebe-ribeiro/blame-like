// ─────────────────────────────────────────────────────────────────────────────
//  Queda e despertar (modo Peregrinação — ver o cofre, Queda-e-despertar).
//
//  Uma queda que seria fatal não mata: você desmaia, alguém (algo) te arrasta
//  e te larga num lugar qualquer — e você acorda. Hoje ninguém é visto; no
//  futuro quem arrasta será sorteado (Safeguards → cemitério, NPCs → colônia).
//
//    impacto   a câmera desaba até o chão, com um giro
//    apagando  as bordas escurecem, o foco se perde, o som abafa
//    escuro    batimentos; enquanto isso, o corpo é levado (o mundo carrega lá)
//    abrindo   piscadas lentas, ainda borrado
//    arrastado 6–10 s: o chão passa sob você aos puxões; quem arrasta está
//              atrás — dá para mexer a cabeça, nunca o bastante para ver
//    fechando  a visão apaga de novo
//    despertar deitado, a visão volta, e o corpo se levanta devagar
//
//  Queda sem fim (o vazio): começa do "apagando", ainda no ar.
//
//  QUEM ARRASTA (fase 5 — pronto, ainda DESLIGADO: WAKE_LOTTERY.enabled):
//    'safeguard' → acorda no cemitério de vítimas mais perto (estrutura única
//                  'graveyard'), sem carga e sem o que carregava (as ferramentas ficam)
//    'npc'       → acorda numa vila ('village'; hoje abandonada — os NPCs são da fase 7)
//    ninguém     → um lugar qualquer, longe (como sempre foi)
//  Nas sessões de desenvolvimento: --wakeas=safeguard|npc força o sorteio.
//  As posições ficam em coordenadas GLOBAIS (a origem flutuante muda no salto).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { findDestination } from '../world/teleport.js';

// lugares com chão onde um corpo pode ser largado
const DUMP_KINDS = ['teia', 'colmeia', 'macico', 'galeria', 'estrato', 'poco', 'conduto', 'escadaria', 'trelica', 'camada', 'deposito', 'silo', 'maquinas'];
const EYE_LOW = 0.35; // m: olhos rente ao chão
const DOWN = new THREE.Vector3(0, -1, 0);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rand = (a, b) => a + Math.random() * (b - a);

/** O sorteio de quem arrasta o corpo desmaiado (ligado quando existirem Safeguards e NPCs). */
export const WAKE_LOTTERY = { enabled: false, safeguard: 0.55, npc: 0.2 };
const TAKER_PLACE = { safeguard: 'graveyard', npc: 'village' };

export function createWake(ctx) {
  const { controls, camera, world, audio } = ctx;
  const U = ctx.signal.uniforms;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _v = new THREE.Vector3();
  const _o = new THREE.Vector3();
  let s = null; // a sequência em andamento

  /** Um lugar com chão, longe: 1,5–6 km em volta, qualquer tipo de lugar. */
  function pickDump(g) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(1500, 6000);
      const p = new THREE.Vector3(g.x + Math.cos(a) * r, g.y + rand(-900, 900), g.z + Math.sin(a) * r);
      const d = findDestination(world.field, DUMP_KINDS[Math.floor(Math.random() * DUMP_KINDS.length)], p, new Set());
      // largado onde há alguma luz: no escuro total não se veria o chão passando
      if (d && !d.fly && world.field.sectorAt(d.feet.x, d.feet.y, d.feet.z).state !== 'dark') return d.feet.clone();
    }
    return null;
  }

  /** Quem arrastou: 'safeguard', 'npc' ou null (ninguém visto). */
  function drawTaker() {
    const forced = ctx.params?.get('wakeas');
    if (forced) return TAKER_PLACE[forced] ? forced : null;
    if (!WAKE_LOTTERY.enabled) return null;
    const x = Math.random();
    return x < WAKE_LOTTERY.safeguard ? 'safeguard' : x < WAKE_LOTTERY.safeguard + WAKE_LOTTERY.npc ? 'npc' : null;
  }

  /** O lugar de quem arrastou: a estrutura única do tipo certo mais perto (ou null). */
  function pickTakerPlace(taker, g) {
    const kind = TAKER_PLACE[taker];
    if (!kind) return null;
    let best = null;
    for (const R of [20000, 40000, 80000]) {
      for (const u of world.field.uniquesNear(g.x, g.y, g.z, R)) {
        if (u.kind !== kind) continue;
        const d = Math.hypot(u.x - g.x, u.y - g.y, u.z - g.z);
        if (!best || d < best.d) best = { u, d };
      }
      if (best) break;
    }
    if (!best) return null;
    // largado junto do console, um passo para dentro (no chão do pátio / do galpão)
    const c = world.field.uniqueConsole(best.u);
    return new THREE.Vector3(c.x - Math.sin(c.yaw) * 1.6, best.u.y + 1.25, c.z - Math.cos(c.yaw) * 1.6);
  }

  /** Há chão logo abaixo deste ponto GLOBAL? (e o mundo em volta já carregou) */
  function floorAt(gx, gy, gz) {
    const col = controls.walker.col;
    _v.set(gx, gy, gz).sub(world.origin);
    col.refresh(_v, 14);
    _o.copy(_v).y += 1.5;
    const hit = col.ray(_o, DOWN, 4);
    return hit && hit.face && hit.face.normal.y > 0.55 ? hit.point.y + world.origin.y : null;
  }

  /** Posiciona a câmera: pés GLOBAIS + altura dos olhos, olhando (yaw, pitch, roll). */
  function place(feet, eye, yaw, pitch, roll) {
    camera.position.set(feet.x - world.origin.x, feet.y - world.origin.y + eye, feet.z - world.origin.z);
    euler.set(pitch, yaw, roll, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camera.updateMatrixWorld();
  }

  function setFx(faint, blur, black, sound) {
    U.uFaint.value = faint;
    U.uBlur.value = blur;
    U.uBlack.value = black;
    audio.faint(sound);
  }

  /** Começa o desmaio. cause: 'impact' (queda fatal) ou 'void' (queda sem fim). */
  function start(cause) {
    if (s) return;
    const w = controls.walker;
    const feet = w.feet.clone().add(world.origin); // GLOBAL
    s = {
      cause,
      t: cause === 'void' ? 0.7 : 0, // no vazio pula o impacto
      phase: 'impact',
      from: feet.clone(),
      feet,
      yaw: controls.yaw,
      pitch: controls.pitch,
      eye: w.eye,
      nextBeat: 1.5,
    };
    controls.autopilot = false;
  }

  function update(dt) {
    if (!s) return;
    s.t += dt;
    const t = s.t;

    // ── 1. impacto: a câmera desaba até o chão, com um giro ──
    if (s.phase === 'impact') {
      const k = smooth(0, 0.7, t);
      place(s.feet, s.eye + (EYE_LOW - s.eye) * k, s.yaw, s.pitch + (-0.25 - s.pitch) * k, 0.4 * k);
      if (t >= 0.7) s.phase = 'fade';
      return;
    }

    // ── 2. apagando: bordas fecham, foco se perde, som abafa ──
    if (s.phase === 'fade') {
      const dur = s.cause === 'void' ? 2 : 3.5;
      const k = smooth(0.7, 0.7 + dur, t);
      if (s.cause === 'impact') place(s.feet, EYE_LOW, s.yaw, -0.25, 0.4);
      setFx(k, k, smooth(0.7 + dur * 0.6, 0.7 + dur, t), 0.9 * k);
      if (t >= 0.7 + dur) {
        s.phase = 'dark';
        s.darkT = t;
        // o corpo é levado: por quem arrastou (fase 5, desligado) ou a um lugar qualquer, longe
        s.taker = drawTaker();
        const taken = s.taker ? pickTakerPlace(s.taker, s.from) : null;
        if (!taken) s.taker = null; // não havia o lugar: ninguém foi visto
        const dest = taken ?? pickDump(s.from) ?? s.from.clone().setY(s.from.y + 2);
        s.feet = dest;
        s.dragDir = rand(0, Math.PI * 2);
        s.nextTug = 0;
        place(s.feet, EYE_LOW, 0, 0, 0);
      }
      return;
    }

    // batimentos no escuro e enquanto a visão está fechada
    if (s.phase === 'dark' || s.phase === 'close' || s.phase === 'darkAgain') {
      if (t > s.nextBeat) {
        audio.heartbeat();
        s.nextBeat = t + rand(1.1, 1.4);
      }
    }

    // ── 3. escuro: espera o lugar carregar (no mínimo 3 s, no máximo 15 s) ──
    if (s.phase === 'dark') {
      setFx(1, 1, 1, 0.9);
      place(s.feet, EYE_LOW, 0, 0, 0); // mantém o streaming em volta do destino
      const y = floorAt(s.feet.x, s.feet.y, s.feet.z);
      if (y !== null) s.feet.y = y;
      if ((y !== null && t - s.darkT > 3) || t - s.darkT > 15) {
        s.phase = 'open';
        s.openT = t;
        s.dragDur = rand(6, 10);
        s.lookBase = s.dragDir + Math.PI; // olha para os próprios pés, de costas para quem arrasta
        controls.yaw = s.lookBase;
        controls.pitch = -0.1;
      }
      return;
    }

    // a cabeça mexe um pouco (o mouse ainda funciona), nunca a ponto de ver quem arrasta
    const look = () => {
      let dy = controls.yaw - s.lookBase;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      dy = Math.max(-0.45, Math.min(0.45, dy));
      controls.yaw = s.lookBase + dy;
      controls.pitch = Math.max(-0.6, Math.min(0.12, controls.pitch));
      return [controls.yaw, controls.pitch];
    };

    // ── 4. abrindo: piscadas lentas, borrado ──
    if (s.phase === 'open') {
      const k = t - s.openT;
      const blink = Math.max(0, Math.sin(k * 2.4)) * smooth(0, 2.6, k);
      setFx(0.75, 0.85, 1 - 0.8 * blink, 0.7);
      const [yaw, pitch] = look();
      place(s.feet, EYE_LOW, yaw, pitch, 0.25);
      if (k > 2.6) {
        s.phase = 'drag';
        s.dragT = t;
      }
      return;
    }

    // ── 5. arrastado: o chão passa aos puxões ──
    if (s.phase === 'drag') {
      const k = t - s.dragT;
      setFx(0.38, 0.4, 0.03 + 0.04 * Math.max(0, Math.sin(t * 5.3)), 0.6);
      if (t >= s.nextTug) {
        s.nextTug = t + rand(1.1, 1.6);
        s.tugT = t;
        s.tugLen = rand(0.7, 1.2);
        audio.dragScrape(rand(0.7, 1));
        controls.rumble?.(0.25, 0.15, 250);
      }
      // cada puxão: um avanço curto e brusco, que para
      const since = t - (s.tugT ?? -9);
      if (since < 0.5) {
        const step = (s.tugLen / 0.5) * dt * (1 - since / 0.5) * 2;
        const nx = s.feet.x + Math.cos(s.dragDir) * step;
        const nz = s.feet.z + Math.sin(s.dragDir) * step;
        const y = floorAt(nx, s.feet.y, nz);
        if (y !== null && Math.abs(y - s.feet.y) < 0.6) {
          s.feet.set(nx, y, nz);
        } else {
          // sem chão à frente: quem arrasta muda de rumo (e a câmera vira com o corpo)
          const turn = rand(0.7, 1.4) * (Math.random() < 0.5 ? -1 : 1);
          s.dragDir += turn;
          s.lookBase += turn;
          controls.yaw += turn;
        }
      }
      const [yaw, pitch] = look();
      // o corpo sacode um pouco a cada puxão
      const jolt = since < 0.5 ? Math.sin(since * 20) * 0.03 * (1 - since / 0.5) : 0;
      place(s.feet, EYE_LOW + jolt, yaw, pitch + jolt, 0.25);
      if (k > s.dragDur) {
        s.phase = 'close';
        s.closeT = t;
      }
      return;
    }

    // ── 6. fechando: a visão apaga de novo ──
    if (s.phase === 'close') {
      const k = smooth(0, 1.6, t - s.closeT);
      setFx(0.38 + 0.62 * k, 0.4 + 0.6 * k, k, 0.6 + 0.3 * k);
      const [yaw, pitch] = look();
      place(s.feet, EYE_LOW, yaw, pitch, 0.25);
      if (t - s.closeT > 1.6) {
        s.phase = 'darkAgain';
        s.darkT = t;
      }
      return;
    }
    if (s.phase === 'darkAgain') {
      setFx(1, 1, 1, 0.9);
      if (t - s.darkT > 1.8) {
        s.phase = 'wake';
        s.wakeT = t;
        s.lieYaw = rand(0, Math.PI * 2);
      }
      return;
    }

    // ── 7. despertar: deitado, a visão volta; depois o corpo se levanta ──
    if (s.phase === 'wake') {
      const k = t - s.wakeT;
      const open = smooth(0, 2.2, k);
      setFx(0.6 * (1 - smooth(0.5, 4, k)), 0.7 * (1 - smooth(0.8, 4.5, k)), 1 - open, 0.8 * (1 - smooth(1, 5, k)));
      const rise = smooth(3.2, 6, k);
      const eye = EYE_LOW + (s.eye - EYE_LOW) * rise;
      place(s.feet, eye, s.lieYaw, 0.95 * (1 - rise), 0.45 * (1 - rise));
      if (k > 6) finish();
    }
  }

  function finish() {
    setFx(0, 0, 0, 0);
    controls.yaw = s.lieYaw;
    controls.pitch = 0;
    controls.placeFeet(_v.copy(s.feet).sub(world.origin));
    // os Safeguards descartam: sem carga e sem o que se carregava (as ferramentas ficam)
    if (s.taker === 'safeguard') {
      ctx.player.energy.value = Math.min(ctx.player.energy.value, 0.05);
      ctx.player.carried = [];
    }
    world.bus.emit('player:wake', { from: s.from, to: s.feet.clone(), cause: s.cause, taker: s.taker ?? null });
    s = null;
  }

  return {
    get active() {
      return !!s;
    },
    start,
    update,
  };
}
