// ─────────────────────────────────────────────────────────────────────────────
//  Ler a Cidade: E diante de um terminal abre a tela de leitura (ui/reader.js).
//
//  Ler ensina: as palavras do texto contam para o léxico global (lang/lexicon.js)
//  — só no modo Peregrinação. O registro lido vai para o diário do mundo
//  (evento player:read).
//
//  Terminal sem energia: com o LEITOR PORTÁTIL (Peregrinação — ctx.player
//  .inventory), E alimenta o terminal por um instante com a sua célula e
//  arranca um FRAGMENTO: poucas linhas, mais apagadas. Cada uso tira um
//  fragmento diferente (e gasta energia) — migalhas, para quem não pode
//  religar o setor. A ROTA de um terminal (a pista — lang/leads.js) vem
//  aos pedaços: cada fragmento mostra uma ou duas partes do endereço.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ReaderPanel } from '../ui/reader.js';
import { conceptsIn } from '../lang/ancient.js';
import { t } from '../i18n/index.js';
import { hash4 } from '../gen/hash.js';
import { terminalRecords } from '../lang/records.js';
import { leadLine, startSite, PARTS } from '../lang/leads.js';

const FRAGMENT_COST = 0.08; // da célula (1 = cheia)

export function createReading(ctx) {
  const { world, controls, camera, audio } = ctx;
  const panel = new ReaderPanel();
  const _g = new THREE.Vector3();
  const known = (w) => ctx.lexicon.known(w);
  const word = (w) => t(`word.${w}`);

  function nearTerminal() {
    return world.terminals.nearest(world.toGlobal(camera.position, _g), 2.4);
  }

  /** Terminal morto + leitor portátil: um fragmento, pago com a célula. */
  function readFragment(it) {
    const p = ctx.player;
    if (!ctx.rules.resources || !p.inventory.includes('reader')) return false;
    if (p.energy.value < FRAGMENT_COST) {
      audio.deviceClick?.(false);
      return true; // sem carga: o aparelho só estala
    }
    p.energy.value -= FRAGMENT_COST;
    it.fragments = (it.fragments ?? 0) + 1;
    const text = world.terminals.readable(it, ctx.time);
    const route = text.find((line) => line.lead); // a pista, se este terminal cita alguém
    const all = text.filter((line) => line.length > 1 && !line.lead);
    // o cabeçalho e 2–3 linhas, escolhidas pelo número do fragmento
    const n = 2 + (hash4(1, it.fragments, it.site.x | 0, 0, 970) < 0.5 ? 1 : 0);
    const lines = [all[0]];
    for (let i = 0; i < n && all.length > 1; i++) {
      const k = 1 + Math.floor(hash4(it.fragments, i, it.site.z | 0, 0, 971) * (all.length - 1));
      if (!lines.includes(all[k])) lines.push(all[k]);
    }
    // a rota vem aos pedaços: uma ou duas das partes (setor, nível, distância), as outras apagadas.
    // No primeiro terminal do mundo, o primeiro fragmento sempre traz a rota (a primeira pista).
    let lead = null;
    const first = it.fragments === 1 && startSite(world.field)?.id === it.site.id;
    if (route && (first || hash4(2, it.fragments, it.site.x | 0, it.site.z | 0, 972) < 0.6)) {
      const keys = Object.keys(PARTS);
      const o = Math.floor(hash4(3, it.fragments, it.site.x | 0, it.site.z | 0, 973) * 3);
      const shown = keys.slice(0, 1 + (hash4(4, it.fragments, it.site.z | 0, 0, 974) < 0.45 ? 1 : 0)).map((_, i) => keys[(o + i) % 3]);
      const partial = leadLine(world.field, route.lead, shown);
      lines.splice(1, 0, partial);
      lead = { lead: route.lead, parts: shown };
    }
    const learned = ctx.lexicon.see(`frag:${it.site.id}:${it.fragments}`, conceptsIn(lines));
    world.bus.emit('player:read', { id: it.site.id, site: it.site, learned, fragment: true, lead });
    audio.deviceClick?.(true);
    document.exitPointerLock?.();
    panel.open(lines, known, word, learned, { dim: true, note: t('reader.fragment', { cost: Math.round(FRAGMENT_COST * 100) }) });
    return true;
  }

  function open() {
    const it = nearTerminal();
    if (!it) return false;
    if (!it.powered) return readFragment(it);
    const lines = world.terminals.readable(it, ctx.time);
    const learned = ctx.lexicon.see(it.site.id, conceptsIn(lines));
    const route = lines.find((line) => line.lead);
    world.bus.emit('player:read', { id: it.site.id, site: it.site, learned, lead: route ? { lead: route.lead, parts: route.parts } : null });
    audio.deviceClick?.(true);
    document.exitPointerLock?.();
    panel.open(lines, known, word, learned, { note: ctx.rules.translation ? t('reader.hint') : t('reader.freeNote') });
    return true;
  }

  let fromArchive = false;

  function close() {
    panel.close();
    if (!fromArchive) controls.lock(); // a tecla que fechou conta como gesto: o mouse volta a travar
    fromArchive = false;
  }

  /** Reabre um registro do arquivo (tela de entrada): o texto refeito do Field, com o léxico de agora. */
  function showArchived(id, rec) {
    const site = { id, ...rec };
    if (rec.kind.startsWith('unique')) {
      // refaz a estrutura pelo id (un:U<camada>,<i>,<k>)
      const [n, i, k] = id.slice(4).split(',').map(Number);
      site.kind = 'unique';
      site.unique = world.field.uniqueSite(n, i, k);
      if (!site.unique) return;
    }
    const lines = terminalRecords(world.field, site);
    fromArchive = true;
    panel.open(lines, known, word, [], { note: t('reader.archived') });
  }

  return {
    get isOpen() {
      return panel.isOpen;
    },
    /** E / Y: fecha a leitura, ou abre a do terminal em frente. true = usou a tecla. */
    tryUse() {
      if (panel.isOpen) {
        close();
        return true;
      }
      return open();
    },
    close,
    showArchived,
  };
}
