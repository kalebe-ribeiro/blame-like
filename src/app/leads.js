// ─────────────────────────────────────────────────────────────────────────────
//  As pistas de um mundo (modo Peregrinação — ctx.rules.leads; ver o cofre,
//  Pistas). Nenhuma missão: uma pista é um endereço que você leu.
//
//  • Ler uma ROTA (terminal com energia: inteira; leitor portátil: uma ou duas
//    partes) abre a pista do lugar citado — ou junta as partes novas a ela.
//  • Ler o terminal citado fecha a pista (chegou). Lá, muitas vezes, outra.
//  • Salvas no mundo (slot.leads), por id estável do lugar citado:
//      { x, y, z, kind, uniqueKind?, from: {id,x,y,z}, parts: [...], state: 'open'|'reached', at }
//    O texto da rota é refeito do Field (lang/leads.js → leadLine).
//
//  Eventos: lead:new, lead:narrow, lead:reached ({ id, lead }).
// ─────────────────────────────────────────────────────────────────────────────
import { leadArea } from '../lang/leads.js';

export function createLeads(ctx) {
  const { world } = ctx;
  const slot = ctx.slot;
  const on = () => ctx.rules.leads;
  const all = () => (slot.leads ??= {});

  world.bus.on('player:read', ({ id, lead }) => {
    if (!on()) return;
    const leads = all();
    // chegou: este é o lugar de uma pista aberta
    const here = leads[id];
    if (here && here.state === 'open') {
      here.state = 'reached';
      here.reachedAt = Date.now();
      world.bus.emit('lead:reached', { id, lead: here });
    }
    if (!lead) return;
    const L = lead.lead;
    let rec = leads[L.id];
    if (!rec) {
      rec = leads[L.id] = {
        x: L.x,
        y: L.y,
        z: L.z,
        kind: L.kind,
        ...(L.uniqueKind ? { uniqueKind: L.uniqueKind } : {}),
        from: L.from,
        parts: [],
        // já esteve lá (leu o terminal antes de saber dele): a pista nasce fechada
        state: slot.archive?.records?.[L.id] ? 'reached' : 'open',
        at: Date.now(),
      };
      rec.parts.push(...lead.parts);
      world.bus.emit('lead:new', { id: L.id, lead: rec });
      return;
    }
    const fresh = lead.parts.filter((p) => !rec.parts.includes(p));
    if (fresh.length) {
      rec.parts.push(...fresh);
      world.bus.emit('lead:narrow', { id: L.id, lead: rec });
    }
  });

  return {
    /** Todas as pistas deste mundo: [[id, rec]] (as abertas primeiro, as mais novas antes). */
    list() {
      return Object.entries(all()).sort((a, b) => (a[1].state === b[1].state ? b[1].at - a[1].at : a[1].state === 'open' ? -1 : 1));
    },
    get(id) {
      return all()[id] ?? null;
    },
    /** Pista aberta com este lugar como alvo? */
    isOpenTarget(id) {
      return on() && all()[id]?.state === 'open';
    },
    /** A área de incerteza de uma pista, com o léxico de agora. */
    area(rec) {
      return leadArea(rec, (w) => ctx.lexicon.known(w));
    },
  };
}
