// ─────────────────────────────────────────────────────────────────────────────
//  Os Safeguards no jogo (fase 6): liga o sistema do mundo (world/safeguards.js)
//  ao corpo do jogador, ao alerta, ao desmaio e aos sons.
//
//    ligados?   Peregrinação: sempre. Livre: a opção nas configurações
//               (desligados por padrão) — ctx.rules.safeguards
//    sentidos   o que o jogador está fazendo: lanterna acesa, correndo; o alerta
//               do setor (app/alert.js). Desmaiado ou voando: ninguém percebe.
//    barulhos   queda (pelo tamanho), leitura de terminal, alavanca da
//               subestação, marca pintada — quem estiver perto vai ver
//    alerta     alert:rise 2 (0,5) → um sai da parede; 3 (0,75) → dois (no aberto, sem
//               parede perto: vem o de ronda mais perto, pelo grafo)
//    captura    o toque → desmaio → acorda no cemitério de vítimas (app/wake.js)
//    o golpe    com a vida ligada (app/health.js), no lugar do toque: o braço vem, −50% e o
//               ARREMESSO (o Walker sem comando até pousar e levantar — controls/walker.js
//               throwBody); a captura de antes só quando a vida zera (o cofre, Barra-de-vida §3)
//    sons       passos secos de onde ele está; um tom quando te vê; a placa da
//               parede se abrindo; o zumbido de quem caça
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { STRIKE_DAMAGE } from './health.js';

/** O arremesso do golpe (m/s): horizontal, para longe dele; e para cima. */
export const THROW = { h: [12, 16], up: [4, 6] };

export function createSafeguards(ctx) {
  const { world, audio, controls } = ctx;
  const bus = world.bus;
  const g = new THREE.Vector3();

  const on = () => {
    const r = ctx.rules.safeguards;
    return r === true || (r === 'setting' && !!ctx.settings.safeguards);
  };

  function wire() {
    const sg = world.safeguards;
    sg.senses = () => {
      if (ctx.wake?.active || controls.mode !== 'walk') return null;
      return {
        lantern: !!ctx.carried?.lanternOn,
        running: Math.hypot(controls.walker.vel.x, controls.walker.vel.z) > 6,
        alertAt: (x, y, z) => ctx.alert?.level(x, y, z) ?? 0,
      };
    };
    const caught = (e) => {
      bus.emit('player:caught', {});
      // ele segura: parado, os braços em volta de você (app/wake.js — a animação de ser pego)
      if (e?.sg) {
        e.sg.state = 'grab';
        e.strikePose = null;
      }
      for (const o of sg.all()) if (o !== e && (o.sg.state === 'hunt' || o.sg.state === 'search' || o.sg.state === 'strike')) sg._lose(o);
      ctx.wake.start('caught', 'safeguard', { by: e });
    };
    sg.onCatch = caught;
    // com a vida: o golpe no lugar do toque (a pé — voando ninguém percebe mesmo)
    sg.strikes = () => !!ctx.health?.enabled && controls.mode === 'walk';
    sg.onStrike = (e, hit) => {
      if (ctx.wake?.active) return;
      const [pan, dist] = ctx.placeOf(e.feet.x, e.feet.y + 1.2, e.feet.z);
      if (!hit) {
        audio.sgStepAt?.(pan, dist, true); // errou: o braço passa no ar, o pé bate
        return;
      }
      const w = controls.walker;
      const p = here();
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
      bus.emit('player:struck', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
      const left = ctx.health.damage('strike', STRIKE_DAMAGE, {
        by: e,
        catch: (x) => {
          sg.stats.caught++;
          caught(x);
        },
      });
      if (left === null || left <= 0 || ctx.wake?.active) return; // zerou: a captura
      ctx.beam?.cancel?.('golpe');
      const r = Math.random();
      const v = THROW.h[0] + r * (THROW.h[1] - THROW.h[0]);
      const up = THROW.up[0] + r * (THROW.up[1] - THROW.up[0]);
      w.throwBody(dx * v * controls.scale, dz * v * controls.scale, up * controls.scale);
      // a cabeça vai para trás com o golpe
      controls.pitch = Math.min(1.2, controls.pitch + 0.3);
    };
  }
  wire();

  // barulhos: quem estiver perto ouve
  const here = () => world.toGlobal(ctx.camera.position, g);
  const noise = (r) => {
    const p = here();
    world.safeguards.hear(p.x, p.y - 1.7, p.z, r);
  };
  bus.on('player:fall', ({ height }) => noise(Math.min(60, 20 + height * 1.5)));
  bus.on('player:read', () => noise(18));
  bus.on('sector:restore', () => noise(70));
  bus.on('player:mark', () => noise(6));

  // o alerta: a Cidade manda caçadores pelas paredes
  bus.on('alert:rise', (ev) => {
    if (!on() || ev.step < 2 || ctx.wake?.active) return;
    const p = here();
    if (Math.hypot(ev.x - p.x, ev.y - p.y, ev.z - p.z) > 200) return;
    const n = ev.step === 2 ? 1 : 2;
    const made = world.safeguards.emerge(p, world.origin, n);
    // no aberto (nenhuma parede perto): vem quem está de ronda por perto, pelo grafo
    if (made < n) world.safeguards.summon(p, n - made);
  });

  // a vida de silício e os andarilhos (fase 7)
  bus.on('silicon:reveal', (ev) => {
    audio.siliconReveal(...ctx.placeOf(ev.x, ev.y, ev.z));
    controls.rumble?.(0.5, 0.3, 400);
  });
  bus.on('silicon:drain', () => audio.powerDown(0, 2, 30));
  bus.on('silicon:destroyed', (ev) => audio.clangAt(...ctx.placeOf(ev.x, ev.y, ev.z)));

  // sons
  bus.on('safeguard:step', (ev) => audio.sgStepAt(...ctx.placeOf(ev.x, ev.y, ev.z), ev.hunting));
  bus.on('safeguard:spot', (ev) => {
    audio.sgSpot(...ctx.placeOf(ev.x, ev.y, ev.z));
    controls.rumble?.(0.3, 0.2, 250);
  });
  // o golpe: o zumbido sobe enquanto ele recolhe o braço
  bus.on('safeguard:strike', (ev) => {
    audio.sgSpot(...ctx.placeOf(ev.x, ev.y + 1.2, ev.z));
    controls.rumble?.(0.25, 0.15, 150);
  });
  bus.on('safeguard:emerge', (ev) => {
    const [pan, dist] = ctx.placeOf(ev.x, ev.y, ev.z);
    audio.sgEmerge(pan, dist);
    controls.rumble?.(0.4 * Math.max(0, 1 - dist / 60), 0.2, 600);
  });

  return {
    /** Um mundo novo (world.build): liga de novo os sentidos. */
    wire,
    update() {
      const sg = world.safeguards;
      if (!sg) return;
      if (sg.senses === null) wire();
      sg.enabled = on();
      // o zumbido de quem caça mais perto
      let best = null;
      if (sg.enabled) {
        const p = here();
        for (const e of sg.all()) {
          if (e.sg.state !== 'hunt' && e.sg.state !== 'search') continue;
          const d = e.feet.distanceTo(p);
          if (!best || d < best.d) best = { e, d };
        }
      }
      if (best) audio.sgHum(ctx.placeOf(best.e.feet.x, best.e.feet.y, best.e.feet.z)[0], best.d, 1);
      else audio.sgHum(0, 100, 0);
    },
  };
}
