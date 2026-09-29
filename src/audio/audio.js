// ─────────────────────────────────────────────────────────────────────────────
//  Áudio 100% procedural (Web Audio API) — nenhum arquivo de som.
//
//  Camadas contínuas:
//    drone     osciladores graves desafinados (ré, quinta, trítono) → lowpass
//              com LFO lento → "respiração" de amplitude
//    ducto     ruído marrom num bandpass que varre devagar (vento em tubulação)
//
//  Eventos aleatórios:
//    ambiente  gotas com eco, estalos térmicos do metal, rajadas de vento,
//              roncos graves distantes
//    gemido    a estrutura "geme": serra grave distorcida com glissando
//    obra      construção distante: marteladas metálicas, rangidos, rebites —
//              a Cidade continua sendo construída por algo que ninguém vê
//    transfer  whoosh reverso + queda sub-grave (transporte, realocação)
//
// ─────────────────────────────────────────────────────────────────────────────

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this._timers = [];
    this.droneOscs = [];
    this.pitch = 1;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(0.85, ctx.currentTime, 2.5); // entrada lenta

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    // "abafador": depois de um impacto violento o mundo soa como debaixo d'água
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);

    // reverb gerado: ruído com decaimento exponencial (≈ 7 s de cauda)
    // reverberação que responde ao espaço: sala (0,9 s), salão (3 s), abismo (8 s)
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.rooms = [
      [0.9, 3.5],
      [3.2, 2.6],
      [8.5, 2.2],
    ].map(([secs, decay]) => {
      const conv = ctx.createConvolver();
      conv.buffer = this._impulse(secs, decay);
      const g = ctx.createGain();
      g.gain.value = 0;
      this.reverbSend.connect(conv).connect(g).connect(this.master);
      return g;
    });
    this.setSpace(400);

    this._buildDrone();
    this._buildDuct();
    this._buildWind();
    this._loop(() => this._randomAmbient(), () => rand(1.5, 7));
    this._loop(() => this._groan(), () => rand(22, 50), rand(8, 15));
    this._loop(() => this._construction(), () => rand(6, 20), rand(3, 6));
  }

  // ── infraestrutura ────────────────────────────────────────────────────────

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Conecta um nó à saída seca + envio de reverb. */
  _out(node, dry = 1, wet = 0.5) {
    const d = this.ctx.createGain();
    d.gain.value = dry;
    node.connect(d).connect(this.master);
    const w = this.ctx.createGain();
    w.gain.value = wet;
    node.connect(w).connect(this.reverbSend);
  }

  /** Agenda fn repetidamente com intervalos (em segundos) dados por nextDelay(). */
  _loop(fn, nextDelay, firstDelay) {
    const tick = () => {
      if (this.ctx.state === 'running') fn();
      this._timers.push(setTimeout(tick, nextDelay() * 1000));
    };
    this._timers.push(setTimeout(tick, (firstDelay ?? nextDelay()) * 1000));
  }

  _noiseBuffer(seconds, type = 'white') {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  _panner(value = rand(-1, 1)) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = value;
    return p;
  }

  // ── camadas contínuas ─────────────────────────────────────────────────────

  _buildDrone() {
    const ctx = this.ctx;
    const base = 36.71; // ré 1 — grave o bastante para ser sentido, não ouvido

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    filter.Q.value = 5;
    this.droneFilter = filter;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.031;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 120;
    lfo.connect(lfoAmt).connect(filter.frequency);
    lfo.start();

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.2;
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.07;
    const breathAmt = ctx.createGain();
    breathAmt.gain.value = 0.07;
    breath.connect(breathAmt).connect(droneGain.gain);
    breath.start();

    // [razão, forma de onda, ganho] — fundamental, sub, quinta, oitava, trítono
    const partials = [
      [1, 'sawtooth', 0.45],
      [0.5, 'sine', 0.7],
      [1.5, 'sine', 0.3],
      [2.013, 'sawtooth', 0.18],
      [2 * Math.SQRT2, 'triangle', 0.1],
      [3.007, 'sine', 0.06],
    ];
    for (const [ratio, type, gain] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = base * ratio;
      o.detune.value = rand(-9, 9);
      // cada parcial deriva sozinho → batimentos lentos
      const dl = ctx.createOscillator();
      dl.frequency.value = rand(0.01, 0.05);
      const dla = ctx.createGain();
      dla.gain.value = rand(5, 16);
      dl.connect(dla).connect(o.detune);
      dl.start();
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(filter);
      o.start();
      this.droneOscs.push({ osc: o, ratio });
    }
    this.droneBase = base;
    filter.connect(droneGain);
    this._out(droneGain, 1, 0.6);
  }

  /** Vento de queda/velocidade: um rugido grave + um chiado que só entra rápido. */
  _buildWind() {
    const ctx = this.ctx;
    const mk = (buf, type, f, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(flt).connect(g);
      this._out(g, 1, 0.15);
      src.start();
      return { flt, g };
    };
    this.windLow = mk(this._noiseBuffer(6, 'brown'), 'bandpass', 300, 0.6);
    this.windHigh = mk(this._noiseBuffer(3), 'highpass', 2500, 0.5);
  }

  /** Rugido de cascata: ruído grave + chiado de spray, pela cascata mais próxima. */
  setWaterfall(pan, dist) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.fall) {
      const mk = (buf, type, f, q) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const flt = ctx.createBiquadFilter();
        flt.type = type;
        flt.frequency.value = f;
        flt.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(flt).connect(g);
        src.start();
        return { flt, g };
      };
      const pn = ctx.createStereoPanner();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4000;
      const low = mk(this._noiseBuffer(5, 'brown'), 'lowpass', 500, 0.5);
      const hiss = mk(this._noiseBuffer(3), 'bandpass', 1800, 0.4);
      low.g.connect(pn);
      hiss.g.connect(pn);
      pn.connect(lp);
      this._out(lp, 1, 0.9);
      this.fall = { pn, lp, low, hiss };
    }
    const t = ctx.currentTime;
    const k = dist === Infinity ? 0 : 1 / Math.pow(1 + dist / 35, 1.3);
    this.fall.low.g.gain.setTargetAtTime(0.9 * k, t, 0.5);
    this.fall.hiss.g.gain.setTargetAtTime(0.12 * k * k, t, 0.5);
    this.fall.pn.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)) * 0.8, t, 0.3);
    this.fall.lp.frequency.setTargetAtTime(Math.max(250, 5000 / (1 + dist / 80)), t, 0.5);
  }

  /**
   * Um pedaço de estrutura cedendo ao longe: rangido grave, depois o estalo
   * seco do concreto partindo (tudo atrasado pela distância).
   */
  collapseStart(pan, dist, creak = 1.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + dist / 340;
    const out = this._placed(pan, dist * 0.35);
    // rangido: serra grave oscilando
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(38, 55), t);
    o.frequency.linearRampToValueAtTime(rand(28, 40), t + creak);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.35, t + creak * 0.6);
    og.gain.exponentialRampToValueAtTime(0.0001, t + creak + 0.3);
    o.connect(lp).connect(og).connect(out);
    o.start(t);
    o.stop(t + creak + 0.4);
    // estalo: ruído curto e forte + ressonância
    const tc = t + creak;
    const src = ctx.createBufferSource();
    src.buffer = this._crackBuf ??= this._noiseBuffer(0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tc);
    g.gain.exponentialRampToValueAtTime(0.9, tc + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, tc + 0.4);
    src.connect(bp).connect(g).connect(out);
    src.start(tc);
    for (let i = 0; i < 5; i++) this._clang(tc + rand(0, 0.6), out, rand(0.15, 0.4), rand(0.3, 0.6));
  }

  /** O impacto lá embaixo: estrondo surdo e um ronco longo que some. */
  collapseImpact(pan, dist) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.min(dist, 3000) / 340;
    const out = this._placed(pan, dist * 0.3);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(42, t);
    o.frequency.exponentialRampToValueAtTime(18, t + 2.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 3.1);
    const src = ctx.createBufferSource();
    src.buffer = this._rumbleBuf ??= this._noiseBuffer(6, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    src.connect(lp).connect(g).connect(out);
    src.start(t);
  }

  /**
   * Baque das garras de uma máquina colossal trocando de trilho: um golpe
   * surdo e um zumbido metálico grave que ressoa — chega atrasado pela distância.
   */
  colossusClamp(pan, dist) {
    if (!this.ctx || dist > 5000) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + dist / 340;
    const out = this._placed(pan, dist * 0.25);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(34, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 1.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 1.7);
    // a estrutura inteira vibrando: duas parciais inarmônicas bem graves
    for (const [f, a] of [[71, 0.09], [113, 0.05]]) {
      const r = ctx.createOscillator();
      r.frequency.value = f * rand(0.97, 1.03);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.0001, t);
      rg.gain.exponentialRampToValueAtTime(a, t + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      r.connect(rg).connect(out);
      r.start(t);
      r.stop(t + 3.6);
    }
    this._thump(t, out, 0.6, 180);
  }

  /** A bordo de um vagão: ronco grave que cresce com a velocidade (m/s). */
  setRide(v) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.ride) {
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(4, 'brown');
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 150;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(g);
      this._out(g, 1, 0.3);
      src.start();
      this.ride = { lp, g };
    }
    const t = ctx.currentTime;
    const k = Math.min(1, v / 36);
    this.ride.g.gain.setTargetAtTime(0.55 * k, t, 0.3);
    this.ride.lp.frequency.setTargetAtTime(120 + 260 * k, t, 0.3);
  }

  /** O vagão mais próximo, visto de fora: ronco que cresce com a proximidade e a velocidade. */
  setCarNear(pan, dist, speed) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.carNear) {
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(5, 'brown');
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 200;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pn = ctx.createStereoPanner();
      src.connect(lp).connect(g).connect(pn);
      this._out(pn, 1, 0.7);
      src.start();
      this.carNear = { lp, g, pn };
    }
    const t = ctx.currentTime;
    const k = dist === Infinity ? 0 : Math.min(1, speed / 30) / (1 + dist / 25);
    this.carNear.g.gain.setTargetAtTime(0.9 * k, t, 0.15);
    this.carNear.lp.frequency.setTargetAtTime(Math.max(120, 700 / (1 + dist / 60)), t, 0.2);
    this.carNear.pn.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
  }

  /** Um vagão passa rente: lufada de ar e o baque das juntas em sequência. */
  carPass(pan, speed) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = Math.min(1, speed / 30);
    const src = ctx.createBufferSource();
    src.buffer = this._gustBuf ??= this._noiseBuffer(10, 'brown');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    bp.frequency.exponentialRampToValueAtTime(200, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.2 * k + 0.05, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const p = this._panner(Math.max(-1, Math.min(1, pan)));
    src.connect(bp).connect(g).connect(p);
    this._out(p, 1, 0.5);
    src.start(t, Math.random() * 6);
    src.stop(t + 1.7);
    // as juntas dos dois truques passando
    for (const dt of [0, 0.08, 0.5, 0.58]) this._thump(t + dt + 0.1, p, 0.12 * k, 380);
  }

  /** Junta do trilho passando sob os truques: dois baques secos. */
  railJoint(k = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pan = this._panner(0);
    this._out(pan, 0.8, 0.3);
    this._thump(t, pan, 0.1 * k, 400);
    this._clang(t + 0.002, pan, 0.03 * k, rand(0.4, 0.55));
    this._thump(t + 0.11, pan, 0.08 * k, 380);
  }

  /** Velocidade do ar passando (m/s). */
  setWind(v) {
    if (!this.windLow) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, Math.max(0, (v - 10) / 45));
    this.windLow.g.gain.setTargetAtTime(0.5 * k * k, t, 0.15);
    this.windLow.flt.frequency.setTargetAtTime(220 + v * 14, t, 0.2);
    const h = Math.min(1, Math.max(0, (v - 28) / 30));
    this.windHigh.g.gain.setTargetAtTime(0.06 * h * h, t, 0.15);
  }

  /**
   * Impacto de uma queda (velocidade em m/s). Acima de ~18 m/s: estrondo e
   * destroços; acima de ~35 m/s o ouvido abafa e fica zunindo por alguns segundos.
   */
  impact(v) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = Math.min(1, Math.max(0, (v - 12) / 40));
    if (k <= 0) return;
    // estrondo
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 0.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.4 + 0.5 * k, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(og);
    this._out(og, 1, 0.8);
    o.start(t);
    o.stop(t + 1.2);
    const src = ctx.createBufferSource();
    src.buffer = this._thudBuf ??= this._noiseBuffer(0.6, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6 * k, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp).connect(ng);
    this._out(ng, 1, 1);
    src.start(t);
    // destroços: pedaços de metal e concreto quicando
    const n = Math.round(3 + k * 9);
    for (let i = 0; i < n; i++) {
      this._clang(t + 0.15 + Math.pow(Math.random(), 1.6) * 1.6, this._placed(rand(-0.8, 0.8), rand(2, 12)), rand(0.05, 0.25) * k, rand(1.5, 3.5));
    }
    // abafado + zumbido
    if (v > 35) {
      const deep = Math.min(1, (v - 35) / 25);
      this.muffle.frequency.cancelScheduledValues(t);
      this.muffle.frequency.setValueAtTime(900 - 600 * deep, t + 0.05);
      this.muffle.frequency.exponentialRampToValueAtTime(20000, t + 2.5 + deep * 3);
      const ring = ctx.createOscillator();
      ring.frequency.value = rand(3400, 4200);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.0001, t);
      rg.gain.exponentialRampToValueAtTime(0.012 + 0.012 * deep, t + 0.3);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 3 + deep * 4);
      ring.connect(rg).connect(this.ctx.destination); // o zumbido é dentro da cabeça: não passa pelo abafador
      ring.start(t);
      ring.stop(t + 7.5);
    }
  }

  _buildDuct() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(8, 'brown');
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(bp).connect(g);
    this._out(g, 0.5, 1.0);
    src.start();
    this._loop(() => bp.frequency.setTargetAtTime(rand(120, 1300), ctx.currentTime, rand(1.5, 4)), () => rand(3, 8), 1);
  }


  // ── eventos ───────────────────────────────────────────────────────────────

  /** Um evento ambiente ao acaso: o lugar é velho, grande e não está vazio. */
  _randomAmbient() {
    const kinds = [
      () => this._drip(),
      () => this._tick(),
      () => this._gust(),
      () => this._rumble(),
    ];
    kinds[randInt(0, kinds.length - 1)]();
  }

  /** Gota caindo em algum lugar muito alto, com eco longo. */
  _drip() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = rand(900, 2200);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * rand(1.3, 1.8), t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.03, 0.07), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const pan = this._panner();
    o.connect(g).connect(pan);
    this._out(pan, 0.3, 1.4);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** Estalo térmico do metal: a estrutura dilata e contrai. */
  _tick() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const pan = this._panner();
    const n = randInt(1, 4);
    for (let i = 0; i < n; i++) this._clang(t0 + i * rand(0.2, 0.9), pan, rand(0.1, 0.3), rand(1.6, 2.6));
    this._out(pan, 0.3, 1.0);
  }

  /** Rajada de ar atravessando uma galeria. */
  _gust() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = rand(4, 9);
    const src = ctx.createBufferSource();
    src.buffer = this._gustBuf ??= this._noiseBuffer(10, 'brown');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(rand(150, 300), t);
    bp.frequency.linearRampToValueAtTime(rand(300, 900), t + dur * 0.5);
    bp.frequency.linearRampToValueAtTime(rand(150, 300), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.15, 0.3), t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = this._panner(rand(-0.6, 0.6));
    src.connect(bp).connect(g).connect(pan);
    this._out(pan, 0.6, 0.8);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** Ronco muito grave e distante: algo enorme se move em outro nível. */
  _rumble() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = rand(3, 7);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(rand(24, 38), t);
    o.frequency.linearRampToValueAtTime(rand(20, 32), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.15, 0.3), t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this._out(g, 1, 0.8);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** A megaestrutura geme: serra grave distorcida com glissando lento. */
  _groan() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = rand(5, 9);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = rand(48, 70);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * rand(0.6, 0.8), t + dur);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(shaper).connect(lp).connect(g);
    this._out(g, 0.5, 1.2);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** Um golpe metálico: ruído curto num banco de ressonâncias inarmônicas. */
  _clang(t, pan, gain, pitch = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._clangBuf ??= this._noiseBuffer(0.05);
    const out = ctx.createGain();
    out.gain.value = gain;
    for (const f of [180, 410, 687, 1130, 1790]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * pitch * rand(0.97, 1.03);
      bp.Q.value = 40;
      src.connect(bp).connect(out);
    }
    out.connect(pan);
    src.start(t);
  }

  /** Obra distante: sequências de marteladas, às vezes um rangido longo. */
  _construction() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    const pan = this._panner(rand(-0.9, 0.9));
    const far = ctx.createBiquadFilter(); // a distância come os agudos
    far.type = 'lowpass';
    far.frequency.value = rand(700, 2200);
    pan.connect(far);
    this._out(far, 0.25, 1.4);
    const pitch = rand(0.5, 1.3);
    if (Math.random() < 0.7) {
      // marteladas (ritmo de bate-estaca, às vezes irregular)
      const n = randInt(3, 12);
      const period = rand(0.35, 1.1);
      for (let i = 0; i < n; i++) {
        const jitter = Math.random() < 0.3 ? rand(-0.1, 0.1) : 0;
        this._clang(t0 + i * period + jitter, pan, rand(0.5, 1.1), pitch);
      }
    } else {
      // rangido de viga: serra muito grave com vibrato irregular
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(rand(30, 60), t0);
      o.frequency.linearRampToValueAtTime(rand(25, 80), t0 + 3);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(5, 13);
      const la = ctx.createGain();
      la.gain.value = rand(3, 9);
      lfo.connect(la).connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(200, 600);
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
      o.connect(bp).connect(g).connect(pan);
      o.start(t0);
      lfo.start(t0);
      o.stop(t0 + 3.3);
      lfo.stop(t0 + 3.3);
    }
  }

  /** Som de transferência (transporte, realocação): whoosh reverso + queda sub-grave. */
  transfer(scaleRatio = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // whoosh "reverso": sobe e corta seco
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.7);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.58);
    g.gain.setValueAtTime(0, t + 0.6);
    src.connect(bp).connect(g);
    this._out(g, 0.6, 1);
    src.start(t);
    // queda sub-grave
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 1.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(og);
    this._out(og, 1, 0.5);
    o.start(t);
    o.stop(t + 2);

    // o drone acompanha a escala: mundo maior → som mais grave
    this.pitch *= Math.pow(scaleRatio, -0.3);
    for (const { osc, ratio } of this.droneOscs) {
      osc.frequency.setTargetAtTime(this.droneBase * ratio * this.pitch, t, 1.5);
    }
  }

  /** Chamado por frame com o estado do observador. */
  update({ speed = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(190 + Math.min(speed, 60) * 6, t, 0.5);
  }

  /**
   * Tamanho do espaço ao redor (m): mistura as três reverberações.
   * ≤ 20 m sala · ~80 m salão · ≥ 250 m abismo aberto.
   */
  setSpace(size) {
    if (!this.ctx || !this.rooms) return;
    const l = Math.log10(Math.max(5, size));
    const lo = Math.log10(20);
    const mid = Math.log10(80);
    const hi = Math.log10(250);
    let w;
    if (l <= lo) w = [1, 0, 0];
    else if (l <= mid) {
      const u = (l - lo) / (mid - lo);
      w = [1 - u, u, 0];
    } else if (l <= hi) {
      const u = (l - mid) / (hi - mid);
      w = [0, 1 - u, u];
    } else w = [0, 0, 1];
    const wet = 0.55 + 0.45 * Math.min(1, (l - 1) / 1.5); // espaços maiores soam mais "molhados"
    const t = this.ctx.currentTime;
    this.rooms.forEach((g, i) => g.gain.setTargetAtTime(w[i] * wet, t, 0.8));
  }

  /** Nó de saída posicionado: panorâmica pela direção, volume e agudos pela distância. */
  _placed(pan, dist) {
    const ctx = this.ctx;
    const p = this._panner(Math.max(-1, Math.min(1, pan)));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(300, 9000 / (1 + dist / 60));
    const g = ctx.createGain();
    g.gain.value = 1 / (1 + dist / 80);
    p.connect(lp).connect(g);
    this._out(g, 0.6, 0.9);
    return p;
  }

  /** Martelada/golpe metálico num ponto (pan −1..1, distância em m). */
  clangAt(pan, dist) {
    if (!this.ctx || dist > 2500) return;
    this._clang(this.ctx.currentTime + dist / 340, this._placed(pan, dist), 0.9, rand(0.6, 1.1));
  }

  /** Chiado curto de solda num ponto. */
  weldAt(pan, dist) {
    if (!this.ctx || dist > 1200) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + dist / 340;
    const src = ctx.createBufferSource();
    src.buffer = this._weldBuf ??= this._noiseBuffer(0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = rand(2500, 5000);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.08, 0.22));
    src.connect(hp).connect(g).connect(this._placed(pan, dist));
    src.start(t);
  }

  /**
   * Um setor perde energia: o baque do contator, o zumbido da rede descendo
   * até sumir e relés estalando em cascata cada vez mais longe.
   */
  powerDown(pan, dist, radius = 300) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.min(dist, 800) / 340;
    const out = this._placed(pan, Math.min(dist, 400) * 0.5);
    // baque
    const k = ctx.createOscillator();
    k.frequency.setValueAtTime(62, t);
    k.frequency.exponentialRampToValueAtTime(24, t + 0.5);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.exponentialRampToValueAtTime(0.55, t + 0.01);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    k.connect(kg).connect(out);
    k.start(t);
    k.stop(t + 1);
    // o zumbido de 100 Hz da rede caindo de rotação
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(100, t);
    hum.frequency.exponentialRampToValueAtTime(22, t + 4.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 4.5);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.14, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 4.8);
    hum.connect(lp).connect(hg).connect(out);
    hum.start(t);
    hum.stop(t + 5);
    // relés: a frente da queda viajando para longe
    const n = randInt(7, 14);
    for (let i = 0; i < n; i++) {
      const r = (i / n) * radius;
      this._clang(t + r / 45 + rand(0, 0.25), this._placed(pan + rand(-0.6, 0.6), dist + r), 0.35 * (1 - i / n) + 0.05, rand(2.6, 4));
    }
  }

  /** A energia volta: o zumbido sobe gaguejando, estalos de relés religando. */
  powerUp(pan, dist, radius = 300) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.min(dist, 800) / 340;
    const out = this._placed(pan, Math.min(dist, 400) * 0.5);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(24, t);
    hum.frequency.exponentialRampToValueAtTime(100, t + 3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.8;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    // gagueja: sobe, cai, sobe de novo — até firmar e sumir no fundo
    let a = t;
    for (let i = 0; i < 6; i++) {
      a += rand(0.15, 0.5);
      hg.gain.setValueAtTime(Math.random() < 0.4 ? 0.01 : 0.06 + i * 0.012, a);
    }
    hg.gain.setTargetAtTime(0.0001, a + 1.2, 0.8);
    hum.connect(bp).connect(hg).connect(out);
    hum.start(t);
    hum.stop(a + 5);
    const n = randInt(5, 10);
    for (let i = 0; i < n; i++) {
      const r = (i / n) * radius;
      this._clang(t + 0.4 + r / 26 + rand(0, 0.4), this._placed(pan + rand(-0.6, 0.6), dist + r), 0.25 * (1 - i / n) + 0.04, rand(2.8, 4.2));
    }
  }

  /** Uma gota tocando o chão perto de você. */
  dripAt(pan, dist) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const f = rand(1100, 2400);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * rand(1.3, 1.7), t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this._placed(pan, dist));
    o.start(t);
    o.stop(t + 0.1);
  }

  /** Mão e pé num degrau de escada de metal. */
  rung() {
    if (!this.ctx) return;
    this._clang(this.ctx.currentTime, this._placed(rand(-0.2, 0.2), 2), 0.12, rand(2.2, 2.8));
  }

  /**
   * Passo, conforme o chão: 'concrete' (baque abafado), 'metal' (chapa que
   * ressoa), 'grate' (grade que chacoalha), 'water' (poça).
   */
  footstep(k = 0.5, surface = 'concrete') {
    if (!this.ctx) return;
    if (surface === 'metal') return this._stepMetal(k);
    if (surface === 'grate') return this._stepGrate(k);
    if (surface === 'water') return this._stepWater(k);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._stepBuf ??= this._noiseBuffer(0.12);
    src.playbackRate.value = rand(0.7, 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = rand(280, 700);
    lp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 + 0.12 * k, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(lp).connect(g);
    const pan = this._panner(rand(-0.2, 0.2));
    g.connect(pan);
    this._out(pan, 0.9, 0.35);
    src.start(t);
    // estalo agudo ocasional: a superfície não é só metal
    if (Math.random() < 0.35) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(rand(900, 2400), t);
      o.frequency.exponentialRampToValueAtTime(rand(200, 500), t + 0.04);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.015, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(og).connect(pan);
      o.start(t);
      o.stop(t + 0.06);
    }
  }

  /** Baque curto e grave, base de todos os passos. */
  _thump(t, pan, gain, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._stepBuf ??= this._noiseBuffer(0.12);
    src.playbackRate.value = rand(0.7, 1.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(lp).connect(g).connect(pan);
    src.start(t);
  }

  /** Chapa de aço: o baque e um "bong" grave que ressoa por baixo. */
  _stepMetal(k) {
    const t = this.ctx.currentTime;
    const pan = this._panner(rand(-0.2, 0.2));
    this._out(pan, 0.9, 0.5);
    this._thump(t, pan, 0.12 + 0.08 * k, rand(350, 600));
    this._clang(t + 0.003, pan, 0.05 + 0.05 * k, rand(0.45, 0.7));
  }

  /** Grade vazada: várias batidinhas metálicas agudas quase juntas. */
  _stepGrate(k) {
    const t = this.ctx.currentTime;
    const pan = this._panner(rand(-0.2, 0.2));
    this._out(pan, 0.9, 0.4);
    this._thump(t, pan, 0.08 + 0.06 * k, rand(300, 500));
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) this._clang(t + i * rand(0.012, 0.03), pan, 0.03 + 0.03 * k, rand(1.8, 2.8));
  }

  /** Poça: respingo (ruído agudo curto) e duas bolhas subindo. */
  _stepWater(k) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = this._panner(rand(-0.2, 0.2));
    this._out(pan, 0.9, 0.3);
    this._thump(t, pan, 0.07, 300);
    const src = ctx.createBufferSource();
    src.buffer = this._splashBuf ??= this._noiseBuffer(0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = rand(1800, 3200);
    hp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 + 0.06 * k, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.14, 0.24));
    src.connect(hp).connect(g).connect(pan);
    src.start(t);
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      const tb = t + 0.04 + i * rand(0.03, 0.08);
      const f = rand(700, 1300);
      o.frequency.setValueAtTime(f, tb);
      o.frequency.exponentialRampToValueAtTime(f * rand(1.6, 2.2), tb + 0.035);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, tb);
      og.gain.exponentialRampToValueAtTime(0.025, tb + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, tb + 0.05);
      o.connect(og).connect(pan);
      o.start(tb);
      o.stop(tb + 0.06);
    }
  }

  /** Obturador mecânico: dois estalos secos. */
  shutter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pan = this._panner(0);
    this._out(pan, 0.8, 0.1);
    this._thump(t, pan, 0.08, 2500);
    this._thump(t + 0.07, pan, 0.06, 1800);
  }

  /** Aterrissagem: sub-grave proporcional ao impacto. */
  land(k = 0.5) {
    if (!this.ctx || k < 0.05) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70 + 40 * k, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 + 0.4 * k, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    this._out(g, 1, 0.6);
    o.start(t);
    o.stop(t + 0.55);
    this.footstep(1);
  }

  /** O sistema realoca o observador (queda interrompida). */
  reindex() {
    if (!this.ctx) return;
    this.transfer(1);
  }


}
