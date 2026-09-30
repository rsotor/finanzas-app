(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.supuestos = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Rentabilidad esperada nominal anual prudente por clase de activo (%).
  //
  // Fuente principal: Vanguard Capital Markets Model® (VCMM) Q1 2026
  //   URL: https://www.vanguardmexico.com/en/home/insights/economic-market-outlook/vanguard-capital-markets-model-forecasts-2026
  //   Consultado: 2026-06-16. Horizonte: 10 años. Retornos nominales en USD (pre-inflación, pre-impuestos).
  //   Metodología: mediana de 10.000 simulaciones VCMM, expresada como rango de distribución.
  //
  // Referencia cruzada: J.P. Morgan 2026 Long-Term Capital Market Assumptions (LTCMA)
  //   URL: https://am.jpmorgan.com/us/en/asset-management/adv/about-us/media/press-releases/jp-morgan-releases-2026-long-term-capital-market-assumptions/
  //   Horizonte: 10–15 años nominales en USD.
  //
  // Criterio de selección de valores:
  //   - Se toma el punto medio del rango publicado por Vanguard (ej. 5.4%–7.4% → 6.4%).
  //   - Se comprueba coherencia con JPMorgan LTCMA 2026.
  //   - El objetivo es ser PRUDENTE: los supuestos son para planificación, no para ventas.
  //
  // Tabla de correspondencia con fuente Vanguard VCMM Q1 2026:
  //   rv-global      → "Global ex-U.S. equities (unhedged)": 5.0%–7.0% → mid 6.0%
  //                    Referencia JPM: "Global equities (USD)": 7.0% — coherente
  //   rv-desarrollada → "Developed markets ex-U.S. (unhedged)": 5.4%–7.4% → mid 6.4%
  //   rv-emergente   → "Emerging markets (unhedged)": 3.6%–5.6% → mid 4.6%
  //                    Nota: Vanguard es más conservador que JPM (7.8%); usamos Vanguard por prudencia
  //   rf-agregada    → "U.S. aggregate bonds": 4.2%–5.2% → mid 4.7%
  //                    Referencia JPM: "U.S. intermediate Treasuries": 4.0% — coherente
  //   monetario      → "U.S. cash": 2.9%–3.9% → mid 3.4%
  //
  const SOURCE = 'Vanguard Capital Markets Model (VCMM) Q1 2026 — https://www.vanguardmexico.com/en/home/insights/economic-market-outlook/vanguard-capital-markets-model-forecasts-2026 — consultado 2026-06-16';

  const EXPECTED_RETURNS = {
    'rv-global':      6.0,  // Global ex-U.S. equities unhedged, mid del rango 5.0%–7.0%
    'rv-desarrollada': 6.4, // Developed markets ex-U.S. unhedged, mid del rango 5.4%–7.4%
    'rv-emergente':   4.6,  // Emerging markets unhedged, mid del rango 3.6%–5.6%
    'rf-agregada':    4.7,  // U.S. aggregate bonds, mid del rango 4.2%–5.2%
    'monetario':      3.4,  // U.S. cash, mid del rango 2.9%–3.9%
  };

  function expectedReturn(assetClass) {
    return Object.prototype.hasOwnProperty.call(EXPECTED_RETURNS, assetClass)
      ? EXPECTED_RETURNS[assetClass]
      : null;
  }

  // Mapeo de la granularidad de alloc del preset (equity/bond/cash/other)
  // a las clases con rentabilidad esperada declarada. 'other' (oro, alternativos)
  // se trata como monetario por prudencia (clase más conservadora con dato).
  const ALLOC_CLASE = { equity: 'rv-global', bond: 'rf-agregada', cash: 'monetario', other: 'monetario' };

  function carteraSupuestos(funds) {
    let rentNum = 0, pesoConDato = 0, pesoTotal = 0;
    (funds || []).forEach(f => {
      const w = f.weight || 0;
      pesoTotal += w;
      const a = f.alloc;
      if (!a) return;
      let rf = 0, base = 0;
      ['equity', 'bond', 'cash', 'other'].forEach(k => {
        const pct = (a[k] || 0) / 100;
        if (pct <= 0) return;
        const r = EXPECTED_RETURNS[ALLOC_CLASE[k]];
        if (r == null) return;
        rf += pct * r; base += pct;
      });
      if (base <= 0) return;
      rentNum += (rf / base) * w; // normaliza por si alloc no suma 100
      pesoConDato += w;
    });
    const rentBase = pesoConDato > 0 ? rentNum / pesoConDato : null;
    const cobertura = pesoTotal > 0 ? Math.round((pesoConDato / pesoTotal) * 100) : 0;
    return { rentBase, cobertura, faltaInfo: cobertura < 100, mapping: ALLOC_CLASE, source: SOURCE };
  }

  return { SOURCE, EXPECTED_RETURNS, expectedReturn, ALLOC_CLASE, carteraSupuestos };
});
