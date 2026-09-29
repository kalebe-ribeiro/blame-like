// ─────────────────────────────────────────────────────────────────────────────
//  Reflexo planar dos setores inundados.
//
//  Só funciona (e só custa) quando o observador está sobre ou perto de uma
//  lâmina d'água: uma segunda câmera, espelhada no nível da água, renderiza em
//  meia resolução o que está ACIMA da superfície (plano de recorte). A água
//  (material 'flood', USE_REFLECTION) lê essa imagem em espaço de tela,
//  invertida na vertical e tremida pelas ondulações, e mistura por Fresnel.
//
//  O recorte "só acima da água" é feito pela própria projeção (plano near
//  oblíquo, Lengyel 2005) — sem planos de recorte do renderer, que obrigariam
//  a recompilar variantes de TODOS os shaders na primeira vez (1,5 s travado).
//
//  Por que dá certo sem inverter a imagem: refletir a cena no plano y = L e
//  olhá-la com a câmera real é o mesmo que olhar a cena real com uma câmera
//  em y' = 2L − y cuja rotação é M·R·M (M = espelho em y) — que é uma rotação
//  própria: quaternion (−x, y, −z, w). A imagem dela sai de cabeça para baixo
//  em relação à da câmera real; basta ler com v invertido.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MEGA, FLOOD } from '../gen/field.js';

const SCALE = 0.5; // resolução do reflexo em relação à tela

export class ReflectionSystem {
  constructor(shared) {
    this.shared = shared;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.cam = new THREE.PerspectiveCamera();
    this.level = null; // nível GLOBAL da água em uso (ou null)
    this.materials = [];
    this.enabled = true;
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._timer = 0;
  }

  /** Materiais de água que leem o reflexo. */
  attach(material) {
    material.uniforms.uReflTex.value = this.rt.texture;
    this.materials.push(material);
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.floor(w * SCALE)), Math.max(1, Math.floor(h * SCALE)));
  }

  /** Há uma lâmina d'água perto e abaixo do observador? (a cada 0,25 s) */
  update(field, g, dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.25;
    this.level = null;
    if (!this.enabled || !field) return;
    const T = MEGA.tile;
    const i0 = Math.floor(g.x / T);
    const k0 = Math.floor(g.z / T);
    for (const surf of field.floodSurfaces(g.y)) {
      const lvl = surf.top + FLOOD.depth;
      const h = g.y - lvl;
      if (h < 0 || h > 350) continue;
      // água sob o observador ou a poucas placas dele
      const R = h < 40 ? 3 : 6;
      let found = false;
      for (let di = -R; di <= R && !found; di += 1) {
        for (let dk = -R; dk <= R && !found; dk += 1) {
          if (Math.abs(di) + Math.abs(dk) > R + 1) continue;
          if (field.floodedTile(surf, i0 + di, k0 + dk)) found = true;
        }
      }
      if (found) {
        this.level = lvl;
        return;
      }
    }
  }

  render(renderer, scene, camera, origin) {
    const on = this.level !== null;
    for (const m of this.materials) m.uniforms.uReflOn.value = on ? 1 : 0;
    if (!on) return;
    const L = this.level - origin.y; // em coordenadas de cena
    const cam = this.cam;
    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    cam.position.set(camera.position.x, 2 * L - camera.position.y, camera.position.z);
    const q = camera.quaternion;
    cam.quaternion.set(-q.x, q.y, -q.z, q.w);
    cam.updateMatrixWorld(true);

    const sh = this.shared;
    const fogBase = sh.uFogBase.value;
    const silOn = sh.uSilOn.value;
    sh.uFogBase.value = fogBase - camera.position.y + cam.position.y; // névoa relativa ao "olho" espelhado
    sh.uSilOn.value = 0; // a máscara das silhuetas é da câmera real
    // plano near oblíquo = a superfície da água (só o que está acima entra)
    this._plane.set(new THREE.Vector3(0, 1, 0), -(L + 0.08)).applyMatrix4(cam.matrixWorldInverse);
    const P = cam.projectionMatrix;
    const e = P.elements;
    const c = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const qc = this._q.set((Math.sign(c.x) + e[8]) / e[0], (Math.sign(c.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    c.multiplyScalar(2 / c.dot(qc));
    e[2] = c.x;
    e[6] = c.y;
    e[10] = c.z + 1;
    e[14] = c.w;
    cam.projectionMatrixInverse.copy(P).invert();
    // a própria água não pode ler a textura em que está sendo escrita (laço de realimentação)
    for (const m of this.materials) {
      m.uniforms.uReflOn.value = 0;
      m.uniforms.uReflTex.value = null;
    }
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    for (const m of this.materials) {
      m.uniforms.uReflOn.value = 1;
      m.uniforms.uReflTex.value = this.rt.texture;
    }
    sh.uFogBase.value = fogBase;
    sh.uSilOn.value = silOn;
  }

  dispose() {
    this.rt.dispose();
  }
}
