(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const deps = isNode
    ? { div: require('./engine-diversificacion.js') }
    : { div: (root.SimEngine && root.SimEngine.diversificacion) };
  const api = factory(deps);
  if (isNode) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.global = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  const { div } = deps;

  function agregarGlobal(carteras) {
    const items = (carteras || []).filter(c => c && c.importe > 0);
    const totalImporte = items.reduce((s, c) => s + c.importe, 0);

    let costeNum = 0, costeDen = 0;
    items.forEach(c => { if (c.costeAnualPct != null) { costeNum += c.costeAnualPct * c.importe; costeDen += c.importe; } });
    const costeAnualPctPond = costeDen > 0 ? costeNum / costeDen : null;
    const costeAnualEur = costeAnualPctPond != null ? (costeAnualPctPond / 100) * costeDen : null;

    let scoreNum = 0, scoreDen = 0;
    items.forEach(c => { if (c.overall != null) { scoreNum += c.overall * c.importe; scoreDen += c.importe; } });
    const scorePond = scoreDen > 0 ? Math.round(scoreNum / scoreDen) : null;

    // Diversificación agregada: pool de fondos con weight escalado por cuota del bloque.
    const pool = [];
    items.forEach(c => {
      const share = totalImporte > 0 ? c.importe / totalImporte : 0;
      (c.funds || []).forEach(f => pool.push(Object.assign({}, f, { weight: (f.weight || 0) * share })));
    });
    const solapamiento = div ? div.solapamientoCartera(pool) : null;
    const correlacion = div ? div.correlacionCartera(pool) : null;

    return {
      totalImporte, costeAnualPctPond, costeAnualEur, scorePond,
      diversificacion: { solapamiento, correlacion, degradado: correlacion == null },
      bloques: items.map(c => ({
        id: c.id,
        label: c.label,
        importe: c.importe,
        peso: totalImporte > 0 ? Math.round((c.importe / totalImporte) * 100) : 0,
        composicion: (c.funds || []).map(f => ({ name: f.name || f.isin || f.id || null, weight: f.weight })),
      })),
    };
  }

  return { agregarGlobal };
});
