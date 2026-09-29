// ─────────────────────────────────────────────────────────────────────────────
//  Apagões de setor: de tempos em tempos uma região inteira perde energia.
//
//  Um apagão é uma esfera em torno de um ponto (coordenadas GLOBAIS):
//    1. a queda se espalha do centro para fora como uma frente (~45 m/s) —
//       as lâmpadas apagam em cascata, estalando na borda da frente;
//    2. o setor fica às escuras de 15 a 45 s;
//    3. a energia volta do centro para fora, mais devagar, e cada lâmpada
//       religa com um atraso próprio, gaguejando antes de firmar.
//
//  A mesma função de "energia" é avaliada em dois lugares:
//    • na CPU, para cada luz pontual (power(), usado pelo LightRig);
//    • no shader, para as janelas e linhas técnicas (uOutageA/B, ver
//      shaders/chunks.js → outagePower()).
//
//  Luzes que não são da rede (fogos-fátuos, brilho do abismo, os arcos de
//  solda dos Construtores) não apagam.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const MAX_OUTAGES = 4;
const SPREAD = 45; // m/s — a frente da queda
const RESTORE = 26; // m/s — a frente do religamento
const EDGE = 18; // largura da borda (m)

const hash = (x) => {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export class OutageSystem {
  constructor(shared) {
    this.shared = shared;
    this.events = []; // { id, c: Vector3 global, maxR, t0, dark, done }
    this.enabled = true;
    this.bus = null; // eventos outage:start / outage:restore (core/events.js)
    this._next = 50 + Math.random() * 40; // o primeiro não vem logo de cara
    this._id = 0;
  }

  /** Força um apagão agora, perto do observador (para testes: --outage). `at` fixa o centro. */
  trigger(g, forward, time, at = null) {
    this._spawn(g, forward, time, at);
  }

  _spawn(g, forward, time, at = null) {
    // à frente do observador, a uma distância em que a cascata é visível
    const dist = 90 + Math.random() * 260;
    const yaw = Math.atan2(forward.x, forward.z) + (Math.random() - 0.5) * 1.6;
    const c = at ? at.clone() : new THREE.Vector3(g.x + Math.sin(yaw) * dist, g.y + (Math.random() - 0.5) * 120, g.z + Math.cos(yaw) * dist);
    const ev = {
      id: ++this._id,
      c,
      maxR: 220 + Math.random() * 380,
      t0: time,
      dark: 15 + Math.random() * 30,
      restoring: false,
    };
    ev.tEnd = ev.t0 + ev.maxR / SPREAD + ev.dark + (ev.maxR + EDGE * 2) / RESTORE + 6;
    this.events.push(ev);
    this.bus?.emit('outage:start', ev);
  }

  /** Raios atuais da frente de queda e de religamento. */
  _fronts(ev, time) {
    const t = time - ev.t0;
    const out = Math.min(ev.maxR + EDGE, t * SPREAD);
    const tr = t - ev.maxR / SPREAD - ev.dark;
    const back = tr > 0 ? tr * RESTORE : -EDGE * 2;
    return [out, back];
  }

  update(time, dt, g, forward, origin) {
    if (this.enabled) {
      this._next -= dt;
      if (this._next <= 0 && this.events.length < MAX_OUTAGES) {
        this._next = 60 + Math.random() * 90;
        this._spawn(g, forward, time);
      }
    }
    for (const ev of this.events) {
      const [, back] = this._fronts(ev, time);
      if (!ev.restoring && back > 0) {
        ev.restoring = true;
        this.bus?.emit('outage:restore', ev);
      }
    }
    this.events = this.events.filter((ev) => time < ev.tEnd && ev.c.distanceTo(g) < 6000);

    // uniforms: centro em coordenadas de CENA
    const A = this.shared.uOutageA.value;
    const B = this.shared.uOutageB.value;
    for (let i = 0; i < MAX_OUTAGES; i++) {
      const ev = this.events[i];
      if (!ev) {
        A[i].set(0, 0, 0, -1);
        B[i].set(0, 0, 0, 0);
        continue;
      }
      const [out, back] = this._fronts(ev, time);
      A[i].set(ev.c.x - origin.x, ev.c.y - origin.y, ev.c.z - origin.z, out);
      B[i].set(back, ev.maxR, 0, 0);
    }
  }

  /**
   * Energia (0..1) de uma luz pontual em (x,y,z) GLOBAL. `seed` individualiza
   * o atraso e a gagueira de cada lâmpada.
   */
  power(x, y, z, seed, time) {
    let p = 1;
    for (const ev of this.events) {
      const d = Math.hypot(x - ev.c.x, y - ev.c.y, z - ev.c.z);
      if (d > ev.maxR) continue;
      const [out, back] = this._fronts(ev, time);
      const jitter = hash(seed) * EDGE; // cada lâmpada cai/volta num instante próprio
      if (d > out - jitter) {
        // a frente ainda não chegou — mas logo antes dela a lâmpada estala
        if (d < out + 8 && hash(seed + Math.floor(time * 17)) > 0.55) p *= 0.25;
        continue;
      }
      const dr = d + jitter * 1.6; // religamento: atraso maior e desigual
      if (dr > back) {
        p *= 0; // no escuro
        continue;
      }
      // voltou há pouco: gagueja antes de firmar
      const since = (back - dr) / RESTORE;
      if (since < 2.2) {
        const stutter = hash(seed * 1.7 + Math.floor(time * 9));
        p *= stutter > 0.5 + since * 0.2 ? 0.05 : 0.4 + since * 0.27;
      }
    }
    return p;
  }
}
