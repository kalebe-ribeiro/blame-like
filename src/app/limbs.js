// ─────────────────────────────────────────────────────────────────────────────
//  Os braços do jogador em primeira pessoa (o rework gráfico, frente 4 — o cofre, Rework-grafico).
//
//  O usuário (2026-10-09): "os braços não fazem sentido anatomicamente (parece que saem da mesma origem)".
//  Antes, só as mãos e o que elas seguram apareciam; o que se lia como braço era o corpo do emissor e do
//  aparelho entrando na tela de baixo para o meio. Agora cada mão visível (a que segura o aparelho, a
//  lanterna, o emissor — ou a que agarra uma quina) ganha braço, cotovelo e antebraço: IK de dois
//  segmentos do OMBRO (fora da tela, ao lado e abaixo dos olhos) até o PULSO, o cotovelo para fora e
//  para baixo. A manga de tecido; o lado da prótese (app/arms.js — R4), de metal.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { handMaterial } from './hands.js';

const UPPER = 0.3; // m: ombro → cotovelo
const FORE = 0.28; // m: cotovelo → pulso
// os ombros no espaço da câmera (os olhos): ao lado, abaixo e um pouco atrás
const SHOULDER = { [-1]: new THREE.Vector3(-0.19, -0.21, 0.07), [1]: new THREE.Vector3(0.19, -0.21, 0.07) };
const WRIST = new THREE.Vector3(0, 0, 0.075); // o pulso no espaço da mão (atrás da palma — app/hands.js)
const Y = new THREE.Vector3(0, 1, 0);

/** Um tronco de cone da base (y 0, raio r0) ao topo (y 1, raio r1), com tampas. */
function segment(r0, r1) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 10, 1);
  g.translate(0, 0.5, 0);
  return g;
}

export function createLimbs(ctx) {
  const { camera, world } = ctx;
  const upperGeo = segment(0.052, 0.045);
  const foreGeo = segment(0.044, 0.034);
  const jointGeo = new THREE.SphereGeometry(1, 10, 8);
  const sides = {};
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.visible = false;
    camera.add(g);
    const mat = world.materials.cloth;
    const upper = new THREE.Mesh(upperGeo, mat);
    const fore = new THREE.Mesh(foreGeo, mat);
    const elbow = new THREE.Mesh(jointGeo, mat);
    elbow.scale.setScalar(0.047);
    for (const m of [upper, fore, elbow]) {
      m.frustumCulled = false;
      m.userData.noCollide = true;
      g.add(m);
    }
    sides[s] = { g, upper, fore, elbow, kind: '' };
  }
  const _w = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _e = new THREE.Vector3();
  const _pole = new THREE.Vector3();

  /** A peça está à vista (ela e todos os pais até a câmera)? */
  const shown = (o) => {
    for (let q = o; q; q = q.parent) {
      if (!q.visible) return false;
      if (q === camera) return true;
    }
    return false;
  };
  /** Põe um segmento de a até b (espaço da câmera). */
  const place = (m, a, b) => {
    _d.subVectors(b, a);
    const len = _d.length();
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(Y, _d.divideScalar(len || 1));
    m.scale.set(1, len, 1);
  };

  // ── o corpo, visível ao olhar para baixo (o casaco longo, as pernas): segue a câmera só no giro (yaw),
  //    os pés no chão; as pernas balançam com o passo (walker.bobPhase). Só a pé e sem estar pendurado.
  const body = new THREE.Group();
  ctx.scene.add(body);
  const coat = world.materials.cloth;
  const part = (geo, x, y, z, mat = coat) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.frustumCulled = false;
    o.userData.noCollide = true;
    body.add(o);
    return o;
  };
  // (alturas a partir dos olhos; z +: atrás)
  part(new THREE.CylinderGeometry(0.16, 0.19, 0.55, 10), 0, -0.66, 0.2); // o tronco (atrás: ao olhar para baixo, o peito só na borda)
  part(new THREE.CylinderGeometry(0.2, 0.25, 0.55, 10, 1, true), 0, -1.08, 0.16); // a aba do casaco
  const legs = [-1, 1].map((sx) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.1, -0.95, 0.1);
    body.add(hip);
    const leg = new THREE.Mesh(segment(0.07, 0.085), coat);
    leg.rotation.x = Math.PI; // (cresce para baixo)
    leg.scale.set(1, 0.72, 1);
    leg.frustumCulled = false;
    hip.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.26), world.materials.machine);
    boot.position.set(0, -0.72, -0.08);
    boot.frustumCulled = false;
    hip.add(boot);
    return hip;
  });
  const _yaw = new THREE.Euler();

  return {
    update() {
      // o corpo
      const w = ctx.controls.walker;
      const onFoot = ctx.controls.mode === 'walk' && !w?.ledgeState;
      body.visible = onFoot;
      if (onFoot) {
        _yaw.setFromQuaternion(camera.quaternion, 'YXZ');
        body.position.copy(camera.position);
        body.rotation.set(0, _yaw.y, 0);
        const ph = w?.bobPhase ?? 0;
        const sw = Math.min(1, Math.hypot(w?.vel?.x ?? 0, w?.vel?.z ?? 0) / 4) * 0.45;
        legs[0].rotation.x = Math.sin(ph) * sw;
        legs[1].rotation.x = -Math.sin(ph) * sw;
      }
      const kinds = ctx.player?.armKind;
      for (const s of [-1, 1]) {
        const L = sides[s];
        // a mão deste lado que está à vista (a primeira que se acha)
        const cands = [...(ctx.carried?.handGroups?.(s) ?? []), ...(ctx.beam?.handGroups?.(s) ?? [])];
        const hand = cands.find(shown);
        L.g.visible = !!hand;
        if (!hand) continue;
        // a manga ou o metal (a prótese)
        const kind = s > 0 ? kinds?.right : kinds?.left;
        if (kind !== L.kind) {
          L.kind = kind;
          const mat = handMaterial(world, kind);
          L.upper.material = L.fore.material = L.elbow.material = mat;
        }
        // o pulso no espaço da câmera
        hand.updateWorldMatrix(true, false);
        _w.copy(WRIST).applyMatrix4(hand.matrixWorld);
        camera.worldToLocal(_w);
        // IK de dois segmentos: o cotovelo no círculo de soluções, do lado do polo (para fora e para baixo)
        const S = SHOULDER[s];
        _d.subVectors(_w, S);
        const dist = Math.min(Math.max(_d.length(), 0.05), UPPER + FORE - 1e-3);
        _d.normalize();
        const a = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist);
        const h = Math.sqrt(Math.max(UPPER * UPPER - a * a, 0));
        _pole.set(s * 0.8, -0.9, 0.25);
        _pole.addScaledVector(_d, -_pole.dot(_d)).normalize();
        _e.copy(S).addScaledVector(_d, a).addScaledVector(_pole, h);
        place(L.upper, S, _e);
        place(L.fore, _e, _w);
        L.elbow.position.copy(_e);
      }
    },
  };
}
