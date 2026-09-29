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
  },
  pilgrimage: {
    id: 'pilgrimage',
    fly: false,
    teleport: false,
    regenerate: false,
    hud: false,
    translation: true,
    resources: true,
    // até a fase 1 (desmaio e despertar), uma queda sem fim é interrompida
    fallRescue: 'always',
  },
};

export function rulesFor(mode) {
  return MODES[mode] ?? MODES.free;
}
