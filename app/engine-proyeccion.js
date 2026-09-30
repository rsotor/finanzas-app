(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.proyeccion = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIGMA = 1;

  function rangoProyeccion(params, funds, sup, engine, groupCosts) {
    const gc = groupCosts || [];
    const run = (rent) => engine.simulate({ ...params, rent: Math.max(rent, -99.9) }, funds, gc, false);
    const base = sup.rentBase;
    const h = Math.max(1, params.horizon || 1);
    const banda = SIGMA * (sup.volAnual || 0) / Math.sqrt(h);
    return {
      pesimista: run(base - banda),
      base:      run(base),
      optimista: run(base + banda),
      supuestos: { rentBase: base, volAnual: sup.volAnual, sigma: SIGMA, horizonte: h, bandaAnual: banda },
    };
  }

  return { SIGMA, rangoProyeccion };
});
