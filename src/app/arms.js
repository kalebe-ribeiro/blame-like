// ─────────────────────────────────────────────────────────────────────────────
//  Recuperar o braço (o cofre, Ideias/Futuro/Recuperar-o-braco — R1–R7).
//
//  Além do limite o emissor desfaz o braço que atira (app/beam.js loseArm); na Peregrinação
//  ele não volta sozinho. Três caminhos, o mais completo custa mais:
//    câmara de reconstrução  a estrutura única 'chamber' (gen/field.js): deitar no berço (E),
//                            ~20 s com os braços mecânicos trabalhando → OS DOIS braços; 50% da célula
//    prótese                 um braço de metal: achada nos cemitérios de vítimas (1 em ~3 tem uma),
//                            ou comprada de um andarilho (40% — app/people.js); vai com as cargas
//                            (player.carried) e se instala pelo inventário, parado, ~5 s → UM braço
//                            (de metal — app/hands.js); instalar não pede mão (R6a)
//    moradores das vilas     a conversa (app/people.js): uma carga entregue ou 30% → UM braço
//  Avisos (R7, só na Peregrinação): perdido o primeiro, "um braço só"; carregando o emissor com
//  um braço só, no estágio 5 o aparelho pisca ÚLTIMO BRAÇO (app/beam.js); no inventário, a linha
//  do perdido diz que o outro é o último. Sem os dois (R6b): o mapa ganha, como pista, a câmara ou
//  a vila habitada mais perto.
//  O que já se pegou fica no mundo salvo (slot.loot).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { hash4 } from '../gen/hash.js';
import { uniqueTerminal } from '../gen/sites.js';
import { villageInhabited } from '../gen/villages.js';
import { bindings } from '../controls/bindings.js';

export const ARM_COST = { chamber: 0.5, wanderer: 0.4, villager: 0.3 };
export const CHAMBER_TIME = 20; // s no berço
export const INSTALL_TIME = 5; // s instalando a prótese
export const GRAVEYARD_PROSTHESIS = 1 / 3; // a chance de um cemitério ter uma prótese
const REACH = 1.8; // m até a prótese no chão
const BED_REACH = 2.4; // m até o berço
const SCAN_R = 700; // m: cemitérios considerados em volta

export function createArms(ctx) {
  const { world, controls, camera, audio } = ctx;
  const player = ctx.player;
  player.arms ??= { right: true, left: true };
  player.armKind = { right: 'flesh', left: 'flesh', ...(player.armKind ?? {}) };
  const slot = ctx.slot;
  const loot = () => (slot.loot ??= {});
  const free = () => !ctx.rules.resources;
  const bus = world.bus;
  const _g = new THREE.Vector3();
  const here = () => world.toGlobal(camera.position, _g);
  const tell = (msg, s = 5) => {
    if (ctx.rules.hud) ctx.hud?.push(msg);
    else ctx.carried?.say?.(msg, s);
  };
  const missing = () => ['right', 'left'].filter((w) => !player.arms[w]);
  const prosthesisItem = () => player.carried.find((c) => c.kind === 'prosthesis') ?? null;

  /** Devolve um braço (kind: 'flesh' — a câmara, os moradores — ou 'prosthesis'). */
  function restore(which, kind = 'flesh') {
    if (player.arms[which]) return false;
    player.arms[which] = true;
    player.armKind[which] = kind;
    bus.emit('player:armBack', { arm: which, kind });
    return true;
  }

  // ── R7 e R6: perdido um, avisa; perdidos os dois, o mapa mostra onde refazer ──
  bus.on('player:armLost', () => {
    if (free()) return; // (no Livre o braço volta sozinho — o aviso seria ruído)
    const n = missing().length;
    if (n === 1) {
      bus.emit('player:oneArm', {});
      setTimeout(() => tell(t('device.oneArmLeft'), 6), 5000); // depois do "BRAÇO PERDIDO"
    } else if (n === 2) {
      const r = revealRepair();
      bus.emit('player:noArms', { lead: r?.u.id ?? null, kind: r?.u.kind ?? null });
      setTimeout(() => tell(t(r ? 'device.noArmsLead' : 'device.noArms'), 7), 5000);
    }
  });

  /** A câmara ou a vila habitada (não hostil) mais perto, como pista inteira. → { u, d } ou null */
  function revealRepair() {
    const F = world.field;
    const g = here();
    let best = null;
    for (const R of [20000, 60000]) {
      for (const u of F.uniquesNear(g.x, g.y, g.z, R)) {
        const ok = u.kind === 'chamber' || (u.kind === 'village' && villageInhabited(F, u) && !slot.villages?.[u.id]?.hostile);
        if (!ok) continue;
        const d = Math.hypot(u.x - g.x, u.y - g.y, u.z - g.z);
        if (!best || d < best.d) best = { u, d };
      }
      if (best) break;
    }
    if (!best) return null;
    const s = uniqueTerminal(F, best.u);
    const lead = { id: s.id, x: s.x, y: s.y, z: s.z, kind: 'unique', uniqueKind: best.u.kind, from: { id: 'arms', x: g.x, y: g.y, z: g.z } };
    bus.emit('lead:reveal', { lead, parts: ['sector', 'level', 'dist'] });
    return best;
  }

  // ── a prótese nos cemitérios de vítimas ──
  /** Onde fica a prótese deste cemitério (GLOBAL), ou null (este não tem). */
  function prosthesisAt(u) {
    const F = world.field;
    if (u.kind !== 'graveyard' || hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1990) >= GRAVEYARD_PROSTHESIS) return null;
    const d = u.door;
    const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
    const cx = [-ax[1], ax[0]];
    const ha = d < 2 ? u.hx : u.hz;
    const hc = d < 2 ? u.hz : u.hx;
    // no meio do pátio, entre os corpos (longe da entrada)
    const a = (hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1991) - 0.5) * (ha - 10);
    const c = (hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1992) - 0.5) * (hc - 8);
    return { id: `pr:${u.id}`, x: u.x + ax[0] * a + cx[0] * c, y: u.y + 1.2, z: u.z + ax[1] * a + cx[1] * c, yaw: hash4(F.seed, u.n, 3, 7, 1993) * Math.PI * 2 };
  }

  /** O modelo: um antebraço de metal com a mão, deitado (sem colisão). */
  function buildProsthesis() {
    const m = world.materials.machine;
    const g = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 8), m);
    fore.rotation.z = Math.PI / 2;
    fore.position.set(0, 0.055, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.3, 8), m);
    upper.rotation.z = Math.PI / 2 - 0.5;
    upper.position.set(-0.32, 0.09, 0.05);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.09), m);
    hand.position.set(0.26, 0.03, 0);
    for (const k of [-1, 0, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.018), m);
      f.position.set(0.34, 0.025, k * 0.028);
      g.add(f);
    }
    g.add(fore, upper, hand);
    g.traverse((o) => (o.userData.noCollide = true));
    return g;
  }

  const items = new Map(); // id → { p, mesh }
  let scanT = 0;
  function scan() {
    const g = here();
    const want = new Set();
    for (const u of world.field.uniquesNear(g.x, g.y, g.z, SCAN_R)) {
      const p = prosthesisAt(u);
      if (!p || loot()[p.id] || Math.hypot(p.x - g.x, p.y - g.y, p.z - g.z) > SCAN_R) continue;
      want.add(p.id);
      if (!items.has(p.id)) {
        const mesh = buildProsthesis();
        mesh.rotation.y = p.yaw;
        ctx.scene.add(mesh);
        items.set(p.id, { p, mesh });
      }
    }
    for (const [id, it] of items) {
      if (want.has(id)) continue;
      ctx.scene.remove(it.mesh);
      items.delete(id);
    }
  }

  function nearItem() {
    const g = here();
    let best = null;
    for (const it of items.values()) {
      const d = Math.hypot(it.p.x - g.x, it.p.z - g.z);
      if (d < REACH && Math.abs(g.y - 1.7 - it.p.y) < 1.5 && (!best || d < best.d)) best = { it, d };
    }
    return best?.it ?? null;
  }

  function take(it) {
    loot()[it.p.id] = Date.now();
    ctx.scene.remove(it.mesh);
    items.delete(it.p.id);
    player.carried.push({ kind: 'prosthesis', from: it.p.id });
    audio.grab?.();
    controls.rumble?.(0.3, 0.2, 150);
    tell(t('device.prosthesisFound', { key: bindings.label('inventory') }), 5);
    bus.emit('player:prosthesis', { from: it.p.id });
  }

  // ── instalar a prótese (do inventário, parado) ──
  let install = null; // { t }
  function startInstall() {
    if (install || seq) return false;
    if (!prosthesisItem()) return false;
    if (!missing().length) {
      tell(t('device.armsWhole'), 3);
      return false;
    }
    install = { t: 0 };
    controls.forceInput = { f: 0, r: 0, run: false, jump: false }; // (parado: o corpo usa o que sobra — R6a)
    bus.emit('player:installStart', {});
    return true;
  }

  // ── a câmara: o berço ──
  let seq = null; // { t, bed, u, nextSpark, nextClang }
  function nearBed() {
    const g = here();
    for (const u of world.field.uniquesNear(g.x, g.y, g.z, 200)) {
      if (u.kind !== 'chamber') continue;
      const b = world.field.chamberBed(u);
      if (Math.hypot(b.x - g.x, b.z - g.z) < BED_REACH && Math.abs(g.y - 1.7 - b.y) < 1.6) return { u, b };
    }
    return null;
  }
  let bedNear = null;

  function startChamber(nb) {
    if (!missing().length) {
      tell(t('device.chamberNothing'), 3);
      return;
    }
    if (!free() && player.energy.value < ARM_COST.chamber) {
      audio.deviceClick?.(false);
      tell(t('device.chamberWeak', { n: Math.round(ARM_COST.chamber * 100) }), 3);
      return;
    }
    if (!free()) player.energy.value -= ARM_COST.chamber;
    ctx.beam?.cancel?.('camara');
    seq = { t: 0, bed: nb.b, u: nb.u, nextSpark: 1, nextClang: 0.5 };
    controls.forceInput = { f: 0, r: 0, run: false, jump: false };
    controls.setMode('walk');
    controls.placeFeet(new THREE.Vector3(nb.b.x, nb.b.y, nb.b.z).sub(world.origin));
    audio.powerUp?.(0, 4, 600);
    bus.emit('player:chamberStart', { id: nb.u.id });
  }

  function endSeq() {
    controls.forceInput = null;
    controls.pitch = 0;
    controls.walker.dip = 0;
  }

  return {
    get missing() {
      return missing();
    },
    restore,
    revealRepair,
    prosthesisAt,
    /** (testes) as próteses em cena */
    get items() {
      return items;
    },
    /** o aviso no aparelho (app/carried.js) */
    get hint() {
      if (seq || install) return null;
      if (nearItem()) return t('device.prosthesis', { key: bindings.label('use') });
      if (bedNear) return t('device.bed', { key: bindings.label('use') });
      return null;
    },
    /** a câmara trabalhando ou instalando (bloqueia o emissor e os painéis) */
    get busy() {
      return !!(seq || install);
    },
    installProsthesis: startInstall,
    /** E / Y: pegar a prótese do chão ou deitar no berço. true = usou a tecla. */
    tryUse() {
      if (seq || install) return true;
      const it = nearItem();
      if (it) {
        take(it);
        return true;
      }
      const nb = nearBed();
      if (nb) {
        startChamber(nb);
        return true;
      }
      return false;
    },
    update(dt) {
      if ((scanT -= dt) <= 0) {
        scanT = 1;
        scan();
        bedNear = controls.mode === 'walk' ? nearBed() : null;
      }
      for (const it of items.values()) it.mesh.position.set(it.p.x - world.origin.x, it.p.y - world.origin.y, it.p.z - world.origin.z);

      if (install) {
        install.t += dt;
        if (ctx.wake?.active) {
          install = null;
          controls.forceInput = null;
        } else {
          ctx.carried?.say?.(t('device.installing', { n: Math.min(100, Math.round((install.t / INSTALL_TIME) * 100)) }), 0.3);
          if (install.t >= INSTALL_TIME) {
            const it = prosthesisItem();
            if (it) player.carried.splice(player.carried.indexOf(it), 1);
            const w = missing()[0];
            if (w) restore(w, 'prosthesis');
            install = null;
            controls.forceInput = null;
            audio.grab?.();
            controls.rumble?.(0.5, 0.3, 200);
            tell(t('device.installed'), 4);
            bus.emit('player:installed', { arm: w });
          }
        }
      }

      if (seq) {
        seq.t += dt;
        if (ctx.wake?.active) {
          seq = null;
          endSeq();
          return;
        }
        // deitado no berço, olhando para o teto: os braços mecânicos trabalham (faíscas, baques)
        const w = controls.walker;
        w.dip = Math.max(w.dip, (w.eye - 0.45) * controls.scale);
        controls.yaw = seq.bed.yaw;
        controls.pitch = 1.3 + Math.sin(seq.t * 0.7) * 0.05;
        const b = seq.bed;
        if (seq.t >= seq.nextSpark) {
          seq.nextSpark = seq.t + 0.35 + Math.random() * 0.5;
          const g = new THREE.Vector3(b.x + (Math.random() - 0.5) * 1.2, b.y + 0.9 + Math.random() * 0.6, b.z + (Math.random() - 0.5) * 1.2);
          ctx.beam?.fx?.hitSparks?.(g, 10);
        }
        if (seq.t >= seq.nextClang) {
          seq.nextClang = seq.t + 0.8 + Math.random() * 1.2;
          audio.clangAt?.((Math.random() - 0.5) * 0.6, 2);
          controls.rumble?.(0.2, 0.15, 120);
        }
        ctx.carried?.say?.(t('device.chamberWork', { n: Math.min(100, Math.round((seq.t / CHAMBER_TIME) * 100)) }), 0.3);
        if (seq.t >= CHAMBER_TIME) {
          for (const side of missing()) restore(side, 'flesh');
          const id = seq.u.id;
          seq = null;
          endSeq();
          audio.powerDown?.(0, 3, 400);
          tell(t('device.chamberDone'), 5);
          bus.emit('player:rebuilt', { id });
        }
      }
    },
  };
}
