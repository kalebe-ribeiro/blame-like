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
//  Vida e dano entram só quando houver Safeguards, sem reescrever isto.
// ─────────────────────────────────────────────────────────────────────────────

export function createPlayerState(saved) {
  const base = {
    energy: { value: 1, max: 1 },
    inventory: [],
    carried: [],
    access: 0,
    hands: { right: null, left: null }, // as mãos começam vazias (app/inventory.js)
  };
  if (!saved) return base;
  return { ...base, ...saved, energy: { ...base.energy, ...(saved.energy ?? {}) } };
}
