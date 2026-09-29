// ─────────────────────────────────────────────────────────────────────────────
//  "FilmPass" — pós-processamento final, depois do bloom e do tone mapping.
//  Só o que uma câmera analógica velha faria: dessaturação, grão, vinheta e
//  uma respiração lentíssima de exposição. Nada de falha digital.
// ─────────────────────────────────────────────────────────────────────────────

export const SignalShader = {
  name: 'FilmShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: null },
    uSaturation: { value: 0.38 },
    uGrain: { value: 0.03 },
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
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uSaturation;
    uniform float uGrain;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // dessatura: a cor quase não sobrevive à poeira
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSaturation);

      // grão de filme
      col += (hash12(gl_FragCoord.xy + fract(uTime * 13.0) * 500.0) - 0.5) * uGrain;

      // vinheta + respiração lenta de exposição
      vec2 c = vUv - 0.5;
      col *= smoothstep(1.05, 0.2, length(c) * 1.3);
      col *= 0.97 + 0.03 * sin(uTime * 0.35);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

