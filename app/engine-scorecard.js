(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const deps = isNode
    ? { core: require('./simulador-engine.js') }
    : { core: (root.SimEngine) };
  const api = factory(deps);
  if (isNode) module.exports = api;
  if (typeof window !== 'undefined') {
    window.SimEngine = window.SimEngine || {};
    window.SimEngine.computeCarteraScore = api.computeCarteraScore;
    window.SimEngine.costeTotalAnual = api.costeTotalAnual;
    window.SimEngine.DEFAULT_WEIGHTS = api.DEFAULT_WEIGHTS;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  const { core } = deps;

  // ─────────────────────────────────────────────
  // Pesos de los 6 ejes del score v1
  // Coste(30) + Fiscal(20) + Estructura(15) + Diversificacion(15) + Tamano(10) + Encaje(10) = 100
  // ─────────────────────────────────────────────
  const DEFAULT_WEIGHTS = {
    coste:        30,
    eficienciaFiscal: 20,
    estructura:   15,
    diversificacion: 15,
    tamano:       10,
    encaje:       10,
  };

  // ─────────────────────────────────────────────
  // costeTotalAnual: TER ponderado + comisiones de grupo, ambos anuales en %
  // Siempre disponible cuando hay funds con costs.
  // ─────────────────────────────────────────────
  function costeTotalAnual(funds, groupCosts) {
    const tw = funds.reduce((s, f) => s + (f.weight || 0), 0) || 100;
    let wCost = 0;
    funds.forEach(f => {
      const w = (f.weight || 0) / tw;
      const c = (f.costs || [])
        .filter(x => x.type === 'annual' && x.unit === 'pct')
        .reduce((s, x) => s + x.value, 0);
      wCost += c * w;
    });
    const g = (groupCosts || [])
      .filter(x => x.type === 'annual' && x.unit === 'pct')
      .reduce((s, x) => s + x.value, 0);
    return wCost + g;
  }

  // ─────────────────────────────────────────────
  // EJE 1 — COSTE (30%) — siempre disponible
  // Interpolación: 0,1% → 100; 0,5% → 80; 1,0% → 50; 2,0% → 0
  // Fondos indexados baratos (~0,07-0,20%) deben sacar >85.
  // ─────────────────────────────────────────────
  function ejeCoste(funds, groupCosts, weight) {
    const wCost = costeTotalAnual(funds, groupCosts);
    const score = Math.round(core._scoreInterp(wCost, [[0.1, 100], [0.5, 80], [1.0, 50], [2.0, 0]]));
    return { key: 'coste', label: 'Coste', value: wCost.toFixed(2) + '%', score, available: true, weight };
  }

  // ─────────────────────────────────────────────
  // EJE 2 — EFICIENCIA FISCAL (20%) — siempre disponible
  // Fondo traspasable (todo lo que NO sea ETF) = 95 — diferimiento total del IRPF al traspasar.
  // ETF = 40 — en España un ETF no acoge el régimen de traspaso sin tributar (art. 94 LIRPF).
  // Detecta ETF por campo vehiculo:"etf" en el preset.
  // ─────────────────────────────────────────────
  function ejeEficienciaFiscal(preset, weight) {
    const esEtf = preset.vehiculo === 'etf' ||
      (preset.funds || []).some(f => f.vehiculo === 'etf');
    const score = esEtf ? 40 : 95;
    const label = esEtf ? 'ETF (sin traspaso fiscal)' : 'Fondo traspasable';
    return { key: 'eficienciaFiscal', label: 'Eficiencia fiscal', value: label, score, available: true, weight };
  }

  // ─────────────────────────────────────────────
  // EJE 3 — ESTRUCTURA (15%) — siempre disponible si hay ≥1 fondo con structure
  // passive-index=100, mixto/activo-defensivo=60, active-fof/active-advised=30, activo=30.
  // Pondera por weight de cada fondo.
  // ─────────────────────────────────────────────
  const STRUCTURE_SCORES = {
    'passive-index':   100,
    'active-defensive': 60,
    'active-fof':       30,
    'active-advised':   30,
    'active':           30,
  };

  function ejeEstructura(funds, weight) {
    const withStruct = funds.filter(f => f.structure);
    if (withStruct.length === 0) {
      return { key: 'estructura', label: 'Estructura', value: 'N/D', score: null, available: false, weight };
    }
    const tw = withStruct.reduce((s, f) => s + (f.weight || 0), 0) || 100;
    const score = Math.round(
      withStruct.reduce((s, f) => {
        const pts = STRUCTURE_SCORES[f.structure] != null ? STRUCTURE_SCORES[f.structure] : 50;
        return s + pts * ((f.weight || 0) / tw);
      }, 0)
    );
    // Etiqueta descriptiva: qué es la mezcla
    const allPassive = withStruct.every(f => f.structure === 'passive-index');
    const allActive  = withStruct.every(f => ['active-fof', 'active-advised', 'active'].includes(f.structure));
    const label = allPassive ? 'Indexada' : allActive ? 'Gestión activa' : 'Mixta';
    return { key: 'estructura', label: 'Estructura', value: label, score, available: true, weight };
  }

  // ─────────────────────────────────────────────
  // EJE 4 — DIVERSIFICACIÓN POR EXPOSICIÓN (15%) — siempre disponible
  // Mide AMPLITUD de exposición geográfica/clases, NO correlación de precios.
  // Regla (documentada):
  //   ACWI / Global+Emergentes (≥4 regiones o "Global Emergente" presente) → 95
  //   Global Desarrollado solo (MSCI World, etc.)                           → 75
  //   Multi-activo / mixto  (RV+RF o varias clases)                         → 70
  //   Un solo país o sector concentrado                                      → 35
  // Para carteras con composition[] se cuentan tipos/regiones distintas.
  // Para fondos sueltos se usa categoryMorningstar o geographic_zone.
  // ─────────────────────────────────────────────
  function ejeDiversificacion(preset, weight) {
    const funds = preset.funds || [];
    const comp   = preset.composition || [];

    // --- Ruta 1: cartera con composición explícita (Metal, etc.) ---
    if (comp.length > 0) {
      const tipos = new Set(comp.map(c => (c.type || '').toUpperCase()));
      const activos = new Set(comp.map(c => (c.asset || '')));
      // Emergentes = cualquier asset que contenga "emergente" o "emerging"
      const tieneEM = [...activos].some(a => /emergente|emerging/i.test(a));
      // Regiones distintas: un asset = una región si no es categoría genérica
      const regiones = activos.size;

      let score;
      if (tieneEM && regiones >= 4) {
        score = 95; // ACWI o equivalente (World + EM + más)
      } else if (regiones >= 4) {
        score = 80; // Multi-región sin EM explícito
      } else if (tipos.size >= 2) {
        score = 70; // Multi-activo
      } else if (regiones >= 2) {
        score = 65; // Varias regiones pero sin EM
      } else {
        score = 35; // Concentrado
      }
      return { key: 'diversificacion', label: 'Diversificación', value: regiones + ' regiones/clases', score, available: true, weight };
    }

    // --- Ruta 2: fondos sueltos sin composition — usar categoría ---
    // Se pondera por weight de cada fondo. Si ninguno tiene categoría → N/D.
    const withCat = funds.filter(f => f.categoryMorningstar || f.geographic_zone || f.category);
    if (withCat.length === 0) {
      return { key: 'diversificacion', label: 'Diversificación', value: 'N/D', score: null, available: false, weight };
    }
    const tw = withCat.reduce((s, f) => s + (f.weight || 0), 0) || 100;
    let wScore = 0;
    withCat.forEach(f => {
      const cat = (f.categoryMorningstar || f.geographic_zone || '').toLowerCase();
      const isEM = /emergente|emergent|em\b/.test(cat);
      const isGlobal = /global|acwi|world/.test(cat);
      const isMixto = /mixto|mixed|multi/.test(cat) || f.category === 'mixto' || f.category === 'mixto-defensivo';
      let pts;
      if (isGlobal && isEM) pts = 95;      // ACWI (Global + Emergentes)
      else if (isGlobal)    pts = 75;      // MSCI World u otro global desarrollado
      else if (isMixto)     pts = 70;      // Multi-activo / mixto
      else                  pts = 35;      // País único o sector
      wScore += pts * ((f.weight || 0) / tw);
    });
    const score = Math.round(wScore);

    // Combinación de fondos: si hay global desarrollado + emergentes → conjunto ACWI = 95
    // (superior a la suma ponderada de los dos por separado, porque la combinación es ACWI)
    const hasEM     = withCat.some(f => /emergente|emergent|em\b/.test((f.categoryMorningstar || f.geographic_zone || '').toLowerCase()));
    const hasGlobal = withCat.some(f => /global|acwi|world/.test((f.categoryMorningstar || f.geographic_zone || '').toLowerCase()));
    const finalScore = (hasGlobal && hasEM) ? 95 : score;
    const label = (hasGlobal && hasEM) ? 'Global + Emergentes (ACWI)' : hasGlobal ? 'Global desarrollado' : 'Concentrada';
    return { key: 'diversificacion', label: 'Diversificación', value: label, score: finalScore, available: true, weight };
  }

  // ─────────────────────────────────────────────
  // EJE 5 — TAMAÑO / SOLIDEZ (10%) — OPCIONAL
  // AUM del fondo (liquidez, estabilidad del proveedor).
  // Interpolación: 50M → 40; 500M → 70; 5B → 90; 20B → 100.
  // Si NO hay campo aum en ningún fondo → N/D y el peso se renormaliza.
  // ─────────────────────────────────────────────
  function ejeTamano(funds, groupCosts, weight) {
    // AUM puede estar: en cada fondo (f.aum), o como dato de grupo (no implementado aún).
    const withAum = funds.filter(f => f.aum != null && f.aum > 0);
    if (withAum.length === 0) {
      return { key: 'tamano', label: 'Tamaño (AUM)', value: 'N/D', score: null, available: false, weight };
    }
    const tw = withAum.reduce((s, f) => s + (f.weight || 0), 0) || 100;
    const wAum = withAum.reduce((s, f) => s + (f.aum || 0) * ((f.weight || 0) / tw), 0);
    // Interpolación sobre AUM ponderado (en euros, puntos de rotura en millones)
    const score = Math.round(core._scoreInterp(wAum, [
      [50e6,   40],   // 50M €  → 40
      [500e6,  70],   // 500M € → 70
      [5e9,    90],   // 5B €   → 90
      [20e9,  100],   // 20B €  → 100
    ]));
    const aumFmt = wAum >= 1e9
      ? (wAum / 1e9).toFixed(1) + ' B€'
      : (wAum / 1e6).toFixed(0) + ' M€';
    return { key: 'tamano', label: 'Tamaño (AUM)', value: aumFmt, score, available: true, weight };
  }

  // ─────────────────────────────────────────────
  // EJE 6 — ENCAJE CON OBJETIVO (10%) — OPCIONAL
  // Solo puntúa si se pasa un tope de RV (del perfil/bloque).
  // RV% calculada como la media ponderada de alloc.equity de los fondos.
  // RV ≤ tope → alto (interpolado); RV > tope → penalización proporcional.
  // En comparador y simulador no hay bloque → siempre N/D (renormaliza).
  // ─────────────────────────────────────────────
  function ejeEncaje(funds, rvTope, weight) {
    if (rvTope == null) {
      return { key: 'encaje', label: 'Encaje con objetivo', value: 'N/D', score: null, available: false, weight };
    }
    const withAlloc = funds.filter(f => f.alloc && f.alloc.equity != null);
    if (withAlloc.length === 0) {
      return { key: 'encaje', label: 'Encaje con objetivo', value: 'N/D', score: null, available: false, weight };
    }
    const tw = withAlloc.reduce((s, f) => s + (f.weight || 0), 0) || 100;
    const rvPct = withAlloc.reduce((s, f) => s + (f.alloc.equity || 0) * ((f.weight || 0) / tw), 0);
    // Si RV está dentro del tope: escala 60-100 (justo en tope → 100; muy por debajo → 60)
    // Si RV supera el tope: penaliza (por cada punto de exceso, -3 puntos, mín 10)
    let score;
    if (rvPct <= rvTope) {
      score = Math.round(core._scoreInterp(rvPct / rvTope, [[0, 60], [1, 100]]));
    } else {
      const exceso = rvPct - rvTope;
      score = Math.max(10, Math.round(100 - exceso * 3));
    }
    return {
      key: 'encaje', label: 'Encaje con objetivo',
      value: rvPct.toFixed(0) + '% RV (tope ' + rvTope + '%)',
      score, available: true, weight
    };
  }

  // ─────────────────────────────────────────────
  // computeCarteraScore — función única, forma estable de retorno:
  // { overall, ejes: [{ key, label, value, score, available, weight }],
  //   cobertura: { disponibles, total, pendientes }, marketMetrics? }
  //
  // Params:
  //   preset   — objeto con funds[], groupCosts[], composition[], mandate, vehiculo, etc.
  //   weights  — opcional, pesos personalizados (usa DEFAULT_WEIGHTS si no se pasa)
  //   options  — opcional: { rvTope: number } para el eje de encaje
  // ─────────────────────────────────────────────
  function computeCarteraScore(preset, weights, options) {
    if (!preset || !preset.funds || preset.funds.length === 0) {
      return {
        overall: null, ejes: [],
        cobertura: { disponibles: 0, total: 6, pendientes: [] },
        error: 'cartera vacía: nada que puntuar'
      };
    }
    weights = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
    const opts = options || {};
    const funds = preset.funds || [];
    const groupCosts = preset.groupCosts || [];

    const ejes = [
      ejeCoste(funds, groupCosts, weights.coste),
      ejeEficienciaFiscal(preset, weights.eficienciaFiscal),
      ejeEstructura(funds, weights.estructura),
      ejeDiversificacion(preset, weights.diversificacion),
      ejeTamano(funds, groupCosts, weights.tamano),
      ejeEncaje(funds, opts.rvTope != null ? opts.rvTope : null, weights.encaje),
    ];

    // Métricas de mercado: solo si algún fondo tiene priceSeries (NO entran en overall)
    let marketMetrics;
    const hasPriceSeries = funds.some(f => f.priceSeries && f.priceSeries.length > 0);
    if (hasPriceSeries) {
      // Reservado para futuro: calcular vol, Sharpe, maxDD solo cuando hay serie.
      marketMetrics = { nota: 'priceSeries detectada; métricas de mercado pendientes de implementar' };
    }

    // Overall: media ponderada solo de ejes disponibles (renormaliza pesos)
    const disp = ejes.filter(e => e.available);
    const tw = disp.reduce((s, e) => s + e.weight, 0);
    const overall = tw > 0
      ? Math.round(disp.reduce((s, e) => s + e.score * (e.weight / tw), 0))
      : 0;

    const pendientes = ejes.filter(e => !e.available).map(e => e.key);
    const result = {
      overall, ejes,
      cobertura: { disponibles: disp.length, total: ejes.length, pendientes }
    };
    if (marketMetrics) result.marketMetrics = marketMetrics;
    return result;
  }

  return { DEFAULT_WEIGHTS, computeCarteraScore, costeTotalAnual };
});
