// ─────────────────────────────────────────────────────────────────────────────
//  Barramento de eventos: um canal só para tudo o que acontece no mundo e com
//  o corpo. Quem gera não sabe quem escuta — som, interface, diário e, no
//  futuro, o nível de alerta dos Safeguards (ver o cofre, Arquitetura-para-o-futuro).
//
//  O barramento vive no World e sobrevive a um mundo novo; os ouvintes se
//  registram uma vez só.
//
//  Eventos (payload — posições sempre GLOBAIS):
//    outage:start / outage:restore   ev do OutageSystem ({ c, maxR, … })
//    collapse:start / collapse:impact ev do CollapseSystem ({ pos, delay, … })
//    builder:work     { kind: 'clang'|'weld', x, y, z }
//    colossus:clamp   { x, y, z }
//    drip             { x, y, z }
//    player:fall      { height }         pouso depois de uma queda
//    player:board     { car }            subiu num vagão
//    player:photo     { }
//    player:transfer  { kind, from, to } teletransporte (modo Livre)
//    player:read      { id, site, learned, leads } leu um terminal (app/reading.js); leads: as rotas lidas
//    player:mark      { x, y, z }          pintou uma marca (app/marks.js)
//    lead:reveal      { lead, parts }      uma pista inteira, revelada (console ativo — app/uniques.js)
//    sector:restore   { id, sector, x, y, z } religou um setor numa subestação (world/substations.js)
//    player:learn     { words, source }   entendeu palavras numa inscrição (world/inscriptions.js)
//    player:wake      { from, to, cause }  acordou depois de um desmaio (app/wake.js)
// ─────────────────────────────────────────────────────────────────────────────

export class EventBus {
  constructor() {
    this.handlers = new Map(); // tipo → Set(fn)
  }

  /** Escuta um tipo de evento. Devolve a função que para de escutar. */
  on(type, fn) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(type, payload = {}) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(payload, type);
  }
}
