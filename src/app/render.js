// ─────────────────────────────────────────────────────────────────────────────
//  Render: renderizador, pós-processamento, reflexo da água, redimensionamento
//  e o modo foto (F2).
//
//  Cadeia: [máscara das silhuetas + reflexo] → cena (SSAO + TAA + raios na
//  névoa, render/pipeline.js) → bloom → tone mapping → filme (grão, vinheta).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { bakeSurfaces } from '../render/surfaceBaker.js';
import { t } from '../i18n/index.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SignalShader } from '../shaders/post.js';
import { ScenePass } from '../render/pipeline.js';
import { ReflectionSystem } from '../render/reflection.js';
import { createLensPass } from '../render/lens.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = true;
  renderer.info.autoReset = false; // zerado manualmente a cada frame (o composer faz vários renders)
  return renderer;
}

/** Monta a cadeia de pós-processamento e o reflexo. Guarda tudo em ctx. */
export function setupRender(ctx) {
  const { renderer, scene, camera, shared, world } = ctx;
  const composer = new EffectComposer(renderer);
  // cena + oclusão de ambiente + antialiasing temporal (render/pipeline.js)
  const scenePass = new ScenePass(scene, camera, shared);
  composer.addPass(scenePass);
  // a lente gravitacional do emissor (render/lens.js — desligada até carregar/atirar)
  const lens = createLensPass(scenePass.sceneRT.depthTexture);
  composer.addPass(lens);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.6, 0.7));
  composer.addPass(new OutputPass());
  const signal = new ShaderPass(SignalShader);
  signal.uniforms.uRes.value = new THREE.Vector2();
  composer.addPass(signal);
  // reflexo planar nos setores inundados (render/reflection.js)
  const reflection = new ReflectionSystem(shared);
  reflection.attach(world.materials.flood);
  reflection.hidden.push(ctx.dust);
  Object.assign(ctx, { composer, scenePass, lens, signal, reflection });
  window.addEventListener('resize', () => resize(ctx));
  resize(ctx);
}

export function resize(ctx) {
  const { renderer, camera, composer, signal, dust, world, reflection, hud } = ctx;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio()); // os buffers internos acompanham a resolução
  composer.setSize(w, h);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  signal.uniforms.uRes.value.copy(db);
  dust.material.uniforms.uRes.value.copy(db);
  world.silhouettes.setSize(db.x, db.y);
  reflection.setSize(db.x, db.y);
  hud?.resize();
}

/** As texturas das superfícies pela seed do mundo (render/surfaceBaker.js): para todos os materiais
 *  (os uniforms compartilhados — ctx.shared). Os alvos são reaproveitados de um mundo para o outro. */
export function bakeWorldSurfaces(ctx) {
  const r = bakeSurfaces(ctx.renderer, ctx.seed, ctx._surf);
  ctx._surf = r;
  ctx.shared.uSurfA.value = r.a;
  ctx.shared.uSurfB.value = r.b;
  ctx.shared.uSurfOn.value = 1;
  if (new URLSearchParams(location.search).get('stats')) console.warn(`SURF: forno ${r.ms.toFixed(1)} ms`);
}

/** Um mundo novo: o reflexo passa a ler o material de água dele; as superfícies, a seed dele. */
export function onWorldBuilt(ctx) {
  bakeWorldSurfaces(ctx);
  ctx.scenePass.reset();
  ctx.reflection.materials = [];
  ctx.reflection.attach(ctx.world.materials.flood);
  resize(ctx);
}

/** Tudo que precisa estar pronto antes da cena: a máscara das silhuetas e o reflexo da água. */
export function renderViews(ctx) {
  ctx.world.silhouettes.renderMask(ctx.renderer, ctx.camera);
  ctx.reflection.render(ctx.renderer, ctx.scene, ctx.camera, ctx.world.origin);
}

export function renderFrame(ctx, dt) {
  renderViews(ctx);
  ctx.composer.render(dt);
}

/**
 * Modo foto (F2): renderiza em alta resolução (até 4K de largura), sem grão de
 * filme e sem a interface (o HUD é outro canvas), e salva em Imagens/CYBERCOSMIC
 * (o processo principal intercepta o "download").
 * @returns {boolean} se a foto foi tirada
 */
export function takePhoto(ctx) {
  const { renderer, signal, composer, canvas } = ctx;
  const prevRatio = renderer.getPixelRatio();
  const ratio = Math.max(prevRatio, Math.min(3, 3840 / window.innerWidth));
  const grain = signal.uniforms.uGrain.value;
  signal.uniforms.uGrain.value = 0;
  renderer.setPixelRatio(ratio);
  resize(ctx);
  // parado, vários quadros com tremor: o antialiasing temporal converge
  for (let i = 0; i < 16; i++) {
    renderViews(ctx);
    composer.render(0);
  }
  // lido na mesma tarefa do desenho: o buffer ainda não foi descartado
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = URL.createObjectURL(blob);
    a.download = `cybercosmic-${ctx.seed.toString(36)}-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    ctx.hud.push(t('hud.photo'));
  }, 'image/png');
  signal.uniforms.uGrain.value = grain;
  renderer.setPixelRatio(prevRatio);
  resize(ctx);
  return true;
}
