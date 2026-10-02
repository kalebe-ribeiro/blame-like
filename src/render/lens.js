// ─────────────────────────────────────────────────────────────────────────────
//  A lente gravitacional do emissor (a arma de Killy — o cofre, Arma-do-Killy §7.3–7.4).
//
//  Um passe de tela DEPOIS do TAA (não entra no histórico — sem fantasmas) e antes do
//  bloom. Dois efeitos, ambos desligados (o passe nem roda) quando zerados:
//    ponto   carregando: o espaço é puxado para um ponto 2–3 m à frente da arma, na mira —
//            o que está em volta escorre para ele (amostra mais de fora: um anel comprimido)
//    linha   o disparo: por um instante, o espaço se dobra em volta do traço do feixe
//  Máscara de profundidade: nada a menos de 1,2 m do olho é distorcido (a mão e a arma
//  ficam limpas), e uma amostra que cairia nelas é descartada.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const LensShader = {
  name: 'LensShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uAspect: { value: 1 },
    uPoint: { value: new THREE.Vector3(0.5, 0.5, 0) }, // centro (uv), força (0..1)
    uRadius: { value: 0.18 }, // fração da altura da tela
    uLineA: { value: new THREE.Vector2() }, // o traço na tela (uv)
    uLineB: { value: new THREE.Vector2() },
    uLineK: { value: 0 }, // força da dobra em linha (0..1)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uNear;
    uniform float uFar;
    uniform float uAspect;
    uniform vec3 uPoint;
    uniform float uRadius;
    uniform vec2 uLineA;
    uniform vec2 uLineB;
    uniform float uLineK;
    varying vec2 vUv;
    float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float near(vec2 uv) { return 1.0 - smoothstep(1.2, 1.6, lin(textureLod(tDepth, uv, 0.0).x)); }
    void main() {
      vec3 base = textureLod(tDiffuse, vUv, 0.0).rgb;
      if (near(vUv) > 0.5) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 asp = vec2(uAspect, 1.0);
      vec2 off = vec2(0.0);
      // o ponto: amostra mais de fora (o que está em volta escorre para dentro)
      if (uPoint.z > 0.0) {
        vec2 d = (vUv - uPoint.xy) * asp;
        float r = length(d) / uRadius;
        float f = uPoint.z * exp(-r * r) * 0.45;
        off += (vUv - uPoint.xy) * f;
        // uma torção leve em volta do centro (a luz rodando para o ponto)
        vec2 perp = vec2(-d.y, d.x) / asp;
        off += perp * uPoint.z * exp(-r * r * 1.5) * 0.06;
      }
      // a linha: o espaço dobrado em volta do traço (amostra puxada para a linha)
      if (uLineK > 0.0) {
        vec2 ab = (uLineB - uLineA) * asp;
        vec2 ap = (vUv - uLineA) * asp;
        float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        vec2 q = ap - ab * t;
        float dl = length(q);
        float w = 0.035;
        off += (q / max(dl, 1e-5)) / asp * uLineK * 0.022 * exp(-dl * dl / (w * w)) * (dl / w);
      }
      vec2 uv = clamp(vUv + off, vec2(0.001), vec2(0.999));
      // (uma amostra que cairia na mão ou na arma: fica a original)
      vec3 c = near(uv) > 0.5 ? base : textureLod(tDiffuse, uv, 0.0).rgb;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

/** O passe (desligado até um efeito pedir). `depth` é a textura de profundidade da cena. */
export function createLensPass(depth) {
  const pass = new ShaderPass(LensShader);
  pass.uniforms.tDepth.value = depth;
  pass.enabled = false;
  return pass;
}
