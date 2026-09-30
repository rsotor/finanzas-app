(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.comparador = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function patrimonioNeto(opcion, params, anios, engine) {
    const funds = [{ id: 'x', weight: 100, costs: [
      { id: 'c', name: 'coste', type: 'annual', unit: 'pct', value: opcion.costeAnualPct },
    ] }];
    const r = engine.simulate({ ...params, horizon: anios }, funds, [], false);
    const peaje = r.patrimonioFinal * (opcion.peajePct || 0) / 100;
    return r.patrimonioFinal - peaje;
  }

  function breakEvenFondoVsEtf(opcionA, opcionB, params, engine) {
    const horizonte = Math.max(1, params.horizon || 1);
    let anioCruce = null, ganadorPrev = null;
    let netoA = 0, netoB = 0;
    for (let y = 1; y <= horizonte; y++) {
      netoA = patrimonioNeto(opcionA, params, y, engine);
      netoB = patrimonioNeto(opcionB, params, y, engine);
      const ganador = netoA === netoB ? null : (netoA > netoB ? opcionA.nombre : opcionB.nombre);
      if (ganador && ganadorPrev && ganador !== ganadorPrev && anioCruce === null) anioCruce = y;
      if (ganador) ganadorPrev = ganador;
    }
    return {
      anioCruce,
      ganadorFinal: netoA === netoB ? null : (netoA > netoB ? opcionA.nombre : opcionB.nombre),
      netoFinalA: netoA,
      netoFinalB: netoB,
    };
  }

  return { patrimonioNeto, breakEvenFondoVsEtf };
});
