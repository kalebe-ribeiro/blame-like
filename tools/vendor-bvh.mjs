// Gera src/lib/three-mesh-bvh.js: a three-mesh-bvh com o `import 'three'` trocado pela ponte
// do three.js dos workers (src/lib/three.js) — os workers não enxergam o import map do
// index.html. Rodar de novo depois de atualizar a three-mesh-bvh: `npm run vendor`.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../node_modules/three-mesh-bvh/build/index.module.js', import.meta.url), 'utf8');
const n = (src.match(/from 'three';/g) ?? []).length;
if (n !== 1) throw new Error(`esperava 1 import de 'three', achei ${n}`);
const head = `// GERADO por tools/vendor-bvh.mjs — não editar. A three-mesh-bvh para os workers de geração.\n`;
writeFileSync(new URL('../src/lib/three-mesh-bvh.js', import.meta.url), head + src.replace("from 'three';", "from './three.js';"));
console.log('src/lib/three-mesh-bvh.js gerado');
