// ─────────────────────────────────────────────────────────────────────────────
//  As mãos (primeira pessoa): luvas escuras, feitas por código — palma, quatro
//  dedos de duas falanges e o polegar, cada junta um Group que dobra.
//
//    segurando   a direita segura o aparelho (os dedos por baixo, o polegar
//                ao lado da tela); a esquerda fecha em volta da lanterna
//    agarrando   pendurado numa quina (controls/walker.js), as duas mãos ficam
//                NA quina (no mundo): a palma em cima, os dedos fechados por
//                cima da borda; o aparelho e a lanterna somem (não dá para se
//                pendurar segurando nada)
//    pela borda  pendurado andando de lado, uma mão de cada vez: a que fica para
//                trás solta, sobe um pouco e pega mais adiante; a outra só vai
//                depois que a primeira firmou
//    subindo     as mãos continuam na quina enquanto o corpo sobe (empurram)
//                e, passando por cima, descem para fora da vista
//
//  Coordenadas: as mãos que seguram são filhas do aparelho / da lanterna; as
//  que agarram são filhas da câmera, reposicionadas a cada quadro a partir de
//  pontos do mundo (camera.worldToLocal).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const PALM = { w: 0.078, h: 0.024, d: 0.082 };
const FINGER = { w: 0.016, h: 0.016, a: 0.036, b: 0.03 }; // falanges (de perto, de longe)

function box(w, h, d, mat, z0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, 0, -d / 2 + z0); // a junta no começo (+z); o dedo cresce para −z
  return new THREE.Mesh(g, mat);
}

/** Uma mão (side: −1 esquerda, +1 direita). Os dedos apontam para −z; a palma olha para −y. */
export function buildHand(mat, side, { arm = false } = {}) {
  const group = new THREE.Group();
  const palm = box(PALM.w, PALM.h, PALM.d, mat, PALM.d / 2);
  group.add(palm);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.07, 8), mat); // o punho da manga
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = PALM.d / 2 + 0.035;
  cuff.scale.set(1.1, 1, 0.7);
  group.add(cuff);
  // (o punho da manga só nas mãos que agarram; o braço até o ombro é desenhado à parte —
  // createHands —, porque depende de onde a mão está em relação ao corpo)
  if (!arm) cuff.visible = false;
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const base = new THREE.Group();
    base.position.set((i - 1.5) * (PALM.w / 4) * side * -1, 0, -PALM.d / 2);
    const p1 = box(FINGER.w, FINGER.h, FINGER.a * (i === 3 ? 0.8 : 1), mat);
    base.add(p1);
    const mid = new THREE.Group();
    mid.position.z = -FINGER.a * (i === 3 ? 0.8 : 1);
    mid.add(box(FINGER.w * 0.92, FINGER.h * 0.92, FINGER.b * (i === 3 ? 0.8 : 1), mat));
    base.add(mid);
    group.add(base);
    fingers.push({ base, mid });
  }
  // o polegar: sai do lado de dentro da palma, apontando para a frente e para dentro
  const tb = new THREE.Group();
  tb.position.set(side * (PALM.w / 2) * -1 + side * 0.006, -0.004, PALM.d / 2 - 0.03);
  tb.rotation.y = side * 0.75;
  tb.add(box(0.019, 0.018, 0.034, mat));
  const tm = new THREE.Group();
  tm.position.z = -0.034;
  tm.add(box(0.017, 0.016, 0.03, mat));
  tb.add(tm);
  group.add(tb);

  return {
    group,
    /** curl: 0 aberta · 1 fechada; thumb: 0 aberto · 1 fechado por cima */
    pose(curl, thumb = curl) {
      for (const f of fingers) {
        f.base.rotation.x = -curl * 1.25;
        f.mid.rotation.x = -curl * 1.35;
      }
      tb.rotation.x = -thumb * 0.5;
      tm.rotation.x = -thumb * 0.9;
    },
  };
}

/**
 * As mãos do jogador. device/flashlight: os Groups de app/carried.js (as mãos que
 * seguram vão neles). update(dt) a cada quadro. busy: pendurado ou subindo.
 */
/** Troca o material de uma mão (e do que for dela): a luva de tecido ou a prótese de metal. */
export function paintHand(group, mat) {
  group.traverse((o) => {
    if (o.isMesh) o.material = mat;
  });
}

/** O material de cada lado: a luva, ou o metal da prótese (app/arms.js — R4). */
export function handMaterial(world, kind) {
  return kind === 'prosthesis' ? world.materials.machine : world.materials.cloth;
}

export function createHands(ctx, { device, flashlight }) {
  const { camera, controls, world } = ctx;
  const glove = world.materials.cloth; // luvas de tecido grosso, gastas
  // o aparelho, seguro por baixo, de palma para cima (os dedos para a frente, dobrando um
  // pouco na ponta; o polegar ao lado da tela) — uma mão para cada lado (side: 1 direita, −1 esquerda)
  const holdDevice = {};
  for (const side of [1, -1]) {
    const h = buildHand(glove, -side); // (de palma para cima, o lado se inverte)
    h.group.position.set(0.006 * side, -0.034, 0.05);
    h.group.rotation.set(0, 0, Math.PI);
    h.pose(0.32, 0.7);
    h.group.visible = false;
    device.add(h.group);
    holdDevice[side] = h;
  }
  // a lanterna: a mão fecha em volta do tubo, a palma do lado de dentro, os dedos por cima
  const holdLantern = {};
  for (const side of [1, -1]) {
    const h = buildHand(glove, side);
    h.group.position.set(0.034 * side, -0.03, 0.03);
    h.group.quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    h.pose(1.05, 1);
    h.group.visible = false;
    flashlight.add(h.group);
    holdLantern[side] = h;
  }
  // as que agarram (filhas da câmera; no lugar certo do mundo a cada quadro)
  const grip = [buildHand(glove, -1, { arm: true }), buildHand(glove, 1, { arm: true })];
  // (os braços até o ombro: app/limbs.js — o mesmo para todas as mãos)
  for (const h of grip) {
    h.group.visible = false;
    camera.add(h.group);
  }
  const _w = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _qc = new THREE.Quaternion();
  const _m = new THREE.Matrix4();
  let held = null; // { edge, nrm } da quina (a última; as mãos descem dela depois da subida)
  let out = 0; // 0 nas quinas · 1 recolhidas
  // onde cada mão está presa (cena) e, se está trocando de lugar, de onde saiu
  const plant = [null, null];
  const move = [null, null]; // { from, t }
  const STEP = 0.3; // m: a mão fica até a distância do lugar dela passar disso
  const SWAP = 0.2; // s para uma mão trocar de lugar
  const _ideal = new THREE.Vector3();
  const _now = new THREE.Vector3();

  let kindsKey = '';
  return {
    /** A prótese: o lado de metal (R4 — kinds: player.armKind). */
    setKinds(kinds) {
      const key = `${kinds?.right}|${kinds?.left}`;
      if (key === kindsKey) return;
      kindsKey = key;
      for (const s of [1, -1]) {
        const mat = handMaterial(world, s > 0 ? kinds?.right : kinds?.left);
        paintHand(holdDevice[s].group, mat);
        paintHand(holdLantern[s].group, mat);
        const i = s > 0 ? 1 : 0; // (grip[0] é a esquerda)
        paintHand(grip[i].group, mat);
      }
    },
    /** Qual mão segura cada coisa (1 direita · −1 esquerda · 0 nenhuma — app/inventory.js). */
    setHolding(deviceSide, lanternSide) {
      for (const s of [1, -1]) {
        holdDevice[s].group.visible = deviceSide === s;
        holdLantern[s].group.visible = lanternSide === s;
      }
    },
    /** As mãos deste lado (1 direita · −1 esquerda) — app/limbs.js desenha o braço da que estiver à vista. */
    handGroups(side) {
      return [grip[side > 0 ? 1 : 0].group, holdDevice[side].group, holdLantern[side].group];
    },
    /** Pendurado ou subindo (o aparelho e a lanterna saem das mãos). */
    get busy() {
      return !!(controls.mode === 'walk' && controls.walker?.ledgeState);
    },
    update(dt) {
      const st = controls.mode === 'walk' ? controls.walker?.ledgeState : null;
      if (st?.edge) held = { edge: st.edge.clone(), nrm: st.nrm.clone() };
      if (!st) plant[0] = plant[1] = move[0] = move[1] = null;
      // subindo: as mãos continuam na quina até o corpo passar por cima; depois somem para baixo
      const pushing = st?.kind === 'climb' && st.k < (st.vault ? 0.5 : 0.7);
      const on = !!held && (st?.kind === 'hang' || pushing);
      out = on ? Math.max(0, out - dt * 8) : Math.min(1, out + dt * 4);
      if (!st && out >= 1) held = null;
      for (let i = 0; i < 2; i++) {
        const h = grip[i];
        h.group.visible = !!held && out < 1;
        if (!h.group.visible) continue;
        // o lugar dela: ao longo da quina, uma de cada lado (a tangente da parede)
        const n = held.nrm;
        _t.set(-n.z, 0, n.x).multiplyScalar(i ? 0.21 : -0.21);
        _ideal.copy(held.edge).add(_t).addScaledVector(n, -0.05);
        _ideal.y += 0.012;
        // presa onde estava; quando fica longe do lugar dela (andando de lado), troca —
        // uma de cada vez
        if (!plant[i]) plant[i] = _ideal.clone();
        if (!move[i] && !move[1 - i] && plant[i].distanceTo(_ideal) > STEP && st?.kind === 'hang') move[i] = { from: plant[i].clone(), t: 0 };
        if (move[i]) {
          move[i].t += dt / SWAP;
          const k = Math.min(1, move[i].t);
          _now.lerpVectors(move[i].from, _ideal, k * k * (3 - 2 * k));
          _now.y += Math.sin(k * Math.PI) * 0.07; // solta e sobe um pouco
          if (k >= 1) {
            plant[i].copy(_ideal);
            move[i] = null;
          }
        } else _now.copy(plant[i]);
        _w.copy(_now);
        _w.y -= out * 0.35;
        camera.worldToLocal(_w);
        h.group.position.copy(_w);
        // a palma em cima da quina, os dedos apontando para dentro do topo (−n)
        _m.lookAt(new THREE.Vector3(), _t.set(-n.x, 0, -n.z), new THREE.Vector3(0, 1, 0)); // +z do modelo = n: os dedos (−z) para dentro
        _q.setFromRotationMatrix(_m);
        camera.getWorldQuaternion(_qc);
        h.group.quaternion.copy(_qc.invert().multiply(_q));
        h.pose(move[i] ? 0.15 : st?.kind === 'climb' ? 0.35 : 0.6, 0.5); // trocando de lugar ou empurrando, a mão abre
      }
    },
  };
}
