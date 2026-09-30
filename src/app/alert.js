// ─────────────────────────────────────────────────────────────────────────────
//  Percepção e alerta (fase 5) — o que os Safeguards vão usar na fase 6.
//
//  A Cidade não vê o jogador: ela NOTA o que muda. Cada setor (Field.sectorAt)
//  tem um nível de alerta 0..1 que sobe com o que acontece nele, pelo barramento
//  de eventos (core/events.js), e esfria devagar:
//
//    leu um terminal           +0,06   (player:read)
//    religou o setor           +0,45   (sector:restore — o mais barulhento)
//    pintou uma marca          +0,02   (player:mark)
//    luz acesa num setor apagado  +0,004/s (a lanterna no escuro: percepção contínua)
//
//  O ACESSO do jogador (ctx.player.access — o análogo do gene de terminal da
//  rede, 0 = nenhum) abafa tudo: com acesso 1 a Cidade não liga. Hoje ninguém
//  tem acesso: o dado existe para as fases 6 e 7.
//
//  Ao cruzar 0,25 / 0,5 / 0,75 o barramento recebe 'alert:rise' { sector, level, step }
//  — é a porta de entrada dos Safeguards (ainda ninguém escuta). Nada aparece na tela.
//  Salvo no mundo (slot.alert: id do setor → { v, t }); esfria mesmo com o jogo fechado.
// ─────────────────────────────────────────────────────────────────────────────

const HALF_LIFE = 600; // s: metade do alerta vai embora em 10 min
const GAIN = { read: 0.06, restore: 0.45, mark: 0.02, lightPerS: 0.004 };
const STEPS = [0.25, 0.5, 0.75];

export function createAlert(ctx) {
  const { world, slot } = ctx;
  const bus = world.bus;
  // id → { v, t (Date.now() da última atualização) }
  let levels = slot.alert ?? {};
  slot.alert = levels;

  const decayed = (rec, now) => rec.v * Math.pow(0.5, (now - rec.t) / 1000 / HALF_LIFE);

  function level(x, y, z) {
    const rec = levels[world.field.sectorAt(x, y, z).id];
    return rec ? decayed(rec, Date.now()) : 0;
  }

  function raise(x, y, z, amount) {
    const access = Math.max(0, Math.min(1, ctx.player.access ?? 0));
    const gain = amount * (1 - access);
    if (gain <= 0) return;
    const sector = world.field.sectorAt(x, y, z);
    const now = Date.now();
    const rec = levels[sector.id] ?? { v: 0, t: now };
    const before = decayed(rec, now);
    const v = Math.min(1, before + gain);
    levels[sector.id] = { v, t: now };
    for (let i = 0; i < STEPS.length; i++) {
      if (before < STEPS[i] && v >= STEPS[i]) bus.emit('alert:rise', { sector: sector.id, level: v, step: i + 1, x, y, z });
    }
    // os que esfriaram de todo saem do salvamento
    if (Object.keys(levels).length > 200) {
      for (const [id, r] of Object.entries(levels)) if (decayed(r, now) < 0.01) delete levels[id];
    }
  }

  const here = () => world.toGlobal(ctx.camera.position);
  bus.on('player:read', () => {
    const g = here();
    raise(g.x, g.y, g.z, GAIN.read);
  });
  bus.on('sector:restore', (ev) => raise(ev.x, ev.y, ev.z, GAIN.restore));
  bus.on('player:mark', (ev) => raise(ev.x, ev.y, ev.z, GAIN.mark));

  let acc = 0;
  return {
    level,
    raise,
    /** Um mundo novo: tudo esfria. */
    reset() {
      levels = {};
      slot.alert = levels;
    },
    update(dt) {
      // a lanterna acesa num setor apagado é vista (percepção contínua, somada a cada 1 s)
      if (!ctx.carried?.lanternOn) return;
      acc += dt;
      if (acc < 1) return;
      const g = here();
      if (world.field.sectorAt(g.x, g.y, g.z).state === 'dark') raise(g.x, g.y, g.z, GAIN.lightPerS * acc);
      acc = 0;
    },
    get levels() {
      return levels;
    },
  };
}
