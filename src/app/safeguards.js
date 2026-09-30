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
//    sons       passos secos de onde ele está; um tom quando te vê; a placa da
//               parede se abrindo; o zumbido de quem caça
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

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
    sg.onCatch = () => {
      bus.emit('player:caught', {});
      controls.rumble?.(0.9, 0.6, 500);
      ctx.wake.start('impact', 'safeguard');
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

  // sons
  bus.on('safeguard:step', (ev) => audio.sgStepAt(...ctx.placeOf(ev.x, ev.y, ev.z), ev.hunting));
  bus.on('safeguard:spot', (ev) => {
    audio.sgSpot(...ctx.placeOf(ev.x, ev.y, ev.z));
    controls.rumble?.(0.3, 0.2, 250);
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
