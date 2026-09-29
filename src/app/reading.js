// ─────────────────────────────────────────────────────────────────────────────
//  Ler a Cidade: E diante de um terminal abre a tela de leitura (ui/reader.js).
//
//  Ler ensina: as palavras do texto contam para o léxico global (lang/lexicon.js)
//  — só no modo Peregrinação. O registro lido vai para o diário do mundo
//  (evento player:read). Terminal sem energia: nada na tela (o leitor
//  portátil, que arranca um fragmento, é a próxima etapa).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ReaderPanel } from '../ui/reader.js';
import { conceptsIn } from '../lang/ancient.js';
import { t } from '../i18n/index.js';

export function createReading(ctx) {
  const { world, controls, camera, audio } = ctx;
  const panel = new ReaderPanel();
  const _g = new THREE.Vector3();
  const known = (w) => ctx.lexicon.known(w);
  const word = (w) => t(`word.${w}`);

  function nearTerminal() {
    return world.terminals.nearest(world.toGlobal(camera.position, _g), 2.4);
  }

  function open() {
    const it = nearTerminal();
    if (!it || !it.powered) return false;
    const lines = world.terminals.readable(it, ctx.time);
    const learned = ctx.lexicon.see(it.site.id, conceptsIn(lines));
    world.bus.emit('player:read', { id: it.site.id, site: it.site, learned });
    audio.deviceClick?.(true);
    document.exitPointerLock?.();
    panel.open(lines, known, word, learned, { note: ctx.rules.translation ? t('reader.hint') : t('reader.freeNote') });
    return true;
  }

  function close() {
    panel.close();
    controls.lock(); // a tecla que fechou conta como gesto: o mouse volta a travar
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
  };
}
