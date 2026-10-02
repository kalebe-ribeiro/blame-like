// Materiais que não colidem (cabos, feixes de luz, panos, pichações, cascatas, água) —
// lido pela subida dos chunks (world/chunks.js) e pelo worker que monta a colisão deles.
export const NO_COLLIDE = new Set(['cable', 'beam', 'cloth', 'graffiti', 'cascade', 'flood']);
