// ─────────────────────────────────────────────────────────────────────────────
//  Marcas deixadas por você (fase 4.3 — ver o cofre, Marcas-do-jogador).
//
//  O atalho 'mark' (V / LB) pinta uma seta de estêncil na superfície para onde
//  você olha (até REACH m), apontando na direção do olhar projetada nela —
//  mire um pouco para o lado e a seta aponta para o lado. Mirar numa marca
//  que já existe e apertar de novo a apaga.
//
//  As marcas ficam no mundo salvo (slot.marks, posições GLOBAIS), aparecem no
//  mapa e vão junto numa seed compartilhada (app/share.js) — as de outra
//  pessoa vêm com outra tinta (ferrugem). Só as marcas perto existem na cena;
//  a tinta reflete a luz que chega nela (a mesma conta das inscrições).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';

const REACH = 7; // m
const RANGE = 140; // m: marcas criadas na cena até aqui
const SIZE = 1.1; // m
const MAX = 400; // por mundo
const ERASE = 0.8; // m: mirar tão perto de uma marca a apaga

let texCache = null;
/** A seta de estêncil (uma textura só, compartilhada): pontas retas, pontes do estêncil. */
function arrowTexture() {
  if (texCache) return texCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  // haste com duas pontes (falhas), e a cabeça (pontas para cima: +v)
  g.fillRect(56, 50, 16, 20);
  g.fillRect(56, 76, 16, 20);
  g.fillRect(56, 102, 16, 18);
  g.beginPath();
  g.moveTo(64, 8);
  g.lineTo(104, 50);
  g.lineTo(80, 50);
  g.lineTo(64, 34);
  g.lineTo(48, 50);
  g.lineTo(24, 50);
  g.closePath();
  g.fill();
  // tinta de spray: borda irregular e respingos
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.5;
  for (let i = 0; i < 40; i++) g.fillRect(40 + Math.random() * 48, 4 + Math.random() * 120, 1, 1);
  texCache = new THREE.CanvasTexture(c);
  texCache.colorSpace = THREE.SRGBColorSpace;
  return texCache;
}

const PAINT = { own: new THREE.Color(0.86, 0.84, 0.78), shared: new THREE.Color(0.62, 0.3, 0.18) };

export function createMarks(ctx) {
  const { world, camera, controls, audio } = ctx;
  const slot = ctx.slot;
  const list = () => (slot.marks ??= []);
  const items = new Map(); // índice (id estável: m.at) → mesh
  const geo = new THREE.PlaneGeometry(SIZE, SIZE);
  const _o = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _g = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _x = new THREE.Vector3();
  let scan = 0;
  let relight = 0;

  function place(m) {
    const mat = new THREE.MeshBasicMaterial({ map: arrowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, color: 0x000000 });
    const mesh = new THREE.Mesh(geo, mat);
    // o plano: +z = a normal da superfície, +y (a ponta da seta) = a direção pintada
    _n.set(m.nx, m.ny, m.nz);
    _a.set(m.dx, m.dy, m.dz);
    _x.crossVectors(_a, _n).normalize();
    _m.makeBasis(_x, _a, _n);
    mesh.quaternion.setFromRotationMatrix(_m);
    mesh.userData.noCollide = true;
    mesh.renderOrder = 4;
    world.streamGroup.add(mesh);
    return mesh;
  }

  /** V / LB: pinta uma seta onde você olha — ou apaga a marca em que você mira. */
  function toggle() {
    if (ctx.wake?.active || controls.mode !== 'walk') return;
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    const col = controls.walker.col;
    // (as malhas perto do corpo: o walker já recolheu neste quadro, num raio de 30 m)
    const hit = col.ray(_o, _d, REACH);
    if (!hit || !hit.face) {
      ctx.carried?.say?.(t('device.markFar'), 2);
      return;
    }
    const p = world.toGlobal(hit.point, _g);
    // mirou numa marca: apaga
    const L = list();
    const near = L.findIndex((m) => Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z) < ERASE);
    if (near >= 0) {
      const [gone] = L.splice(near, 1);
      const mesh = items.get(gone.at);
      if (mesh) {
        mesh.removeFromParent();
        mesh.material.dispose();
        items.delete(gone.at);
      }
      audio.deviceClick?.(false);
      return;
    }
    if (L.length >= MAX) {
      ctx.carried?.say?.(t('device.markFull'), 2);
      return;
    }
    // normal no mundo; a seta: o olhar projetado na superfície (olhando reto: para cima)
    _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
    if (_n.dot(_d) > 0) _n.negate();
    _a.copy(_d).addScaledVector(_n, -_d.dot(_n));
    if (_a.lengthSq() < 0.04) _a.set(0, 1, 0).addScaledVector(_n, -_n.y);
    if (_a.lengthSq() < 1e-4) _a.set(1, 0, 0).addScaledVector(_n, -_n.x);
    _a.normalize();
    const r = (v) => Math.round(v * 100) / 100;
    const m = {
      x: r(p.x + _n.x * 0.02), y: r(p.y + _n.y * 0.02), z: r(p.z + _n.z * 0.02),
      nx: r(_n.x), ny: r(_n.y), nz: r(_n.z),
      dx: r(_a.x), dy: r(_a.y), dz: r(_a.z),
      at: Date.now(),
    };
    L.push(m);
    items.set(m.at, place(m));
    scan = 0.3;
    relight = 0;
    audio.deviceClick?.(true);
    world.bus.emit('player:mark', { x: m.x, y: m.y, z: m.z });
  }

  return {
    toggle,
    /** Todas as marcas deste mundo (para o mapa e o código de compartilhar). */
    list,
    update(dt) {
      const origin = world.origin;
      world.toGlobal(camera.position, _g);
      scan -= dt;
      if (scan <= 0) {
        scan = 1;
        const want = new Set();
        for (const m of list()) if (Math.hypot(m.x - _g.x, m.y - _g.y, m.z - _g.z) < RANGE) want.add(m.at);
        for (const [id, mesh] of items) {
          if (want.has(id)) continue;
          mesh.removeFromParent();
          mesh.material.dispose();
          items.delete(id);
        }
        for (const m of list()) if (want.has(m.at) && !items.has(m.at)) items.set(m.at, place(m));
      }
      relight -= dt;
      const lit = relight <= 0;
      if (lit) relight = 0.4;
      for (const m of list()) {
        const mesh = items.get(m.at);
        if (!mesh) continue;
        mesh.position.set(m.x - origin.x, m.y - origin.y, m.z - origin.z);
        if (lit) {
          // a tinta reflete a luz que chega (a mesma conta das inscrições); some na névoa
          const l = Math.min(0.9, world.inscriptions._lightAt(mesh.position) * 5);
          mesh.material.color.copy(m.shared ? PAINT.shared : PAINT.own).multiplyScalar(l);
          const d = Math.hypot(m.x - _g.x, m.y - _g.y, m.z - _g.z);
          mesh.material.opacity = Math.max(0, 1 - d / RANGE) * 0.95;
        }
      }
    },
    /** Mundo novo: as marcas do outro mundo saem da cena. */
    reset() {
      for (const mesh of items.values()) {
        mesh.removeFromParent();
        mesh.material.dispose();
      }
      items.clear();
    },
  };
}
