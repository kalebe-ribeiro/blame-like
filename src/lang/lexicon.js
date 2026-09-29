// ─────────────────────────────────────────────────────────────────────────────
//  O léxico: as palavras da língua antiga que você já entende.
//
//  Vive no PERFIL (global — vale em todos os mundos; app/saves.js). Uma
//  palavra é entendida depois de vista em fontes diferentes o bastante:
//  comuns 2 vezes, incomuns 4, raras 7 (NEED em lang/ancient.js). Cada fonte
//  (um registro de terminal, uma inscrição) conta uma vez só; uma inscrição
//  no lugar que ela nomeia conta dobrado (referência cruzada).
//
//  Só aprende no modo Peregrinação (ctx.rules.translation) — no Livre o
//  léxico aparece como está, mas não cresce.
// ─────────────────────────────────────────────────────────────────────────────
import { CONCEPTS, NEED } from './ancient.js';

const MAX_SOURCES = 6000; // fontes lembradas (as mais antigas saem)

export class Lexicon {
  /**
   * @param {object} profile  o perfil global (ganha .lexicon e .lexSources)
   * @param {() => boolean} canLearn  o modo atual deixa aprender?
   * @param {() => void} onChange  o léxico mudou (salvar o perfil, avisar)
   */
  constructor(profile, canLearn, onChange) {
    this.profile = profile;
    profile.lexicon ??= {};
    profile.lexSources ??= [];
    this.counts = profile.lexicon;
    this.sources = new Set(profile.lexSources);
    this.canLearn = canLearn;
    this.onChange = onChange;
  }

  known(concept) {
    const cls = CONCEPTS[concept];
    return !!cls && (this.counts[concept] ?? 0) >= NEED[cls];
  }

  /**
   * Viu estas palavras numa fonte. Devolve as que passaram a ser entendidas agora.
   * @param {string} sourceId  id estável da fonte (conta uma vez só)
   * @param {string[]} concepts
   * @param {number} weight  2 = referência cruzada (a placa no lugar que nomeia)
   */
  see(sourceId, concepts, weight = 1) {
    if (!this.canLearn() || this.sources.has(sourceId)) return [];
    this.sources.add(sourceId);
    this.profile.lexSources.push(sourceId);
    if (this.profile.lexSources.length > MAX_SOURCES) this.sources.delete(this.profile.lexSources.shift());
    const learned = [];
    for (const c of concepts) {
      if (!CONCEPTS[c]) continue;
      const was = this.known(c);
      this.counts[c] = (this.counts[c] ?? 0) + weight;
      if (!was && this.known(c)) learned.push(c);
    }
    this.onChange?.(learned);
    return learned;
  }

  /** { known, total } — quantas palavras já são entendidas. */
  progress() {
    const all = Object.keys(CONCEPTS);
    return { known: all.filter((c) => this.known(c)).length, total: all.length };
  }
}
