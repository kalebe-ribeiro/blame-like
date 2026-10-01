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
export function createHands(ctx, { device, flashlight }) {
  const { camera, controls, world } = ctx;
  const glove = world.materials.cloth; // luvas de tecido grosso, gastas
  // a direita segura o aparelho por baixo, de palma para cima (os dedos para a frente,
  // dobrando um pouco para cima na ponta; o polegar ao lado da tela)
  const right = buildHand(glove, -1); // (de palma para cima, o lado se inverte)
  right.group.position.set(0.006, -0.034, 0.05);
  right.group.rotation.set(0, 0, Math.PI);
  right.pose(0.32, 0.7);
  device.add(right.group);
  // a esquerda fecha em volta do tubo da lanterna: a palma do lado do tubo, os dedos por cima dele
  const left = buildHand(glove, -1);
  left.group.position.set(-0.034, -0.03, 0.03);
  left.group.quaternion
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  left.pose(1.05, 1);
  flashlight.add(left.group);
  // as que agarram (filhas da câmera; no lugar certo do mundo a cada quadro)
  const grip = [buildHand(glove, -1, { arm: true }), buildHand(glove, 1, { arm: true })];
  // os braços: do punho até o ombro (abaixo e ao lado dos olhos), esticando conforme a mão vai
  const armGeo = new THREE.CylinderGeometry(0.036, 0.042, 1, 8);
  armGeo.translate(0, 0.5, 0); // a base no punho, crescendo para +y (até o ombro)
  const arms = grip.map(() => {
    const m = new THREE.Mesh(armGeo, glove);
    m.visible = false;
    camera.add(m);
    return m;
  });
  const SHOULDER = [new THREE.Vector3(-0.2, -0.42, 0.08), new THREE.Vector3(0.2, -0.42, 0.08)];
  const _wr = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
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

  return {
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
        arms[i].visible = h.group.visible;
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
        // o braço: do punho (atrás da palma, no espaço da câmera) até o ombro
        h.group.updateMatrix();
        _wr.set(0, 0, 0.09).applyMatrix4(h.group.matrix);
        _dir.copy(SHOULDER[i]).sub(_wr);
        const len = _dir.length();
        arms[i].position.copy(_wr);
        arms[i].quaternion.setFromUnitVectors(_up, _dir.divideScalar(len || 1));
        arms[i].scale.set(1, len, 1);
      }
    },
  };
}
