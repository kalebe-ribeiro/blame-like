// ─────────────────────────────────────────────────────────────────────────────
//  "FilmPass" — pós-processamento final, depois do bloom e do tone mapping.
//  Só o que uma câmera analógica velha faria: dessaturação, grão, vinheta e
//  uma respiração lentíssima de exposição. Nada de falha digital.
//  Também o desmaio (app/wake.js): bordas fechando (uFaint), o foco se
//  perdendo (uBlur) e o escuro (uBlack) — zerados, não custam nada.
// ─────────────────────────────────────────────────────────────────────────────

export const SignalShader = {
  name: 'FilmShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: null },
    uSaturation: { value: 0.38 },
    uGrain: { value: 0.03 },
    uFaint: { value: 0 }, // 0..1: a vinheta fecha até sobrar só o centro
    uBlur: { value: 0 }, // 0..1: o foco se perde
    uBlack: { value: 0 }, // 0..1: escuro
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
    uniform float uFaint;
    uniform float uBlur;
    uniform float uBlack;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // desmaio: o foco se perde (disco de amostras, com um leve duplo da visão)
      if (uBlur > 0.001) {
        vec3 acc = col;
        float r = uBlur * 0.018;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996;
          float d = sqrt((float(i) + 0.5) / 12.0);
          // (nível 0 explícito: amostrar com derivada implícita dentro de um laço faz o
          //  compilador do Windows/ANGLE avisar — X3595 — e o teste reprova)
          acc += textureLod(tDiffuse, vUv + vec2(cos(a), sin(a)) * d * r * vec2(uRes.y / uRes.x, 1.0), 0.0).rgb;
        }
        acc += textureLod(tDiffuse, vUv + vec2(uBlur * 0.012, 0.0), 0.0).rgb * 2.0;
        col = acc / 15.0;
      }

      // dessatura: a cor quase não sobrevive à poeira
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSaturation);

      // grão de filme
      col += (hash12(gl_FragCoord.xy + fract(uTime * 13.0) * 500.0) - 0.5) * uGrain;

      // vinheta + respiração lenta de exposição
      vec2 c = vUv - 0.5;
      col *= smoothstep(1.05, 0.2, length(c) * 1.3);
      col *= 0.97 + 0.03 * sin(uTime * 0.35);
      // desmaio: as bordas fecham até o escuro
      if (uFaint > 0.001) col *= 1.0 - smoothstep(0.62 - uFaint * 0.62, 0.95 - uFaint * 0.7, length(c * vec2(1.25, 1.0)));
      col *= 1.0 - uBlack;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

