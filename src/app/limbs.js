// ─────────────────────────────────────────────────────────────────────────────
//  Os braços e o corpo do jogador em primeira pessoa (o rework gráfico — o cofre, Rework-grafico).
//
//  Frente 4: cada mão visível (a que segura o aparelho, a lanterna, o emissor — ou a que agarra uma quina)
//  ganha braço, cotovelo e antebraço: IK de dois segmentos do OMBRO (fora da tela, ao lado e abaixo dos
//  olhos) até o PULSO, o cotovelo para fora e para baixo.
//  Segunda rodada (o usuário: o que vale para o design dos NPCs vale para o do jogador): o braço é UMA
//  manga contínua (world/flesh.js) presa a dois ossos — o ombro e o cotovelo, que o IK gira —, larga, com
//  o punho abrindo (o casaco comprido); o lado da prótese (app/arms.js — R4), um braço de máquina. O corpo
//  visto de cima: o casaco longo aberto na frente, as calças e as botas grandes, nas pernas que balançam.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { FleshLayer, layerGeometry, skinned } from '../world/flesh.js';
import { movingMaterial } from '../shaders/materials.js';

const UPPER = 0.3; // m: ombro → cotovelo
const FORE = 0.28; // m: cotovelo → pulso
// os ombros no espaço da câmera (os olhos): ao lado, abaixo e um pouco atrás
const SHOULDER = { [-1]: new THREE.Vector3(-0.19, -0.21, 0.07), [1]: new THREE.Vector3(0.19, -0.21, 0.07) };
const WRIST = new THREE.Vector3(0, 0, 0.075); // o pulso no espaço da mão (atrás da palma — app/hands.js)
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Um esqueleto pequeno montado na origem (a pose de repouso) e as camadas de pele dele, vindas do worker.
 * bones: [Bone] (o primeiro é a raiz); chains: a cadeia de cada osso; layers: [{ key, mat, cell, build(F) }].
 * As malhas entram em `group` quando chegam (o skinning: as matrizes dos ossos na pose de agora).
 */
function fleshRig(group, bones, chains, layers) {
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const meshes = [];
  for (const L of layers) {
    const make = () => {
      const F = new FleshLayer(bones, chains);
      L.build(F);
      return F;
    };
    layerGeometry(L.key, make, L.cell ?? 0.012).then((geo) => {
      const m = skinned(geo, L.mat, skeleton);
      m.frustumCulled = false;
      group.add(m);
      meshes.push(m);
      L.onMesh?.(m);
    });
  }
  return meshes;
}

export function createLimbs(ctx) {
  const { camera, world } = ctx;
  const M = world.materials;
  const sleeveMat = movingMaterial(M.garb);
  const cuffMat = movingMaterial(M.leather);
  const metalMat = movingMaterial(M.machine);
  const sides = {};
  for (const s of [-1, 1]) {
    // o braço: o osso do ombro (no ombro) e o do cotovelo (a UPPER m dele, para baixo, na pose de repouso)
    const g = new THREE.Group();
    const sh = new THREE.Bone();
    const el = new THREE.Bone();
    el.position.set(0, -UPPER, 0);
    sh.add(el);
    g.add(sh);
    const cloth = [];
    const metal = [];
    fleshRig(g, [sh, el], [1, 1], [
      {
        // a manga larga do casaco: o ombro, o cotovelo e o antebraço abrindo no punho
        key: `pl:sleeve2:${s}`,
        mat: sleeveMat,
        build(F) {
          // (sem a bola do ombro: ele fica rente aos olhos — pendurado, era uma cúpula na tela)
          F.cone(sh, [0, -0.05, 0], [0, -UPPER, 0], 0.046, 0.052, 0.03);
          F.blob(el, [0, 0, 0.01], [0.054, 0.05, 0.054], 0.02);
          F.cone(el, [0, 0, 0], [0, -FORE * 0.82, 0], 0.052, 0.062, 0.03);
          F.carveBlob(el, [0, -FORE * 0.86, 0], [0.05, 0.05, 0.05], 0.01); // (a boca da manga)
        },
        onMesh: (m) => cloth.push(m),
      },
      {
        // o punho de couro (a dobra da manga)
        key: `pl:cuff:${s}`,
        mat: cuffMat,
        build(F) {
          F.cone(el, [0, -FORE * 0.72, 0], [0, -FORE * 0.8, 0], 0.066, 0.068, 0.01);
        },
        onMesh: (m) => cloth.push(m),
      },
      {
        // a prótese: o braço de máquina (segmentos de metal, juntas em bola)
        key: `pl:mech:${s}`,
        mat: metalMat,
        build(F) {
          F.blob(sh, [0, 0, 0], [0.06, 0.055, 0.06], 0.02);
          F.cone(sh, [0, -0.04, 0], [0, -UPPER + 0.03, 0], 0.035, 0.03, 0.01);
          F.blob(el, [0, 0, 0], [0.04, 0.04, 0.04], 0.01);
          F.cone(el, [0, -0.035, 0], [0, -FORE + 0.02, 0], 0.03, 0.036, 0.01);
          F.blob(el, [0, -FORE + 0.01, 0], [0.04, 0.02, 0.04], 0.01);
        },
        onMesh: (m) => {
          m.visible = false;
          metal.push(m);
        },
      },
    ]);
    g.visible = false;
    camera.add(g);
    sides[s] = { g, sh, el, cloth, metal, kind: '' };
  }
  const _w = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _e = new THREE.Vector3();
  const _pole = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _qi = new THREE.Quaternion();

  /** A peça está à vista (ela e todos os pais até a câmera)? */
  const shown = (o) => {
    for (let q = o; q; q = q.parent) {
      if (!q.visible) return false;
      if (q === camera) return true;
    }
    return false;
  };

  // ── o corpo, visível ao olhar para baixo: segue a câmera só no giro (yaw), os pés no chão; as pernas
  //    balançam com o passo (walker.bobPhase). Só a pé e sem estar pendurado. (alturas a partir dos olhos;
  //    z +: atrás — o peito fica atrás da câmera, ao olhar para baixo só a borda dele)
  const body = new THREE.Group();
  ctx.scene.add(body);
  const root = new THREE.Bone();
  const hips = [-1, 1].map((sx) => {
    const hp = new THREE.Bone();
    hp.position.set(sx * 0.1, -0.95, 0.1);
    root.add(hp);
    return hp;
  });
  body.add(root);
  const LEG = 0.66;
  const coatMat = movingMaterial(M.garb);
  const bootMat = movingMaterial(M.leather);
  const legMat = movingMaterial(M.mantle);
  // (montado só depois da largada — no início, o forno das superfícies ocupa a GPU: o corpo junto travava o driver)
  const buildBody = () => fleshRig(body, [root, ...hips], [0, 20, 21], [
    {
      // o casaco longo: o tronco atrás, a aba descendo até a canela, aberta na frente
      key: 'pl:coat',
      mat: coatMat,
      cell: 0.02,
      build(F) {
        F.blob(root, [0, -0.62, 0.2], [0.19, 0.3, 0.13], 0.06);
        F.cone(root, [0, -0.8, 0.17], [0, -1.42, 0.19], 0.2, 0.29, 0.06);
        F.cut(root, [0, -1.4, 0], [0, -1, 0], 0.01);
        F.carve(root, [0, -1.5, -0.2], [0, -0.85, -0.05], 0.1, 0.02, 0.03); // a frente aberta
        F.carveBlob(root, [0, -1.3, 0.12], [0.16, 0.35, 0.13], 0.02); // (oco: as pernas dentro)
      },
    },
    {
      // as calças
      key: 'pl:legs',
      mat: legMat,
      cell: 0.018,
      build(F) {
        for (const hp of hips) F.cone(hp, [0, 0, 0], [0, -LEG * 0.82, 0], 0.075, 0.062, 0.03);
      },
    },
    {
      // as botas grandes
      key: 'pl:boots',
      mat: bootMat,
      cell: 0.018,
      build(F) {
        for (const hp of hips) {
          F.cone(hp, [0, -LEG * 0.62, 0], [0, -LEG, 0], 0.068, 0.072, 0.02);
          F.blob(hp, [0, -LEG - 0.02, -0.07], [0.075, 0.06, 0.14], 0.03);
          F.cut(hp, [0, -LEG - 0.06, 0], [0, -1, 0], 0.01);
        }
      },
    },
  ]);
  let frames = 0;
  const _yaw = new THREE.Euler();

  return {
    update() {
      // o corpo
      const w = ctx.controls.walker;
      if (frames >= 0 && ++frames > 240) {
        frames = -1;
        buildBody();
      }
      const onFoot = ctx.controls.mode === 'walk' && !w?.ledgeState;
      body.visible = onFoot;
      if (onFoot) {
        _yaw.setFromQuaternion(camera.quaternion, 'YXZ');
        body.position.copy(camera.position);
        body.rotation.set(0, _yaw.y, 0);
        const ph = w?.bobPhase ?? 0;
        const sw = Math.min(1, Math.hypot(w?.vel?.x ?? 0, w?.vel?.z ?? 0) / 4) * 0.45;
        hips[0].rotation.x = Math.sin(ph) * sw;
        hips[1].rotation.x = -Math.sin(ph) * sw;
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
        const mech = kind === 'prosthesis';
        for (const m of L.cloth) m.visible = !mech;
        for (const m of L.metal) m.visible = mech;
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
        // os ossos: o ombro aponta para o cotovelo, o cotovelo para o pulso (−y do osso = o membro)
        L.sh.position.copy(S);
        L.sh.quaternion.setFromUnitVectors(DOWN, _d.subVectors(_e, S).normalize());
        _q.setFromUnitVectors(DOWN, _d.subVectors(_w, _e).normalize());
        L.el.quaternion.copy(_qi.copy(L.sh.quaternion).invert().multiply(_q));
      }
    },
  };
}
