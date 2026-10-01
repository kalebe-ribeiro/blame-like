// ─────────────────────────────────────────────────────────────────────────────
//  Religar um setor (fase 4 — ver o cofre, Religar-setores): E (Y no controle)
//  diante do armário de uma subestação (world/substations.js) empurra a
//  alavanca. A subestação está morta há ciclos: precisa de um tranco da sua
//  célula para pegar (Peregrinação: COST da carga; no Livre, de graça). A luz
//  volta em cascata a partir dali, e o setor fica religado no mundo salvo.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';

const COST = 0.2 / 3; // da célula (1 = cheia) — a célula rende o triplo (2026-10-01)

export function createPower(ctx) {
  const { world, camera, audio } = ctx;
  const _g = new THREE.Vector3();

  function near() {
    return world.substations.nearest(world.toGlobal(camera.position, _g));
  }

  return {
    COST,
    /** A subestação ao alcance (para o aparelho mostrar o aviso), ou null. */
    near,
    /** E / Y: religar o setor da subestação em frente. true = usou a tecla. */
    tryUse() {
      const it = near();
      if (!it) return false;
      const site = it.site;
      if (world.substations.isLive(site)) {
        ctx.carried.say(t('device.substationLive'), 2.5);
        return true;
      }
      const p = ctx.player;
      if (ctx.rules.resources) {
        if (p.energy.value < COST) {
          audio.deviceClick?.(false);
          ctx.carried.say(t('device.substationWeak', { n: Math.round(COST * 100) }), 3);
          return true;
        }
        p.energy.value -= COST;
      }
      world.substations.restore(site, ctx.time, ctx.worldState);
      const d = world.toGlobal(camera.position, _g).distanceTo(new THREE.Vector3(site.x, site.y, site.z));
      audio.clangAt?.(0, Math.max(1, d));
      setTimeout(() => audio.powerUp?.(0, 20, 900), 600);
      ctx.carried.say(t('device.substationOn'), 4);
      ctx.hud?.push(t('hud.sectorRestored'));
      return true;
    },
  };
}
