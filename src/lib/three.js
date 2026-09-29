// Ponte para o three.js que funciona também dentro de Web Workers
// (workers não enxergam o import map do index.html). Resolve para o MESMO
// arquivo que o import map usa, então existe uma única instância da biblioteca.
export * from '../../node_modules/three/build/three.module.js';
