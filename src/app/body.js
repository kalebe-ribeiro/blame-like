// ─────────────────────────────────────────────────────────────────────────────
//  O corpo: o que se sente ao se mover pela Cidade.
//
//    passos       o som depende do chão (concreto, chapa, grade, água)
//    água         nos setores inundados, passo mais lento e som de água
//    queda        vento, campo de visão abrindo, tremor, poeira em riscos;
//                 no pouso, impacto proporcional (e registro no diário/mapa)
//    vagão        a bordo: ronco e as juntas do trilho a cada 12 m
//    vagões fora  o mais próximo ronca; os que passam rente dão uma lufada
//    controle     vibração nos momentos físicos
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t, fmtNum } from '../i18n/index.js';
import { fallDamage } from './health.js';

/** Velocidade de impacto (m/s) que seria fatal: acima disso, desmaio (Peregrinação). */
const LETHAL_IMPACT = 38;

// o som do passo depende do que está sob os pés (material da malha de colisão)
const STEP_SURFACE = {
  grate: 'grate', rungs: 'grate',
  rib: 'metal', duct: 'metal', machine: 'metal', frame: 'metal', conduit: 'metal', tube: 'metal', bridge: 'metal', door: 'metal',
  water: 'water',
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createBody(ctx) {
  const { controls, audio, hud, world, camera, dust } = ctx;
  const w = controls.walker;
  let wading = false;
  let fovKick = 0;
  let railAcc = 0;
  let lastCar = null;
  let lastPowered;

  w.onStep = (k) => audio.footstep(k, wading ? 'water' : STEP_SURFACE[w.groundObj?.userData.mat] ?? 'concrete');
  w.onClimbStep = () => audio.rung();
  // quinas: as mãos batem na borda; subindo, o corpo raspa por cima dela
  w.onGrab = () => {
    audio.grab();
    ctx.controls.rumble?.(0.25, 0.15, 120);
    world.bus.emit('player:grab', {});
  };
  w.onMantle = (h) => audio.mantle(h);
  w.onLand = (impact, height) => {
    audio.land(Math.min(1, impact / 30));
    audio.impact(impact);
    controls.rumble(Math.min(1, Math.max(0, impact - 6) / 40), Math.min(1, impact / 30), 120 + Math.min(500, impact * 10));
    world.bus.emit('player:fall', { height });
    // com a vida (app/health.js): o dano pela altura — de 10 m; zera (o desmaio) em 38 m/s.
    // (o impacto, não a altura: a altura é zerada por escadas e quinas e não vê o empurrão do emissor)
    if (ctx.health?.enabled) ctx.health.damage('fall', fallDamage(impact));
    // sem a vida, a Peregrinação de antes: um impacto que seria fatal vira desmaio (app/wake.js)
    else if (ctx.rules.deathWake && impact > LETHAL_IMPACT) ctx.wake.start('impact');
    if (height > 80) hud.push(t('hud.fall', { m: fmtNum(Math.round(height)) }));
  };
  controls.onModeChange = (mode) => {
    hud.push(t(mode === 'walk' ? 'hud.walk' : 'hud.fly'));
  };

  /** Dentro d'água (setores inundados)? */
  function checkWading() {
    if (controls.mode !== 'walk' || !w.grounded) {
      wading = false;
    } else {
      const g = world.toGlobal(camera.position);
      const feetY = g.y - w.eye;
      const lvl = world.field.floodLevelAt(g.x, feetY, g.z);
      wading = lvl !== null && feetY < lvl;
    }
    w.speedScale = wading ? 0.62 : 1;
  }

  /** Vento, campo de visão abrindo, tremor e poeira em riscos. */
  function feelMotion(dt) {
    const walking = controls.mode === 'walk';
    const vel = walking ? w.vel : controls.velocity;
    const fallV = walking && !w.grounded && !w.climbing ? Math.max(0, -w.vel.y) / controls.scale : 0;
    audio.setWind(Math.max(fallV, walking ? 0 : controls.speed * 0.6));
    // o campo de visão abre durante a queda (desligável: conforto)
    const fx = ctx.settings.motionFx ? 1 : 0;
    fovKick += (11 * smooth(14, 55, fallV) * fx - fovKick) * Math.min(1, dt * 3);
    const fov = ctx.settings.fov + fovKick;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // tremor (o quaternion é refeito pelos controles a cada frame: não acumula)
    const sh = smooth(22, 60, fallV) * 0.004 * fx;
    if (sh > 0) {
      const t = ctx.time;
      camera.rotateX((Math.sin(t * 37.1) + Math.sin(t * 23.7 + 1.3)) * sh);
      camera.rotateY((Math.sin(t * 31.3 + 2.1) + Math.sin(t * 19.9)) * sh * 0.7);
    }
    const du = dust.material.uniforms;
    du.uVel.value.copy(vel);
    du.uStreak.value = 0.05 * smooth(8, 40, vel.length() / controls.scale);
  }

  /** A bordo de um vagão: ronco e as juntas do trilho a cada 12 m. */
  function feelRide(dt) {
    const car = controls.mode === 'walk' && w.grounded ? world.transit.carOf(w.groundObj) : null;
    world.transit.riding = car;
    if (car && !lastCar) world.bus.emit('player:board', { car });
    if (car && car === lastCar && car.powered !== lastPowered) {
      hud.push(t(car.powered ? 'hud.transit.power' : world.transit.stoppedForGood(car.line) ? 'hud.transit.damaged' : 'hud.transit.nopower'));
    }
    lastCar = car;
    lastPowered = car?.powered;
    const v = car?.speed ?? 0;
    audio.setRide(v);
    railAcc += v * dt;
    if (!car) railAcc = 0;
    else if (railAcc > 12) {
      railAcc -= 12;
      audio.railJoint(Math.min(1, v / 20));
      controls.rumble(0.05 + 0.1 * Math.min(1, v / 30), 0.12, 60);
    }
  }

  const _p = new THREE.Vector3();
  /** Vagões vistos de fora: o mais próximo ronca; os que passam rente dão uma lufada. */
  function hearCars() {
    let best = Infinity;
    let bestCar = null;
    for (const car of world.transit.cars.values()) {
      if (car === world.transit.riding || car.t === null) continue;
      const d = car.group.position.distanceTo(camera.position);
      if (d < best) {
        best = d;
        bestCar = car;
      }
      // lufada quando passa rente e rápido (uma vez por passagem)
      if (d < 16 && (car.speed ?? 0) > 10 && !car.passed) {
        car.passed = true;
        _p.copy(car.group.position).add(world.origin);
        audio.carPass(ctx.placeOf(_p.x, _p.y, _p.z)[0], car.speed);
        controls.rumble(0.35 * Math.min(1, car.speed / 30), 0.5, 600);
      } else if (d > 40) car.passed = false;
    }
    if (bestCar) {
      _p.copy(bestCar.group.position).add(world.origin);
      audio.setCarNear(ctx.placeOf(_p.x, _p.y, _p.z)[0], best, bestCar.speed ?? 0);
    } else audio.setCarNear(0, Infinity, 0);
  }

  return {
    update(dt) {
      feelMotion(dt);
      checkWading();
      feelRide(dt);
      hearCars();
    },
  };
}
