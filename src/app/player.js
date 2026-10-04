// ─────────────────────────────────────────────────────────────────────────────
//  Estado do corpo (salvo no mundo). Hoje só existe — nada o usa ainda:
//
//    energy     a célula que alimenta luz, sensor e leitor (fase 1: luz como
//               recurso; só conta no modo Peregrinação — ctx.rules.resources)
//    inventory  ferramentas encontradas: 'sensor', 'reader' (fases 2 e 3)
//    carried    o que se carrega e se perde quando os Safeguards te descartam
//               (as ferramentas ficam — ver o cofre, Queda-e-despertar)
//    access     o equivalente ao gene de terminal da rede: 0 = nenhum. No
//               futuro decide como os Safeguards reagem (fase 5 em diante)
//
//    health     a vida, 0..1 (app/health.js — o cofre, Barra-de-vida)
// ─────────────────────────────────────────────────────────────────────────────

export function createPlayerState(saved) {
  const base = {
    energy: { value: 1, max: 1 },
    inventory: [],
    carried: [],
    access: 0,
    hands: { right: null, left: null }, // as mãos começam vazias (app/inventory.js)
    health: { value: 1, max: 1 }, // a vida (app/health.js)
    armKind: { right: 'flesh', left: 'flesh' }, // 'prosthesis': o braço de metal (app/arms.js)
    arms: { right: true, left: true }, // um braço perdido (o emissor além do limite — app/beam.js) não segura nada
  };
  if (!saved) return base;
  const out = { ...base, ...saved, energy: { ...base.energy, ...(saved.energy ?? {}) }, arms: { ...base.arms, ...(saved.arms ?? {}) }, health: { ...base.health, ...(saved.health ?? {}) }, armKind: { ...base.armKind, ...(saved.armKind ?? {}) } };
  delete out.beamPower; // (a potência em níveis da primeira arma, retirada — a carga é pelo tempo)
  return out;
}
