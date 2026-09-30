// ─────────────────────────────────────────────────────────────────────────────
//  Os seres na travessia (fase 5): liga a camada de entidades (world/entities.js)
//  ao mundo salvo. Hoje nenhum ser existe de fato — só o corpo de teste das
//  sessões de desenvolvimento (--body) e do teste `npm run check:beings`.
//
//  O estado dos corpos persistentes vai para slot.entities (travel.save); um
//  mundo novo (world.build) começa sem ninguém e recarrega o que estava salvo.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { standPoint } from '../gen/nav.js';

export function createBeings(ctx) {
  const { world, slot } = ctx;
  world.entities.load(slot.entities);

  return {
    serialize: () => world.entities?.serialize() ?? [],
    /**
     * Um corpo de teste (sem rosto, sem papel) na plataforma ou passarela mais perto
     * do ponto GLOBAL g, andando até um lugar alcançável a ~dist m. Não é salvo.
     */
    spawnTest(g, dist = 200, seed = 1) {
      const nav = world.entities.nav;
      const F = world.field;
      let v = nav.vertexAt(g.x, g.y, g.z);
      if (!v) {
        const n = F.nearestNode(g.x, g.y, g.z, { below: 3, above: 2, reach: 3 });
        if (n) v = nav.nodeVertex(n);
      }
      if (!v) return null;
      let s = seed >>> 0 || 1;
      const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      // a rede pode ser rala aqui: dobra o alcance até achar um destino
      let goal = null;
      for (let d = dist; !goal && d <= dist * 8; d *= 2) goal = nav.wander(v, d, rng);
      if (!goal) return null;
      const at = v.kind === 'node' ? standPoint(v.n) : v;
      const e = world.entities.spawn({ id: `test${seed}`, kind: 'test', feet: new THREE.Vector3(at.x, at.y, at.z), persist: false });
      world.entities.goTo(e, goal);
      return e;
    },
  };
}
