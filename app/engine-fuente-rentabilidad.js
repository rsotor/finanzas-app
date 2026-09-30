(function (root, factory) {
  const esNode = (typeof module !== 'undefined' && module.exports);
  const deps = esNode
    ? { sup: require('./engine-supuestos.js'), div: require('./engine-diversificacion.js') }
    : { get sup() { return (root.SimEngine || {}).supuestos; },
        get div() { return (root.SimEngine || {}).diversificacion; } };
  const api = factory(deps);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.fuenteRentabilidad = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  const pctAnual = c => c.unit === 'pct' && c.type === 'annual';
  const fmt = x => x.toFixed(2).replace('.', ',');

  // null si el preset no trae NINGÚN dato de costes (ni groupCosts pct anual ni costs en ningún fondo):
  // sumar 0 en ese caso sería inventar un coste cero, no "no hay dato".
  function costeAnualPct(preset) {
    if (!preset) return null;
    const gg = (preset.groupCosts || []).filter(pctAnual);
    const fondosConCoste = (preset.funds || []).some(fd => (fd.costs || []).some(pctAnual));
    if (!gg.length && !fondosConCoste) return null;
    const g = gg.reduce((s, c) => s + c.value, 0);
    const f = (preset.funds || []).reduce((s, fd) =>
      s + (fd.weight / 100) * (fd.costs || []).filter(pctAnual).reduce((t, c) => t + c.value, 0), 0);
    return g + f;
  }

  function historica(preset) {
    const hr = preset && preset.historicalReturns;
    if (!hr) return null;
    const k = Object.keys(hr).find(x => /^annualized_since_/.test(x));
    if (k && typeof hr[k] === 'number') {
      return { valor: hr[k], periodo: 'desde ' + k.replace('annualized_since_', '').replace('_', '-'), fuente: hr.source || null };
    }
    const anios = Object.keys(hr.annual || {}).filter(x => /^\d{4}$/.test(x)).sort();
    if (anios.length < 2) return null;
    const prod = anios.reduce((p, a) => p * (1 + hr.annual[a] / 100), 1);
    return { valor: (Math.pow(prod, 1 / anios.length) - 1) * 100, periodo: anios[0] + '-' + anios[anios.length - 1], fuente: hr.source || null };
  }

  function volatilidad(preset) {
    const annual = preset && preset.historicalReturns && preset.historicalReturns.annual;
    return annual ? deps.div.volAnualDesdeRetornos(annual) : null;
  }

  function resolver(cartera, preset) {
    const modo = (cartera && cartera.rentabilidad_fuente) || 'forward_neta';
    const out = { rentabilidad: null, volatilidad: volatilidad(preset), fuente: modo, detalle: '', faltaInfo: false, motivos: [], rentBruta: null, coste: null };
    const ref = preset ? ` (preset ${preset.name || ''}, datos a ${preset.dataAsOf || '?'})` : '';
    if (modo === 'forzada') {
      if (typeof cartera.rentabilidad_forzada !== 'number') out.motivos.push('rentabilidad forzada sin valor');
      if (!cartera.nota_origen) out.motivos.push('rentabilidad forzada sin nota de origen');
      out.rentabilidad = typeof cartera.rentabilidad_forzada === 'number' ? cartera.rentabilidad_forzada : null;
      out.detalle = `⚠ forzada: ${cartera.nota_origen || 'sin nota'}`;
    } else if (modo === 'historica') {
      const h = historica(preset);
      if (!h) out.motivos.push('el preset no trae rentabilidad histórica');
      else {
        out.rentabilidad = h.valor;
        out.detalle = `histórica ${h.periodo}${ref}` + (h.fuente ? ` · fuente: ${h.fuente}` : '');
      }
    } else {
      if (!preset || !preset.funds || !preset.funds.length) out.motivos.push('sin preset con composición');
      else {
        const s = deps.sup.carteraSupuestos(preset.funds);
        const coste = costeAnualPct(preset);
        if (s.faltaInfo || typeof s.rentBase !== 'number') out.motivos.push('composición sin clase de activo cubierta');
        else if (coste === null) out.motivos.push('preset sin datos de costes');
        else {
          out.rentabilidad = s.rentBase - coste;
          out.rentBruta = s.rentBase;
          out.coste = coste;
          out.detalle = `${fmt(s.rentBase)} % bruta por composición (Vanguard VCMM / JPM LTCMA) − ${fmt(coste)} % costes${ref}`;
        }
      }
    }
    out.faltaInfo = out.motivos.length > 0 || out.rentabilidad === null;
    return out;
  }

  return { costeAnualPct, historica, volatilidad, resolver };
});
