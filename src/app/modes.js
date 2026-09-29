// ─────────────────────────────────────────────────────────────────────────────
//  Modos de jogo — escolhidos antes de iniciar um mundo; um mundo não troca
//  de modo. As regras ficam todas aqui: o resto do jogo pergunta a ctx.rules.
//
//  • Livre: contemplação e exploração sem regras (o jogo de antes): voo,
//    teletransporte, mundo novo com R, interface.
//  • Peregrinação: o jogo com progressão (ver o cofre, 15-Plano-de-Implementacao).
//    Sem voo, sem teletransporte, interface quase nula; a tradução só avança
//    aqui; energia e ferramentas chegam nas fases seguintes.
// ─────────────────────────────────────────────────────────────────────────────

export const MODES = {
  free: {
    id: 'free',
    fly: true, // F / piloto automático
    teleport: true, // T / painel de transporte
    regenerate: true, // R: mundo novo na hora
    hud: true, // a leitura de instrumento (tecla H)
    translation: false, // a tradução não avança aqui
    resources: false, // energia e luz como recurso (fase 1)
    fallRescue: 'setting', // realocar ao cair: opção nas configurações
    deathWake: false, // queda fatal → desmaio e despertar (app/wake.js)
    leads: false, // pistas: os endereços lidos viram rastros a seguir (app/leads.js)
  },
  pilgrimage: {
    id: 'pilgrimage',
    fly: false,
    teleport: false,
    regenerate: false,
    hud: false,
    translation: true,
    resources: true,
    fallRescue: 'never',
    // uma queda fatal (ou sem fim) vira desmaio: você é arrastado e acorda em outro lugar
    deathWake: true,
    leads: true,
  },
};

export function rulesFor(mode) {
  return MODES[mode] ?? MODES.free;
}
