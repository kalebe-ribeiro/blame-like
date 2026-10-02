// Gera as cópias das bibliotecas para os workers de geração (os workers não enxergam o import
// map do index.html): a three-mesh-bvh e a three-bvh-csg, com os imports apontando para as
// pontes locais (src/lib/three.js, src/lib/three-mesh-bvh.js). Rodar de novo depois de
// atualizar qualquer uma: `npm run vendor`.
import { readFileSync, writeFileSync } from 'node:fs';

function vendor(pkg, out, swaps) {
  let src = readFileSync(new URL(`../node_modules/${pkg}/build/index.module.js`, import.meta.url), 'utf8');
  for (const [from, to] of swaps) {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error(`${pkg}: esperava 1 "${from}", achei ${n}`);
    src = src.replace(from, to);
  }
  const head = `// GERADO por tools/vendor-bvh.mjs — não editar. ${pkg} para os workers de geração.\n`;
  writeFileSync(new URL(`../src/lib/${out}`, import.meta.url), head + src);
  console.log(`src/lib/${out} gerado`);
}

vendor('three-mesh-bvh', 'three-mesh-bvh.js', [["from 'three';", "from './three.js';"]]);
vendor('three-bvh-csg', 'three-bvh-csg.js', [["from 'three';", "from './three.js';"], ["from 'three-mesh-bvh';", "from './three-mesh-bvh.js';"]]);
