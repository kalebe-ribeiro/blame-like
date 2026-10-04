// ─────────────────────────────────────────────────────────────────────────────
//  Vagões dos transportadores (a geometria fixa está em gen/transit.js).
//
//  Horário determinístico, igual para todas as linhas:
//    em cada ciclo de P segundos, um vagão parado em CADA estação espera
//    DWELL s com o lado aberto para a plataforma, parte, acelera, freia e
//    chega à estação seguinte (no sentido da linha) exatamente no fim do ciclo
//    — onde começa a espera do ciclo seguinte. O vagão "k" da linha é o que
//    estava na estação k no ciclo 0; no ciclo n ele está saindo da estação
//    k + dir·n. Assim cada vagão é contínuo no tempo (quem está dentro não é
//    teleportado) e basta criar os vagões perto do observador.
//
//  Como os elevadores, cada peça do vagão diz ao Walker quanto se moveu
//  neste quadro (userData.dx/dy/dz) — quem está em cima vai junto.
//
//  Apagões: cada linha tem um RELÓGIO próprio. Se um vagão dela fica sem
//  energia, o relógio da linha inteira desacelera até parar (~6 s de
//  frenagem; ~12 s para retomar) e só volta a andar quando a energia volta — todos os vagões da
//  linha param juntos, então o horário continua contínuo e ninguém bate.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { movingMaterial } from '../shaders/materials.js';
import { TRANSIT } from '../gen/field.js';
import { stationT } from '../gen/transit.js';
import { mergeAll, place } from './geometry.js';

const S = TRANSIT.station;
const ACC = 0.9; // m/s² — pico de ~36 m/s (130 km/h) no meio do trecho
const T_MOVE = 2 * Math.sqrt(S / ACC); // s em movimento entre duas estações
const DWELL = 14; // s parado na estação
const PERIOD = T_MOVE + DWELL;
export const RIDE_TIME = PERIOD; // s de uma estação à seguinte (com a espera)
const NEAR_STATIONS = 2; // vagões a até ±2 estações do observador

/** Distância percorrida desde a partida, após `t` segundos em movimento. */
function travel(t) {
  if (t <= 0) return 0;
  if (t >= T_MOVE) return S;
  const h = T_MOVE / 2;
  return t < h ? 0.5 * ACC * t * t : S - 0.5 * ACC * (T_MOVE - t) * (T_MOVE - t);
}

export class TransitCars {
  constructor(parent, materials) {
    /** @type {any} o vagão em que o jogador está (não some de perto enquanto ele estiver dentro) */
    this.riding = null;
    this.group = new THREE.Group();
    this.group.name = 'transportadores';
    parent.add(this.group);
    this.materials = materials;
    this.field = null;
    this.cars = new Map(); // id → { group, line, k, t }
    this.lines = [];
    this.lights = [];
    this.meshes = []; // para a colisão
    this._scan = 0;
    this._geo = null;
    this.outages = null; // OutageSystem
    this.clocks = new Map(); // id da linha → { c: relógio, rate: 0..1, seen }
  }

  /** Relógio da linha (criado na hora certa: começa igual ao tempo global). */
  _clock(line, time) {
    let k = this.clocks.get(line.id);
    if (!k) {
      k = { c: time, rate: 1, seen: time };
      this.clocks.set(line.id, k);
    }
    return k;
  }

  _parts() {
    if (this._geo) return this._geo;
    const { carLen: L, carW: W, carH: H } = TRANSIT;
    // coordenadas locais: z ao longo da linha, x para o lado ABERTO = −x
    // (o lado aberto é virado para a plataforma na hora de posicionar)
    const body = [];
    body.push(place(new THREE.BoxGeometry(W + 0.2, 0.4, L + 0.4), { y: H - 0.2 })); // teto
    body.push(place(new THREE.BoxGeometry(0.3, H - 0.4, L), { x: W / 2 - 0.15, y: (H - 0.4) / 2 })); // parede cega
    for (const s of [-1, 1]) body.push(place(new THREE.BoxGeometry(W, H - 0.4, 0.3), { y: (H - 0.4) / 2, z: s * (L / 2 - 0.15) })); // cabeceiras
    for (const z of [-L / 2 + 0.3, -L / 4, L / 4, L / 2 - 0.3]) body.push(place(new THREE.BoxGeometry(0.3, H - 0.4, 0.3), { x: -W / 2 + 0.15, y: (H - 0.4) / 2, z }));
    // guarda-corpo baixo no lado aberto, com a porta no meio
    for (const s of [-1, 1]) body.push(place(new THREE.BoxGeometry(0.12, 0.12, L / 2 - 3.8), { x: -W / 2 + 0.15, y: 1.0, z: s * (L / 4 + 1.9) }));
    // truques sobre o trilho
    for (const s of [-1, 1]) body.push(place(new THREE.BoxGeometry(2.8, 0.6, 4), { y: -0.7, z: s * 7 }));
    const floor = place(new THREE.BoxGeometry(W, 0.4, L), { y: -0.2 });
    this._geo = { body: mergeAll(body), floor };
    return this._geo;
  }

  _create(line, k) {
    const { body, floor } = this._parts();
    const g = new THREE.Group();
    // (o vagão anda: o desenho preso a ele)
    const mb = new THREE.Mesh(body, movingMaterial(this.materials.machine));
    const mf = new THREE.Mesh(floor, movingMaterial(this.materials.bridge));
    for (const m of [mb, mf]) {
      m.userData.transit = true;
      m.userData.mat = m === mf ? 'bridge' : 'machine';
      m.userData.dx = m.userData.dy = m.userData.dz = 0;
      m.matrixAutoUpdate = false;
      g.add(m);
    }
    // orientação: z local ao longo da linha; −x local (lado aberto) para a passarela
    const toWalk = -line.track.side;
    if (line.axis === 'z') g.rotation.y = toWalk < 0 ? 0 : Math.PI;
    else g.rotation.y = toWalk < 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(g);
    return { group: g, line, k, t: null, light: { x: 0, y: 0, z: 0, color: [0.66, 0.78, 0.7], intensity: 28, mode: 'steady', phase: k * 1.7 } };
  }

  /** O horário da estação s (terminais), em tokens da língua antiga (lang/ancient.js). */
  stationStatus(line, s, time) {
    const k = this.clocks.get(line.id);
    const c = k ? k.c : time;
    if (k && k.rate < 0.05) return [{ w: 'CAR' }, { w: 'SUSPENDED' }, { p: '·' }, { w: 'POWER' }, { p: ':' }, { w: 'NONE' }];
    const tau = ((c % PERIOD) + PERIOD) % PERIOD;
    const dir = [{ w: 'DIRECTION' }, { n: `${line.track.dir > 0 ? '+' : '−'}${line.axis.toUpperCase()}` }];
    if (tau < DWELL) return [{ w: 'BOARDING' }, { p: '·' }, { w: 'DEPARTURE' }, { n: `${Math.ceil(DWELL - tau)} S` }, { p: '·' }, ...dir];
    const eta = Math.ceil(PERIOD - tau);
    const late = k && k.rate < 0.95 ? [{ w: 'DELAYED' }] : [];
    return [{ w: 'NEXT' }, { w: 'CAR' }, { n: `${eta} S` }, ...late, { p: '·' }, ...dir];
  }

  /** Posição ao longo da linha do vagão k no tempo `time`. */
  _posT(line, k, time) {
    const n = Math.floor(time / PERIOD);
    const tau = time - n * PERIOD;
    const s = k + line.track.dir * n;
    return stationT(s) + line.track.dir * travel(tau - DWELL);
  }

  update(time, dt, g, origin) {
    if (!this.field) return;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 0.5;
      this.lines = this.field.transitLinesNear(g.x, g.y, g.z, 700);
    }
    const want = new Set();
    for (const line of this.lines) {
      const clock = this._clock(line, time);
      clock.seen = time;
      const n = Math.floor(clock.c / PERIOD);
      const tp = line.axis === 'z' ? g.z : g.x;
      const sp = Math.round((tp - S / 2) / S);
      for (let s = sp - NEAR_STATIONS; s <= sp + NEAR_STATIONS; s++) {
        const k = s - line.track.dir * n; // o vagão que sai da estação s neste ciclo
        const id = `${line.id}:${k}`;
        want.add(id);
        if (!this.cars.has(id)) this.cars.set(id, this._create(line, k));
      }
    }
    for (const [id, car] of this.cars) {
      // quem está dentro de um vagão que saiu do alcance continua com ele
      if (!want.has(id) && !this._rider(car)) {
        car.group.removeFromParent();
        this.cars.delete(id);
      }
    }

    // relógios: a linha anda enquanto todos os seus vagões (perto) têm energia
    const dark = new Set();
    if (this.outages) {
      for (const car of this.cars.values()) {
        if (car.t === null) continue;
        const L = car.line;
        const lat = L.u + L.track.off;
        const x = L.axis === 'z' ? lat : car.t;
        const z = L.axis === 'z' ? car.t : lat;
        if (this.outages.power(x, L.y + 3, z, 7.7, time) < 0.5) dark.add(L.id);
      }
    }
    // um trilho cortado pelo emissor: a linha para (os vagões não entram num trecho cortado)
    const F = this.field;
    if (F.cuts?.length) {
      for (const L of this.lines) {
        if (L.cutVer === F.cutVer) {
          if (L.cut) dark.add(L.id);
          continue;
        }
        L.cutVer = F.cutVer;
        const lat = L.u + L.track.off;
        // o trilho é uma reta ao longo do eixo da linha, em (lat, y − 1,5)
        L.cut = F.cuts.some((c) => {
          for (let s = 0; s <= 20; s++) {
            const u = s / 20;
            const x = c.a[0] + (c.b[0] - c.a[0]) * u;
            const y = c.a[1] + (c.b[1] - c.a[1]) * u;
            const z = c.a[2] + (c.b[2] - c.a[2]) * u;
            const off = L.axis === 'z' ? x - lat : z - lat;
            if (Math.hypot(off, y - (L.y - 1.5)) < c.r + 1.2) return true;
          }
          return false;
        });
        if (L.cut) dark.add(L.id);
      }
    }
    for (const [id, k] of this.clocks) {
      // freia em ~6 s; na volta da energia, retoma devagar (~12 s)
      k.rate = dark.has(id) ? Math.max(0, k.rate - dt / 6) : Math.min(1, k.rate + dt / 12);
      k.c += k.rate * dt;
      if (time - k.seen > 120) this.clocks.delete(id); // linha esquecida (longe há tempo)
    }

    this.lights.length = 0;
    this.meshes.length = 0;
    for (const car of this.cars.values()) {
      const L = car.line;
      const clock = this._clock(L, time);
      car.powered = clock.rate > 0.5;
      const t = this._posT(L, car.k, clock.c);
      const lat = L.u + L.track.off;
      const x = L.axis === 'z' ? lat : t;
      const z = L.axis === 'z' ? t : lat;
      const sx = x - origin.x;
      const sy = L.y - origin.y;
      const sz = z - origin.z;
      const moved = car.t !== null;
      const dxs = moved ? sx - car.group.position.x : 0;
      const dys = moved ? sy - car.group.position.y : 0;
      const dzs = moved ? sz - car.group.position.z : 0;
      car.group.position.set(sx, sy, sz);
      car.group.updateMatrixWorld(true);
      car.speed = moved && dt > 0 ? Math.abs(t - car.t) / dt : 0;
      car.t = t;
      for (const m of car.group.children) {
        m.userData.dx = dxs;
        m.userData.dy = dys;
        m.userData.dz = dzs;
        this.meshes.push(m);
      }
      car.light.x = x;
      car.light.y = L.y + 3.9;
      car.light.z = z;
      this.lights.push(car.light);
    }
  }

  /** A origem flutuante andou `delta`: desloca junto (não conta como movimento). */
  rebase(delta) {
    for (const car of this.cars.values()) car.group.position.sub(delta);
  }

  /**
   * O vagão parado na estação ts da linha (id 't' + chave da passarela), com pelo menos
   * `minLeft` s de espera pela frente — ou null. (Os seres embarcam por aqui: world/entities.js.)
   */
  dockedAt(lineId, ts, minLeft = 0) {
    for (const car of this.cars.values()) {
      if (car.line.id !== lineId || car.t === null || Math.abs(car.t - ts) > 0.5) continue;
      const k = this.clocks.get(lineId);
      if (!k || k.rate < 0.5) return null;
      const tau = ((k.c % PERIOD) + PERIOD) % PERIOD;
      return tau < DWELL - minLeft ? car : null;
    }
    return null;
  }

  _rider(car) {
    return this.riding === car;
  }

  /** O vagão (se algum) sob este objeto de chão. */
  carOf(obj) {
    for (const car of this.cars.values()) if (obj && obj.parent === car.group) return car;
    return null;
  }

  dispose() {
    this._geo?.body.dispose();
    this._geo?.floor.dispose();
    this.group.removeFromParent();
    this.cars.clear();
  }
}
