// ─────────────────────────────────────────────────────────────────────────────
//  O emissor na mão, antes e depois do tiro (o rework gráfico, segunda rodada — o usuário: "vc não
//  incluiu efeitos do emissor antes e depois de atirar"). Os efeitos no MUNDO (a lente, a poeira puxada,
//  a singularidade, o traço, a detonação, a brasa) são de app/beamfx.js; aqui, o que acontece na ARMA:
//
//    carregando   o brilho na boca do cano crescendo com a carga (a cor do estágio — beamColors); grãos
//                 de poeira puxados para dentro do cano; na sobrecarga, o calor subindo nas aletas de
//                 cima e, do estágio 4 em diante, faíscas estalando entre as bobinas
//    o tiro       um clarão curto na boca
//    depois       a arma em brasa — as aletas, a coroa da boca e as bobinas esfriando (laranja → vermelho
//                 → apagado, em segundos, pela potência) — e a fumaça saindo do cano e das aletas
//
//  O calor (heat 0..~3) é um número só: sobe na sobrecarga e no tiro, cai com o tempo; todo o resto lê dele.
//  Nada é mágico: toda luz tem fonte (as bobinas, o metal quente, o clarão do disparo).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Burst, now } from '../render/burst.js';

/** Um disco suave (o brilho e o clarão): a textura radial. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A cor do metal pelo calor (0..1+): apagado → vermelho escuro → laranja → amarelo-claro. */
function emberColor(h, out) {
  const x = Math.min(1.3, h);
  if (x < 0.35) return out.setRGB(0.6, 0.04, 0.0).multiplyScalar(x / 0.35);
  if (x < 0.8) return out.setRGB(0.6, 0.04, 0).lerp(_orange, (x - 0.35) / 0.45);
  return out.copy(_orange).lerp(_hot, Math.min(1, (x - 0.8) / 0.5));
}
const _orange = new THREE.Color(1.0, 0.32, 0.04);
const _hot = new THREE.Color(1.0, 0.7, 0.35);

/**
 * em: o emissor (app/beam.js buildEmitter — o grupo, a boca, as bobinas, as aletas, a coroa).
 * → { update(dt, s), shot(k, o) } — s: { visible, charging, k, o, stage, color (THREE.Color: a das bobinas) }
 */
export function createGunFx(ctx, em) {
  const { world, camera } = ctx;
  const tex = glowTexture();
  // o brilho da boca e o clarão do tiro (sprites somados, presos à boca)
  const glowMat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const glow = new THREE.Sprite(glowMat);
  glow.renderOrder = 12;
  em.muzzle.add(glow);
  const flashMat = glowMat.clone();
  const flash = new THREE.Sprite(flashMat);
  flash.renderOrder = 12;
  em.muzzle.add(flash);
  // o calor no metal: tiras emissivas por cima das aletas, um anel na coroa da boca
  const heatMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const v of em.vents) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.003, 0.011), heatMat);
    strip.position.copy(v.position).add(new THREE.Vector3(0, 0.004, 0));
    em.group.add(strip);
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 18), heatMat);
  crown.position.copy(em.crown.position).add(new THREE.Vector3(0, 0, -0.013));
  em.group.add(crown);

  // as partículas no mundo: a poeira puxada para a boca, as faíscas das bobinas, a fumaça
  const group = new THREE.Group();
  ctx.scene.add(group);
  const motes = new Burst(384, { additive: true, a: new THREE.Color(1.0, 0.9, 0.75), b: new THREE.Color(0.5, 0.45, 0.4), alpha: 0.55, soft: 1 });
  const crackle = new Burst(256, { additive: true, gravity: 9.8, drag: 1.0, a: new THREE.Color(1.0, 0.85, 0.6), b: new THREE.Color(1.0, 0.3, 0.05), soft: 0, alpha: 1, streak: true });
  const smoke = new Burst(512, { gravity: -0.5, drag: 1.4, grow: 5, a: new THREE.Color(0.34, 0.33, 0.32), b: new THREE.Color(0.12, 0.12, 0.12), alpha: 0.28, soft: 1 });
  for (const b of [smoke, motes, crackle]) group.add(b.points);

  let heat = 0; // o calor da arma
  let flashT = 0; // s desde o clarão (−1: nenhum)
  let flashK = 0;
  let smokeT = 0; // s de fumaça ainda saindo
  let smokeK = 0;
  const _g = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _c = new THREE.Color();
  const _f = new THREE.Vector3();

  /** A boca (GLOBAL) e para onde ela aponta. */
  const muzzleG = () => {
    em.muzzle.getWorldPosition(_g);
    camera.getWorldDirection(_f);
    return _g.add(world.origin);
  };

  return {
    /** O disparo (a carga k, a sobrecarga o): o clarão, o calor, a fumaça que vem depois. */
    shot(k, o) {
      flashT = 0;
      flashK = 0.6 + 0.8 * k + 1.2 * o;
      heat = Math.min(3, heat + 0.12 + 0.25 * k + 1.1 * o); // (o tiro comum só amorna; a sobrecarga põe em brasa)
      smokeT = 0.8 + 1.2 * k + 2.5 * o;
      smokeK = 0.4 + 0.6 * k + o;
    },
    /** @param {{ visible: boolean, charging: boolean, k: number, o: number, stage: number, color: THREE.Color }} s */
    update(dt, s) {
      const t = now();
      // o calor: na sobrecarga sobe (o estágio esquenta a arma); sempre esfria (mais rápido quando muito quente)
      if (s.charging && s.stage > 0) heat = Math.min(3, heat + dt * (0.06 + 0.07 * s.stage));
      heat = Math.max(0, heat - dt * (0.12 + 0.18 * heat));
      // o brilho da boca carregando
      const gl = s.visible && s.charging ? 0.25 + 0.75 * s.k + 0.12 * s.stage : 0;
      glowMat.opacity += (Math.min(1, gl) - glowMat.opacity) * Math.min(1, dt * 12);
      glowMat.color.copy(s.color);
      const flick = 1 + 0.08 * Math.sin(t * 61) + (s.stage >= 4 ? 0.2 * Math.sin(t * 23) : 0);
      glow.scale.setScalar((0.03 + 0.07 * s.k + 0.025 * s.stage) * flick);
      glow.visible = glowMat.opacity > 0.01;
      // o clarão do tiro (~80 ms)
      if (flashT >= 0) {
        flashT += dt;
        const a = Math.max(0, 1 - flashT / 0.08);
        flashMat.opacity = Math.min(1, a * flashK);
        flashMat.color.copy(s.color).lerp(_hot, 0.3);
        flash.scale.setScalar(0.12 + 0.2 * flashK * (1 - a * 0.5));
        flash.visible = s.visible && a > 0;
        if (a <= 0) flashT = -1;
      } else flash.visible = false;
      // o metal em brasa (as aletas, a coroa); as bobinas apagadas ficam na cor do calor (app/beam.js lê heatColor)
      emberColor(heat, _c);
      heatMat.color.copy(_c).multiplyScalar(Math.min(1, heat * 1.2) * 0.75);
      heatMat.visible = heat > 0.02;
      const g = muzzleG();
      // a poeira puxada para dentro do cano
      if (s.visible && s.charging && s.k > 0.05) {
        const n = Math.random() < 0.6 + s.k ? 1 + Math.floor(s.k * 2 + s.stage * 0.5) : 0;
        for (let i = 0; i < n; i++) {
          _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.18 + Math.random() * 0.25);
          _p.copy(g).add(_v).addScaledVector(_f, 0.05);
          const life = 0.28 + Math.random() * 0.15;
          motes.spawn(_p, _v.multiplyScalar(-1 / life), t, life, 0.006 + Math.random() * 0.006);
        }
      }
      // as faíscas estalando entre as bobinas (estágio 4+)
      if (s.visible && s.charging && s.stage >= 4 && Math.random() < 0.18 + 0.1 * (s.stage - 4)) {
        const c = em.coilMeshes[Math.floor(Math.random() * em.coilMeshes.length)];
        c.getWorldPosition(_p).add(world.origin);
        for (let i = 0; i < 4; i++) crackle.spawn(_p, _v.set((Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5), t, 0.12 + Math.random() * 0.2, 0.012);
      }
      // a fumaça: sai do cano (um pouco para a frente) e, quente, das aletas
      if (smokeT > 0) {
        smokeT = Math.max(0, smokeT - dt);
        const rate = smokeK * (0.4 + 0.6 * Math.min(1, smokeT)) * 40;
        let n = rate * dt;
        while (n > 0) {
          if (Math.random() < n) {
            _v.copy(_f).multiplyScalar(0.25 + Math.random() * 0.3);
            _v.y += 0.15 + Math.random() * 0.2;
            _v.x += (Math.random() - 0.5) * 0.15;
            _v.z += (Math.random() - 0.5) * 0.15;
            smoke.spawn(g, _v, t, 1.2 + Math.random() * 1.4, 0.03 + Math.random() * 0.03);
          }
          n -= 1;
        }
      }
      if (heat > 0.4 && s.visible && Math.random() < dt * 6 * heat) {
        em.vents[Math.floor(Math.random() * em.vents.length)].getWorldPosition(_p).add(world.origin);
        smoke.spawn(_p, _v.set((Math.random() - 0.5) * 0.06, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.06), t, 0.9 + Math.random(), 0.02);
      }
      const res = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
      for (const b of [smoke, motes, crackle]) b.update(world.origin, t, res);
    },
    /** O calor da arma (0..3) e a cor dele — as bobinas apagadas ficam em brasa. */
    get heat() {
      return heat;
    },
    heatColor(out) {
      return emberColor(heat, out).multiplyScalar(Math.min(1, heat * 1.2) * 0.75);
    },
  };
}
