// ─────────────────────────────────────────────────────────────────────────────
//  Pedaços de GLSL compartilhados por todos os materiais.
//
//  NOISE_GLSL  → simplex 3D (Ashima/McEwan) + fbm + hashes
//  FOG_GLSL    → névoa volumétrica analítica:
//                  • névoa de altura exponencial (mais densa no abismo)
//                  • densidade modulada por ruído que deriva no tempo
//                  • in-scatter analítico de cada luz pontual (halos na névoa)
//
//  Todos os materiais chamam applyFog(cor, posiçãoMundo, k, fade) no fim do fragment
//  shader. Como a névoa é calculada por pixel a partir de cameraPosition, ela
//  funciona automaticamente também nas câmeras virtuais dos portais.
// ─────────────────────────────────────────────────────────────────────────────

export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// Simplex noise 3D → aprox. [-1, 1]
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Fractal Brownian motion (4 oitavas) — base da textura de "carne"
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

// fbm que para nas oitavas menores que um pixel (fp = pegada do pixel em
// unidades de p, ex.: length(fwidth(p))). Mais barato e sem serrilhado longe.
float fbmAA(vec3 p, float fp) {
  float a = 0.5, s = 0.0, f = 1.0;
  for (int i = 0; i < 4; i++) {
    float w = 1.0 - smoothstep(0.25, 0.5, fp * f);
    if (w <= 0.0) break;
    s += a * w * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// Uniforms de luz/névoa compartilhados (declarados uma única vez por shader).
export const SHARED_UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3  uLightPos[LIGHT_COUNT];
uniform vec3  uLightColor[LIGHT_COUNT];   // cor * intensidade
uniform vec3  uLightFog[LIGHT_COUNT];     // cor * intensidade * atenuação até a câmera (CPU)
uniform float uLightDown[LIGHT_COUNT];    // 1 = luminária: ilumina para baixo (o facho na névoa é um cone)
uniform vec3  uFlashPos;                  // a lanterna: a lente (cena)
uniform vec3  uFlashDir;                  //   para onde aponta
uniform vec3  uFlashColor;                //   cor · intensidade (0 = apagada)
uniform vec4  uRestoredId[8];             // setores religados: (i, faixa, k, 1 = ativo)
uniform vec4  uRestoredFront[8];          //   (subestação x, z em cena, frente da luz em m, y em cena)
uniform vec4  uOutageA[4];                // apagões: centro (cena) + frente da queda (m)
uniform vec4  uOutageB[4];                // frente do religamento (m), raio do setor
uniform vec4  uShotA;                     // o tiro do emissor (app/beamfx.js): uma luz-linha — início (cena), intensidade
uniform vec4  uShotB;                     //   fim (cena), a cor (0 branco quente … 1 violeta — a sobrecarga)

// Energia da rede (0..1) num ponto — mesma lógica de world/outages.js.
// j (0..1) desloca a frente um pouco, para as janelas não apagarem em bloco.
// ── setores de energia (a mesma conta de Field.sectorAt, gen/field.js) ──
uniform vec3 uOrigin;        // origem flutuante inteira: cena + uOrigin = GLOBAL
uniform int  uSectorSeed;    // seed do mundo
uint sectorHash(int a, int b, int c, int salt) {
  uint h = uint(uSectorSeed) ^ (uint(a) * 0x27d4eb2du);
  h ^= uint(b) * 0x165667b1u;
  h ^= uint(c) * 0x1b873593u;
  h ^= uint(salt) * 0x5bd1e995u;
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  h = (h ^ (h >> 16u)) * 0x9e3779b1u;
  h ^= h >> 15u;
  return h;
}
// 0 apagado · onda instável · 1 com energia (SECTOR em gen/field.js: 900 m, 30% / 15%)
float sectorPower(vec3 wp) {
  vec3 g = wp + uOrigin;
  const float C = 900.0;
  int band = int(floor((g.y - 1488.0) / 2880.0));
  int ci = int(floor(g.x / C));
  int ck = int(floor(g.z / C));
  float best = 1e30;
  int bi = ci;
  int bk = ck;
  for (int di = -1; di <= 1; di++) {
    for (int dk = -1; dk <= 1; dk++) {
      int i = ci + di;
      int k = ck + dk;
      uint h = sectorHash(i, band, k, 910);
      float px = (float(i) + float(h & 1023u) / 1024.0) * C;
      float pz = (float(k) + float((h >> 10u) & 1023u) / 1024.0) * C;
      float w = float((h >> 20u) & 1023u) / 1024.0 * C * 0.8;
      float d = (g.x - px) * (g.x - px) + (g.z - pz) * (g.z - pz) - w * w;
      if (d < best) { best = d; bi = i; bk = k; }
    }
  }
  float r = float(sectorHash(bi, band, bk, 911)) / 4294967296.0;
  // um só return (o compilador do Windows reclama de returns depois de laços)
  float res = 1.0;
  if (r < 0.3) {
    // apagado — a não ser que o jogador tenha religado (a luz volta como uma frente)
    res = 0.0;
    for (int j = 0; j < 8; j++) {
      vec4 id = uRestoredId[j];
      vec4 f = uRestoredFront[j];
      float match = step(0.5, id.w) * float(int(id.x) == bi && int(id.y) == band && int(id.z) == bk);
      float d = length(wp.xz - f.xy) + abs(wp.y - f.w) * 0.5;
      res = max(res, match * clamp((f.z - d) / 24.0, 0.0, 1.0));
    }
  } else if (r < 0.45) {
    float phase = float(sectorHash(bi, band, bk, 912)) / 4294967296.0;
    res = smoothstep(-0.3, 0.1, sin(uTime * 0.6 + phase * 6.2831 + (g.x + g.z) * 0.004));
  }
  return res;
}

float outagePower(vec3 wp, float j) {
  float p = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 a = uOutageA[i];
    if (a.w < 0.0) continue;
    vec4 b = uOutageB[i];
    float d = distance(wp, a.xyz) + j * 18.0;
    float dark = (1.0 - smoothstep(a.w - 6.0, a.w, d))
               * smoothstep(b.x - 6.0, b.x, d + j * 11.0)
               * (1.0 - smoothstep(b.y - 10.0, b.y + 8.0, d));
    p *= 1.0 - dark;
  }
  return p;
}
uniform float uFogDensity;      // densidade na altura uFogBase
uniform float uFogFalloff;      // quão rápido a névoa afina com a altura
uniform float uFogBase;
uniform float uScatter;         // força do espalhamento das luzes na névoa
uniform vec3  uOriginMod;       // origem flutuante: mantém os padrões contínuos
uniform vec3  uFogColorA;       // poeira cinza
uniform vec3  uFogColorB;       // poeira quente
uniform sampler2D uSilMask;     // silhuetas colossais: 1 = névoa livre, < 1 = sombra atrás
uniform vec2  uSilRes;          // tamanho da tela (px) para ler a máscara
uniform float uSilOn;
`;

export const FOG_GLSL = /* glsl */ `
// Profundidade óptica de uma névoa de altura exponencial, integrada
// analiticamente ao longo do raio ro + rd*s, s ∈ [0, t].
float fogOpticalDepth(vec3 ro, vec3 rd, float t) {
  float k = rd.y * uFogFalloff * t;
  float f = abs(k) < 1e-3 ? 1.0 - 0.5 * k : (1.0 - exp(-k)) / k;
  return uFogDensity * exp(-(ro.y - uFogBase) * uFogFalloff) * t * f;
}

// In-scatter de uma luz pontual num meio homogêneo: ∫ 1/|r(s)|² ds (forma fechada)
float airlight(vec3 ro, vec3 rd, float t, vec3 lp) {
  vec3 q = ro - lp;
  float b = dot(rd, q);
  float h = sqrt(max(dot(q, q) - b * b, 0.25));
  return (atan((t + b) / h) - atan(b / h)) / h;
}

// k multiplica a profundidade óptica: k < 1 deixa megaestruturas "furarem"
// a névoa (não-físico, de propósito: a escala precisa ser vista).
// fade (início, fim): perto do raio de carregamento dos chunks a superfície
// se dissolve por completo na névoa — assim nada "brota" no horizonte.
// ── a lanterna ─────────────────────────────────────────────────────────────
//  Um facho, não um brilho em volta do corpo. Perfil pelo ângulo a partir do
//  eixo (a ≈ √(2(1−cos)), em radianos):
//    miolo quente (~4°) · um anel escuro fino e o anel claro do refletor ·
//    o facho principal até ~17° · um véu fraco até ~34° · nada fora disso.
//  Manchas fixas na lente (o padrão gira com o aparelho, não com o mundo).
// o perfil sem as manchas (barato: é o que a poeira usa, várias vezes por pixel)
float flashShape(float c) {
  if (c < 0.82) return 0.0; // ~35°
  float a = sqrt(max(2.0 * (1.0 - c), 0.0));
  float core = exp(-pow(a / 0.07, 2.0));
  float ring = 0.22 * exp(-pow((a - 0.13) / 0.025, 2.0)) - 0.12 * exp(-pow((a - 0.095) / 0.018, 2.0));
  float main = 0.3 * (1.0 - smoothstep(0.22, 0.34, a));
  float veil = 0.06 * (1.0 - smoothstep(0.34, 0.62, a));
  return max(core + ring + main + veil, 0.0);
}

float flashProfile(vec3 dirToPoint) {
  float c = dot(dirToPoint, uFlashDir);
  if (c < 0.82) return 0.0;
  // manchas: ruído no plano da lente
  vec3 up = abs(uFlashDir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 ex = normalize(cross(up, uFlashDir));
  vec3 ey = cross(uFlashDir, ex);
  vec2 q = vec2(dot(dirToPoint, ex), dot(dirToPoint, ey)) / max(c, 0.5);
  float smudge = 0.88 + 0.12 * snoise(vec3(q * 9.0, 1.7)) + 0.05 * snoise(vec3(q * 31.0, 4.2));
  return flashShape(c) * smudge;
}

// O facho na poeira: poucas amostras ao longo do raio de visão (até ~26 m),
// deslocadas por pixel (o TAA suaviza). Espalhamento para a frente: quem olha
// ao longo do facho vê o cone de poeira acesa.
#define FLASH_DUST 0.003
vec3 flashScatter(vec3 ro, vec3 rd, float t) {
  if (uFlashColor.r + uFlashColor.g + uFlashColor.b < 1e-4) return vec3(0.0);
  float tm = min(t, 26.0);
  const int N = 10;
  float stepL = tm / float(N);
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uTime * 7.31);
  float acc = 0.0;
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (stepL * (float(i) + j));
    vec3 Lv = p - uFlashPos;
    float d2 = dot(Lv, Lv) + 0.25;
    vec3 L = Lv * inversesqrt(d2);
    float ph = 0.55 + 0.45 * dot(rd, L); // para a frente
    acc += flashShape(dot(L, uFlashDir)) * ph * exp(-uFogDensity * 2.0 * sqrt(d2)) / d2;
  }
  return uFlashColor * acc * stepL;
}

vec3 applyFog(vec3 col, vec3 wpos, float k, vec2 fade) {
  vec3 ro = cameraPosition;
  vec3 dv = wpos - ro;
  float t = length(dv);
  vec3 rd = dv / max(t, 1e-4);

  // Densidade "viva": duas camadas de ruído derivando lentamente
  vec3 mid = ro + rd * min(t, 90.0) * 0.5 + uOriginMod;
  float nA = snoise(mid * 0.018 + vec3(0.0, -uTime * 0.02, uTime * 0.013));
  float nB = snoise(mid * 0.07 + vec3(uTime * 0.05, 0.0, 0.0));
  float dm = max(0.6 + 0.45 * nA + 0.25 * nB, 0.15);

  float T = exp(-fogOpticalDepth(ro, rd, t) * dm * k);
  T *= 1.0 - smoothstep(fade.x, fade.y, t);

  // Cor da névoa: poeira cinza ↔ poeira quente; abaixo, mais escura e ocre
  vec3 fogCol = mix(uFogColorA, uFogColorB, clamp(0.4 + 0.6 * nA, 0.0, 1.0));
  fogCol = mix(fogCol, fogCol * vec3(0.75, 0.66, 0.55), smoothstep(0.0, -0.8, rd.y));
  // estruturas colossais além de tudo bloqueiam a luz da poeira: sombras na névoa.
  // Pesa pela quantidade de névoa (o que está perto quase não muda) — assim o
  // céu, a geometria já dissolvida e as silhuetas concordam, sem recortes.
  if (uSilOn > 0.5) {
    float sil = texture2D(uSilMask, gl_FragCoord.xy / uSilRes).r;
    fogCol *= mix(1.0, sil, (1.0 - T) * (1.0 - T));
  }

  // Luzes espalhadas na névoa (atenuadas pela distância até a fonte)
  vec3 scatter = vec3(0.0);
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec3 lf = uLightFog[i];
    if (lf.r + lf.g + lf.b < 1e-6) continue; // vaga vazia ou luz sumida na névoa
    float cone = 1.0;
    if (uLightDown[i] > 0.5) {
      // o facho para baixo: pela direção do ponto do raio mais perto da luz (forte embaixo da luminária,
      // quase nada em cima — a carcaça escura; o rework gráfico, frente 2)
      vec3 q = ro - uLightPos[i];
      vec3 c = q + rd * clamp(-dot(rd, q), 0.0, t);
      float down = -c.y / max(length(c), 1e-3);
      cone = 0.12 + 1.7 * smoothstep(0.05, 0.9, down);
    }
    scatter += lf * airlight(ro, rd, t, uLightPos[i]) * cone;
  }
  // o brilho em volta das luzes vem da poeira: sem névoa, sem halo
  scatter *= uScatter * dm * (uFogDensity / 0.0075);
  // o facho da lanterna na poeira (a mesma poeira)
  scatter += flashScatter(ro, rd, t) * FLASH_DUST * dm * (uFogDensity / 0.0075);

  return col * T + fogCol * (1.0 - T) + scatter;
}
`;
