// ─────────────────────────────────────────────────────────────────────────────
//  A vida (o cofre, Ideias/Futuro/Barra-de-vida). O corpo aguenta muito, não tudo.
//
//    vida      ctx.player.health.value, 0..1 (salva no slot). Separada da célula: a
//              célula é o que você gasta; a vida é o que o mundo (e o emissor) tira.
//    ligada?   Peregrinação: sempre. Livre: a opção nas configurações (V5) —
//              ctx.rules.health
//    o que tira
//      queda     pela altura (a energia, v²): nada abaixo de 10 m (17,3 m/s com g = 15);
//                cresce até zerar em 38 m/s (~48 m) — fallDamage()
//      choque    contra um obstáculo, SÓ arremessado por um hostil (walker.thrown):
//                de 12 m/s em diante, ~25% a 30 m/s — slamDamage(). O próprio coice
//                do emissor contra a parede não tira vida (só o baque)
//      emissor   o disparo em sobrecarga, pelo estágio — BEAM_DAMAGE (a mão queima, a mira treme)
//      golpe     o golpe com arremesso de um hostil (app/safeguards.js): −50%
//    zerar     não é fim de jogo: é o desmaio (app/wake.js). Por um hostil, a captura
//              de hoje; por queda, choque ou o emissor, a sequência da queda. No despertar,
//              a vida volta cheia.
//    voltar    só o tempo (V4): 1%/s depois de 6 s sem dano
//    mostrar   no aparelho, ao lado da carga (V1), só quando muda (V2 — app/carried.js);
//              no Livre (sem o aparelho), uma linha no HUD
//    o corpo fala  com pouca vida: as bordas fecham um pouco, o foco se perde de leve,
//              o coração bate; levar dano: a tela pisca o escuro
// ─────────────────────────────────────────────────────────────────────────────
import { t } from '../i18n/index.js';

/** A gravidade do Walker (controls/walker.js): a altura de uma queda é v² / 2g. */
const G = 15;
export const FALL = { safe: 10, lethal: 38 };
const V2_SAFE = 2 * G * FALL.safe; // 300 (17,3 m/s)
const V2_LETHAL = FALL.lethal * FALL.lethal; // 1444

/** O dano de um pouso com impacto vertical v (m/s): pela energia, entre 10 m de queda e 38 m/s. */
export function fallDamage(v) {
  const v2 = v * v;
  if (v2 <= V2_SAFE) return 0;
  if (v >= FALL.lethal) return 1;
  return (v2 - V2_SAFE) / (V2_LETHAL - V2_SAFE);
}

/** O dano do choque contra um obstáculo, arremessado (m/s contra ele): de 12 m/s, ~25% a 30. */
export const SLAM = { from: 12, at30: 0.25 };
export function slamDamage(v) {
  return v <= SLAM.from ? 0 : ((v - SLAM.from) / (30 - SLAM.from)) * SLAM.at30;
}

/** O dano do disparo do emissor pelo estágio da sobrecarga (0 … 7): azul 0 · violeta 5% ·
 *  a singularidade se formando 12% · o limite 30%; além do limite (o braço vai), o do limite. */
export const BEAM_DAMAGE = [0, 0, 0.05, 0.12, 0.3, 0.3, 0.3, 0.3];

export const STRIKE_DAMAGE = 0.5;
/** O golpe de um humano (os moradores de uma vila hostil — o cofre, Dano-do-emissor §4). */
export const HUMAN_STRIKE_DAMAGE = 0.25;
/** O arremesso do golpe (m/s): horizontal, para longe de quem golpeou; e para cima. */
export const THROW = { h: [12, 16], up: [4, 6] };
export const REGEN = { delay: 6, rate: 0.01 };
/** s que a vida fica no aparelho depois de encher */
const SHOW_AFTER = 3;
/** abaixo disto, o corpo fala */
const LOW = 0.35;

export function createHealth(ctx) {
  const { controls, audio, world } = ctx;
  const player = ctx.player;
  player.health ??= { value: 1, max: 1 };
  const U = ctx.signal.uniforms;
  let since = 1e9; // s desde o último dano
  let shown = 0; // s que ainda fica no aparelho
  let flash = 0; // a tela pisca o escuro (0..1)
  let haze = 0; // o foco borrado de um golpe (0..1)
  let tremor = 0; // s de mira tremendo (a mão queimada)
  let tremorK = 0;
  const applied = { p: 0, y: 0 };
  let nextBeat = 0;
  let lastCause = null;

  const enabled = () => {
    const r = ctx.rules.health;
    return r === true || (r === 'setting' && !!ctx.settings.health);
  };
  const frac = () => player.health.value / player.health.max;

  /**
   * Tira vida. source: 'fall' | 'slam' | 'beam' | 'strike'; amount: 0..1 (da vida cheia).
   * opts.by: quem golpeou (o corpo — a captura ao zerar). Devolve a vida que sobrou (ou null: desligada).
   */
  function damage(source, amount, opts = {}) {
    if (!enabled() || ctx.wake?.active || amount <= 0) return null;
    const h = player.health;
    const before = h.value;
    h.value = Math.max(0, h.value - amount * h.max);
    since = 0;
    shown = SHOW_AFTER;
    lastCause = source;
    // o corpo sente: escuro de um instante, o foco, a vibração
    const k = Math.min(1, amount * 2);
    flash = Math.max(flash, source === 'strike' ? 0.85 : 0.25 + 0.5 * k);
    haze = Math.max(haze, source === 'strike' ? 0.6 : 0.3 * k);
    if (source === 'beam') {
      tremor = Math.max(tremor, 1.5 + 6 * amount);
      tremorK = Math.max(tremorK, 0.4 + 2 * amount);
    }
    controls.rumble?.(Math.min(1, 0.3 + k), Math.min(1, 0.2 + k), 200 + 400 * k);
    world.bus.emit('player:hurt', { source, amount, value: h.value, before });
    if (!ctx.rules.resources && ctx.settings.health) ctx.hud?.push(t('hud.health', { n: Math.round(frac() * 100) }));
    if (h.value <= 0) zero(source, opts);
    return h.value;
  }

  /** Zerou: o desmaio. Por um hostil, a captura de hoje; por queda, choque ou o emissor, a queda. */
  function zero(source, opts) {
    world.bus.emit('player:zero', { source });
    if (source === 'strike' && opts.by) {
      opts.catch?.(opts.by);
      return;
    }
    ctx.wake.start('impact');
  }

  /**
   * O golpe de um hostil chegou (e: o corpo dele; hit: você ainda ao alcance): −amount e o
   * arremesso para longe dele (controls/walker.js throwBody); zerou → onZero(e) (a captura).
   * Sem a vida (o Livre sem a opção), só o arremesso.
   */
  function struck(e, hit, amount, onZero) {
    if (ctx.wake?.active) return;
    const [pan, dist] = ctx.placeOf(e.feet.x, e.feet.y + 1.2, e.feet.z);
    if (!hit) {
      audio.sgStepAt?.(pan, dist, true); // errou: o braço passa no ar, o pé bate
      return;
    }
    const w = controls.walker;
    const p = world.toGlobal(ctx.camera.position);
    let dx = p.x - e.feet.x;
    let dz = p.z - e.feet.z;
    const h = Math.hypot(dx, dz);
    if (h < 1e-3) {
      dx = -Math.sin(e.yaw);
      dz = -Math.cos(e.yaw);
    } else {
      dx /= h;
      dz /= h;
    }
    audio.impact?.(28);
    world.bus.emit('player:struck', { x: e.feet.x, y: e.feet.y, z: e.feet.z, by: e.kind });
    if (enabled()) {
      const left = damage('strike', amount, { by: e, catch: onZero });
      if (left === null || left <= 0 || ctx.wake?.active) return; // zerou: a captura
    }
    ctx.beam?.cancel?.('golpe');
    const r = Math.random();
    const v = THROW.h[0] + r * (THROW.h[1] - THROW.h[0]);
    const up = THROW.up[0] + r * (THROW.up[1] - THROW.up[0]);
    w.throwBody(dx * v * controls.scale, dz * v * controls.scale, up * controls.scale);
    controls.pitch = Math.min(1.2, controls.pitch + 0.3); // a cabeça vai para trás com o golpe
    if (!enabled()) controls.rumble?.(0.9, 0.7, 400);
  }

  // no despertar, a vida volta cheia
  world.bus.on('player:wake', () => {
    player.health.value = player.health.max;
    since = 1e9;
    shown = 0;
    flash = 0;
    haze = 0;
    tremor = 0;
  });

  return {
    get enabled() {
      return enabled();
    },
    /** 0..1 */
    get value() {
      return frac();
    },
    /** o aparelho mostra a vida? (V2: só quando muda) */
    get visible() {
      return enabled() && (frac() < 1 || shown > 0);
    },
    /** a última causa de dano (os testes) */
    get lastCause() {
      return lastCause;
    },
    /** o quanto as bordas fecham pela vida baixa (0..1) — app/beamfx.js soma ao dele */
    get faint() {
      return enabled() && !ctx.wake?.active ? Math.max(0, 1 - frac() / LOW) * 0.22 : 0;
    },
    damage,
    struck,
    /** (testes e o futuro) devolve vida */
    heal(amount) {
      const h = player.health;
      h.value = Math.min(h.max, h.value + amount * h.max);
      world.bus.emit('player:healed', { value: h.value });
    },
    /** (testes) a vida exata */
    set(v) {
      player.health.value = v * player.health.max;
      since = 1e9;
    },
    update(dt) {
      const h = player.health;
      const awake = !ctx.wake?.active;
      since += dt;
      // V4: só o tempo — 1%/s depois de 6 s sem dano
      if (awake && enabled() && h.value < h.max && since > REGEN.delay) {
        h.value = Math.min(h.max, h.value + REGEN.rate * h.max * dt);
        if (h.value >= h.max) {
          shown = SHOW_AFTER;
          world.bus.emit('player:healed', { value: h.value });
        }
      }
      if (h.value >= h.max) shown = Math.max(0, shown - dt);

      // a mira treme (a mão queimada pelo emissor) — um desvio que não se acumula
      let wp = 0;
      let wy = 0;
      if (tremor > 0 && awake) {
        tremor = Math.max(0, tremor - dt);
        const a = 0.004 * tremorK * Math.min(1, tremor);
        const tt = ctx.time;
        wp = (Math.sin(tt * 31.7) + Math.sin(tt * 17.3 + 1.1)) * a;
        wy = (Math.sin(tt * 27.1 + 2.3) + Math.sin(tt * 13.9)) * a * 0.7;
      } else if (tremor <= 0) tremorK = 0;
      if (awake) {
        controls.pitch += wp - applied.p;
        controls.yaw += wy - applied.y;
      }
      applied.p = awake ? wp : 0;
      applied.y = awake ? wy : 0;

      if (!awake) return; // o desmaio é dono da tela (app/wake.js)
      // o corpo fala: a tela pisca o escuro ao levar dano; com pouca vida, o foco e o coração
      flash *= Math.exp(-dt * 7);
      haze *= Math.exp(-dt * 2.5);
      const low = enabled() ? Math.max(0, 1 - frac() / LOW) : 0;
      U.uBlack.value = flash < 0.01 ? 0 : flash;
      U.uBlur.value = Math.max(haze, low * 0.15);
      U.uFaint.value = Math.max(U.uFaint.value, low * 0.22);
      if (low > 0) {
        nextBeat -= dt;
        if (nextBeat <= 0) {
          audio.heartbeat?.();
          nextBeat = 1.6 - 0.7 * low;
        }
      } else nextBeat = 0;
    },
  };
}
