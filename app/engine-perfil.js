(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.perfil = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const META_COLCHON_DEFAULT = 10000;

  // Factor que recorta el tope de RV para objetivos críticos con fecha fija
  // (margen de seguridad ante secuencia de retornos). Regla de diseño, ajustable.
  const FACTOR_CRITICO = 0.7;

  // Tabla base de tope de RV por horizonte (convención de inversión: a más plazo, más RV tolerable).
  const TRAMOS_RV = [
    { maxAnios: 3,        tope: 20 },   // < 3 años
    { maxAnios: 7,        tope: 50 },   // 3–7 años
    { maxAnios: 15,       tope: 85 },   // 7–15 años
    { maxAnios: Infinity, tope: 100 },  // > 15 años
  ];

  function gateColchon(liquidezDisponible, meta) {
    meta = meta == null ? META_COLCHON_DEFAULT : meta;
    const faltan = Math.max(0, meta - liquidezDisponible);
    return { cubierto: liquidezDisponible >= meta, faltan, meta };
  }

  function topeRV(horizonteAnios, criticidad) {
    // Primer tramo cuyo límite supera el horizonte (estricto: 3→50, 7→85, 15→100).
    const tramo = TRAMOS_RV.find(t => horizonteAnios < t.maxAnios) || TRAMOS_RV[TRAMOS_RV.length - 1];
    let tope = tramo.tope;
    if (criticidad === 'critico') tope = Math.ceil(tope * FACTOR_CRITICO);
    return tope;
  }

  return { META_COLCHON_DEFAULT, FACTOR_CRITICO, TRAMOS_RV, gateColchon, topeRV };
});
