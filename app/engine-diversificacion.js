(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.diversificacion = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function solapamientoSectorial(sectorsA, sectorsB) {
    if (!sectorsA || !sectorsB) return null;
    const mapB = new Map(sectorsB.map(s => [s.name, s.pct]));
    let overlap = 0;
    for (const s of sectorsA) {
      if (mapB.has(s.name)) overlap += Math.min(s.pct, mapB.get(s.name));
    }
    return overlap;
  }

  function solapamientoCartera(funds) {
    let num = 0, den = 0;
    for (let i = 0; i < funds.length; i++) {
      for (let j = i + 1; j < funds.length; j++) {
        const ov = solapamientoSectorial(funds[i].topSectors, funds[j].topSectors);
        if (ov == null) continue;
        const w = (funds[i].weight || 0) * (funds[j].weight || 0);
        num += ov * w;
        den += w;
      }
    }
    return den > 0 ? num / den : null;
  }

  function retornos(px) {
    const r = [];
    for (let i = 1; i < px.length; i++) r.push((px[i] - px[i - 1]) / px[i - 1]);
    return r;
  }

  function alinearSeries(A, B) {
    const dayMs = 86400000;
    const baseA = Date.parse(A.start), baseB = Date.parse(B.start);
    const mapA = new Map();
    A.points.off.forEach((o, i) => mapA.set(baseA + o * dayMs, A.points.px[i]));
    const mapB = new Map();
    B.points.off.forEach((o, i) => mapB.set(baseB + o * dayMs, B.points.px[i]));
    const pxA = [], pxB = [];
    const commonDays = [...mapA.keys()].filter(d => mapB.has(d)).sort((x, y) => x - y);
    for (const d of commonDays) { pxA.push(mapA.get(d)); pxB.push(mapB.get(d)); }
    return { pxA, pxB };
  }

  function correlacionPearson(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return null;
    let sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
    const ma = sa / n, mb = sb / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      cov += da * db; va += da * da; vb += db * db;
    }
    if (va === 0 || vb === 0) return null;
    return cov / Math.sqrt(va * vb);
  }

  function correlacionCartera(funds) {
    let num = 0, den = 0;
    for (let i = 0; i < funds.length; i++) {
      for (let j = i + 1; j < funds.length; j++) {
        const A = funds[i].priceSeries, B = funds[j].priceSeries;
        if (!A || !B) continue;
        const { pxA, pxB } = alinearSeries(A, B);
        const c = correlacionPearson(retornos(pxA), retornos(pxB));
        if (c == null) continue;
        const w = (funds[i].weight || 0) * (funds[j].weight || 0);
        num += c * w; den += w;
      }
    }
    return den > 0 ? num / den : null;
  }

  function volCartera(funds) {
    let num = 0, den = 0;
    (funds || []).forEach(f => {
      if (!f.priceSeries || !f.priceSeries.points || !f.priceSeries.points.px) return;
      const rets = retornos(f.priceSeries.points.px);
      if (rets.length < 2) return;
      const m = rets.reduce((s, x) => s + x, 0) / rets.length;
      const varr = rets.reduce((s, x) => s + (x - m) * (x - m), 0) / (rets.length - 1);
      const volAnual = Math.sqrt(varr) * Math.sqrt(12) * 100; // mensual → anual, en %
      num += volAnual * (f.weight || 0); den += (f.weight || 0);
    });
    return den > 0 ? num / den : null;
  }

  function volAnualDesdeRetornos(annual) {
    if (!annual) return null;
    const vals = [];
    for (const key in annual) {
      if (/^\d{4}$/.test(key)) {
        const v = annual[key];
        if (typeof v === 'number') vals.push(v);
      }
    }
    if (vals.length < 2) return null;
    const media = vals.reduce((s, x) => s + x, 0) / vals.length;
    const varianza = vals.reduce((s, x) => s + (x - media) * (x - media), 0) / (vals.length - 1);
    return Math.sqrt(varianza);
  }

  return { solapamientoSectorial, solapamientoCartera, retornos, alinearSeries, correlacionPearson, correlacionCartera, volCartera, volAnualDesdeRetornos };
});
