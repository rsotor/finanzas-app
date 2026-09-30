(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.dca = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Despliegue escalonado del capital parado: ni de golpe ni diluido en años.
  // Convención del proyecto: orden de 6-12 meses (spec padre §12).
  function planDca(capital, meses) {
    meses = meses == null ? 9 : meses;
    if (!(capital > 0)) return { error: 'capital debe ser > 0', meses, calendario: [] };
    if (!(meses >= 1)) return { error: 'meses debe ser >= 1', meses, calendario: [] };
    const importeMensual = Math.floor(capital / meses);
    const calendario = [];
    let acumulado = 0;
    for (let m = 1; m <= meses; m++) {
      const importe = m === meses ? capital - acumulado : importeMensual;
      acumulado += importe;
      calendario.push({ mes: m, importe, acumulado });
    }
    return { meses, importeMensual, total: capital, calendario, fueraDeRango: meses < 6 || meses > 12 };
  }

  return { planDca };
});
