// simulador-engine.js — Pure simulation logic (no DOM, no globals)
// Shared by simulador-fondos.html and comparador-fondos.html
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────
  const COST_TYPE_LABELS = {
    annual:    'Anual',
    entry:     'Entrada',
    exit:      'Salida',
    operation: 'Por operación',
  };

  const CATEGORY_LABELS = {
    rv:    'Renta Variable',
    rf:    'Renta Fija',
    mixto: 'Mixto',
    otro:  'Otro',
  };

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  function fmt(n) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
  }

  function fmtDec(n, decimals = 2) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function parseNum(s) {
    if (typeof s === 'number') return s;
    const str = String(s).replace(/[^\d,.-]/g, '');
    const hasDot   = str.includes('.');
    const hasComma = str.includes(',');
    if (hasComma) {
      // Formato español: 1.000,50 o 1000,50 → punto es miles, coma es decimal
      return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (hasDot) {
      const parts = str.split('.');
      const afterDot = parts[parts.length - 1];
      // Si hay múltiples puntos, o la parte decimal tiene exactamente 3 dígitos → miles
      if (parts.length > 2 || (afterDot.length === 3 && parts[0].length >= 1 && parts[0].length <= 3)) {
        return parseFloat(str.replace(/\./g, '')) || 0;
      }
      return parseFloat(str) || 0;
    }
    return parseFloat(str) || 0;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─────────────────────────────────────────────
  // SCORE HELPERS
  // ─────────────────────────────────────────────
  function _scoreInterp(val, breakpoints) {
    // breakpoints: [[val, score], ...] sorted ascending by val
    if (val <= breakpoints[0][0]) return breakpoints[0][1];
    if (val >= breakpoints[breakpoints.length - 1][0]) return breakpoints[breakpoints.length - 1][1];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const [v0, s0] = breakpoints[i];
      const [v1, s1] = breakpoints[i + 1];
      if (val >= v0 && val <= v1) {
        const t = (val - v0) / (v1 - v0);
        return s0 + t * (s1 - s0);
      }
    }
    return 50;
  }

  function _scoreColor(s) {
    if (s >= 70) return 'green';
    if (s >= 40) return 'amber';
    return 'red';
  }

  // ─────────────────────────────────────────────
  // CORE: simulate
  // ─────────────────────────────────────────────
  function simulate(p, fundsSnap, groupCostsSnap, rentByFund) {
    const years   = p.horizon;
    const months  = years * 12;
    const initial = p.initial || 0;
    const monthly = p.monthly || 0;
    const inflation = (p.inflation || 0) / 100;

    // ── collect cost metadata ──────────────────────────────────────
    // Weighted annual pct (applied to patrimonio each year)
    let weightedAnnualCostPct = 0; // from funds (weighted)
    let groupAnnualPct        = 0; // from group costs (annual %)
    let groupAnnualEur        = 0; // from group costs (annual flat €)
    let entryPct              = 0; // entry % (group + fund-weighted)
    let exitPct               = 0; // exit % (group + fund-weighted)
    let fundAnnualEur         = 0; // flat annual € from fund costs (weighted share)

    // Per-source cost details for accordion: { [sourceKey]: { [costId]: { name, type, unit, value, total } } }
    const fundCostDetails  = {}; // fundId -> costId -> { name, type, unit, value, total }
    const groupCostDetails = {}; // costId -> { name, type, unit, value, total }

    // Fund-level trackers
    const fundCostAccum  = {}; // fundId -> total accumulated €
    const groupCostAccum = {}; // costId -> total accumulated €

    // Per-fund per-cost month accumulators (for precise tracking)
    const fundCostMonthly  = {}; // fundId -> costId -> annual-pct share per month
    const groupCostMonthly = {}; // costId -> { type, unit, value }

    // --- Process fund costs ---
    fundsSnap.forEach(fund => {
      const w = (fund.weight || 0) / 100;
      fundCostDetails[fund.id]  = {};
      fundCostAccum[fund.id]    = 0;
      fundCostMonthly[fund.id]  = {};

      (fund.costs || []).forEach(c => {
        fundCostDetails[fund.id][c.id] = {
          name: c.name, type: c.type, unit: c.unit, value: c.value, total: 0
        };
        fundCostMonthly[fund.id][c.id] = { type: c.type, unit: c.unit, value: c.value, weight: w };

        if (c.type === 'annual') {
          if (c.unit === 'pct') {
            weightedAnnualCostPct += w * c.value;
          } else {
            fundAnnualEur += w * c.value;
          }
        } else if (c.type === 'entry') {
          if (c.unit === 'pct') entryPct += w * c.value;
        } else if (c.type === 'exit') {
          if (c.unit === 'pct') exitPct += w * c.value;
        }
      });
    });

    // --- Process group costs ---
    groupCostsSnap.forEach(c => {
      groupCostDetails[c.id] = {
        name: c.name, type: c.type, unit: c.unit, value: c.value, total: 0
      };
      groupCostAccum[c.id] = 0;
      groupCostMonthly[c.id] = { type: c.type, unit: c.unit, value: c.value };

      if (c.type === 'annual') {
        if (c.unit === 'pct') {
          groupAnnualPct += c.value;
        } else {
          groupAnnualEur += c.value;
        }
      } else if (c.type === 'entry') {
        if (c.unit === 'pct') entryPct += c.value;
      } else if (c.type === 'exit') {
        if (c.unit === 'pct') exitPct += c.value;
      }
    });

    // ── net annual return ──────────────────────────────────────────
    let grossRentAnnual;
    if (rentByFund && fundsSnap.length > 0) {
      grossRentAnnual = fundsSnap.reduce((sum, f) => {
        return sum + (f.weight / 100) * ((f.rent || p.rent) / 100);
      }, 0);
    } else {
      grossRentAnnual = (p.rent || 0) / 100;
    }

    const totalAnnualCostPct = weightedAnnualCostPct + groupAnnualPct; // in %
    const netRentAnnual      = grossRentAnnual - totalAnnualCostPct / 100;
    const monthlyNet         = Math.pow(1 + netRentAnnual, 1 / 12) - 1;
    const monthlyNetNoCost   = Math.pow(1 + grossRentAnnual, 1 / 12) - 1;

    // ── entry cost factor ─────────────────────────────────────────
    const entryFactor  = entryPct / 100; // deducted from each contribution
    const flatMonthlyAnnualEur = (fundAnnualEur + groupAnnualEur) / 12;

    // ── simulation loop ────────────────────────────────────────────
    let patrimonio      = 0;
    let patrimonioNoCost = 0;
    let totalAportado   = 0;
    let totalCostes     = 0;
    let totalEntryCosts = 0; // track entry costs separately for "neto invertido"
    let breakEvenMonth  = -1;
    let sumPatrimonio    = 0; // for effective cost computation
    const yearlySnapshots = []; // { year, aportado, costes, netoInvertido, rentabilidad, patrimonio }

    // Apply initial investment
    if (initial > 0) {
      const initEntry = initial * entryFactor;
      const initNet   = initial - initEntry;
      totalAportado   += initial;
      totalCostes     += initEntry;
      totalEntryCosts += initEntry;
      patrimonio       = initNet;
      patrimonioNoCost = initial;

      // Track entry costs (initial)
      fundsSnap.forEach(fund => {
        const w = (fund.weight || 0) / 100;
        (fund.costs || []).forEach(c => {
          if (c.type === 'entry' && c.unit === 'pct') {
            const share = w * (c.value / 100) * initial;
            fundCostDetails[fund.id][c.id].total  += share;
            fundCostAccum[fund.id]                += share;
          }
        });
      });
      groupCostsSnap.forEach(c => {
        if (c.type === 'entry' && c.unit === 'pct') {
          const share = (c.value / 100) * initial;
          groupCostDetails[c.id].total  += share;
          groupCostAccum[c.id]          += share;
        }
      });
    }

    for (let m = 1; m <= months; m++) {
      // Monthly contribution with entry cost
      if (monthly > 0) {
        const entryAmt  = monthly * entryFactor;
        const contribNet = monthly - entryAmt;
        totalAportado   += monthly;
        totalCostes     += entryAmt;
        totalEntryCosts += entryAmt;
        patrimonio      += contribNet;
        patrimonioNoCost += monthly;

        // Track entry costs (monthly)
        fundsSnap.forEach(fund => {
          const w = (fund.weight || 0) / 100;
          (fund.costs || []).forEach(c => {
            if (c.type === 'entry' && c.unit === 'pct') {
              const share = w * (c.value / 100) * monthly;
              fundCostDetails[fund.id][c.id].total += share;
              fundCostAccum[fund.id]               += share;
            }
          });
        });
        groupCostsSnap.forEach(c => {
          if (c.type === 'entry' && c.unit === 'pct') {
            const share = (c.value / 100) * monthly;
            groupCostDetails[c.id].total += share;
            groupCostAccum[c.id]         += share;
          }
        });
      }

      // Grow at net rate (annual costs already embedded in netRentAnnual)
      patrimonio       = patrimonio       * (1 + monthlyNet);
      patrimonioNoCost = patrimonioNoCost * (1 + monthlyNetNoCost);

      // Track annual-% costs: the cost that was implicitly deducted from growth this month
      // = patrimonio_before_growth * (annualCostPct/100)^(1/12) ≈ patrimonio * monthlyImplicitCost
      // We use the same patrimony value (post-growth) to estimate the monthly cost share
      const monthlyImplicitPct = Math.pow(1 + totalAnnualCostPct / 100, 1 / 12) - 1;
      const implicitMonthlyCost = patrimonio * monthlyImplicitPct;
      totalCostes += implicitMonthlyCost;

      // Track per-fund annual-pct costs
      fundsSnap.forEach(fund => {
        const w = (fund.weight || 0) / 100;
        (fund.costs || []).forEach(c => {
          if (c.type === 'annual' && c.unit === 'pct') {
            const monthlyRate = Math.pow(1 + c.value / 100, 1 / 12) - 1;
            const share = patrimonio * w * monthlyRate;
            fundCostDetails[fund.id][c.id].total += share;
            fundCostAccum[fund.id]               += share;
          }
        });
      });
      groupCostsSnap.forEach(c => {
        if (c.type === 'annual' && c.unit === 'pct') {
          const monthlyRate = Math.pow(1 + c.value / 100, 1 / 12) - 1;
          const share = patrimonio * monthlyRate;
          groupCostDetails[c.id].total += share;
          groupCostAccum[c.id]         += share;
        }
      });

      // Flat annual costs deducted monthly
      if (flatMonthlyAnnualEur > 0) {
        patrimonio  -= flatMonthlyAnnualEur;
        totalCostes += flatMonthlyAnnualEur;

        // Track flat €/year fund costs
        fundsSnap.forEach(fund => {
          const w = (fund.weight || 0) / 100;
          (fund.costs || []).forEach(c => {
            if (c.type === 'annual' && c.unit === 'eur') {
              const share = w * c.value / 12;
              fundCostDetails[fund.id][c.id].total += share;
              fundCostAccum[fund.id]               += share;
            }
          });
        });
        groupCostsSnap.forEach(c => {
          if (c.type === 'annual' && c.unit === 'eur') {
            const share = c.value / 12;
            groupCostDetails[c.id].total += share;
            groupCostAccum[c.id]         += share;
          }
        });
      }

      // Track operation costs (flat per contribution month)
      if (monthly > 0) {
        fundsSnap.forEach(fund => {
          const w = (fund.weight || 0) / 100;
          (fund.costs || []).forEach(c => {
            if (c.type === 'operation' && c.unit === 'eur') {
              const share = w * c.value;
              fundCostDetails[fund.id][c.id].total += share;
              fundCostAccum[fund.id]               += share;
              totalCostes                          += share;
              patrimonio                           -= share;
            }
          });
        });
        groupCostsSnap.forEach(c => {
          if (c.type === 'operation' && c.unit === 'eur') {
            groupCostDetails[c.id].total += c.value;
            groupCostAccum[c.id]         += c.value;
            totalCostes                  += c.value;
            patrimonio                   -= c.value;
          }
        });
      }

      // Break-even: when rentabilidad accumulated > costes totales
      const rentAcum = patrimonio - (totalAportado - totalEntryCosts);
      if (breakEvenMonth === -1 && rentAcum > totalCostes) {
        breakEvenMonth = m;
      }

      // Year-end snapshot
      if (m % 12 === 0) {
        const yr = m / 12;
        sumPatrimonio += patrimonio;
        const netoInvertidoYr = totalAportado - totalEntryCosts;
        const rentabilidad  = netoInvertidoYr > 0 ? (patrimonio - netoInvertidoYr) / netoInvertidoYr * 100 : 0;
        yearlySnapshots.push({
          year:          yr,
          aportado:      totalAportado,
          costes:        totalCostes,
          netoInvertido: netoInvertidoYr,
          rentabilidad:  rentabilidad,
          patrimonio:    patrimonio,
        });
      }
    }

    // ── exit costs ────────────────────────────────────────────────
    if (exitPct > 0) {
      const exitAmt   = patrimonio * (exitPct / 100);
      totalCostes    += exitAmt;
      patrimonio     -= exitAmt;

      fundsSnap.forEach(fund => {
        const w = (fund.weight || 0) / 100;
        (fund.costs || []).forEach(c => {
          if (c.type === 'exit' && c.unit === 'pct') {
            const share = w * (c.value / 100) * (patrimonio + exitAmt);
            fundCostDetails[fund.id][c.id].total += share;
            fundCostAccum[fund.id]               += share;
          }
        });
      });
      groupCostsSnap.forEach(c => {
        if (c.type === 'exit' && c.unit === 'pct') {
          const share = (c.value / 100) * (patrimonio + exitAmt);
          groupCostDetails[c.id].total += share;
          groupCostAccum[c.id]         += share;
        }
      });
    }

    // ── derived results ────────────────────────────────────────────
    const netoInvertido   = totalAportado - totalEntryCosts;
    const rentabilidadEur = patrimonio - netoInvertido;
    const rentabilidadPct = netoInvertido > 0 ? (rentabilidadEur / netoInvertido) * 100 : 0;
    const avgPatrimonio   = sumPatrimonio / years;
    const effectiveAnnualCost = avgPatrimonio > 0
      ? (totalCostes / avgPatrimonio / years) * 100
      : 0;
    const costPer100      = totalAportado > 0 ? (totalCostes / totalAportado) * 100 : 0;
    const patrimonioReal  = patrimonio / Math.pow(1 + inflation, years);
    const lostVsNoCost    = patrimonioNoCost - patrimonio;

    return {
      totalAportado,
      totalCostes,
      totalEntryCosts,
      netoInvertido,
      patrimonioFinal:     patrimonio,
      patrimonioNoCost,
      patrimonioReal,
      rentabilidadEur,
      rentabilidadPct,
      effectiveAnnualCost,
      costPer100,
      breakEvenMonth,
      lostVsNoCost,
      yearlySnapshots,
      fundCostAccum,
      groupCostAccum,
      fundCostDetails,
      groupCostDetails,
    };
  }

  // ─────────────────────────────────────────────
  // approxNoCostAtYear
  // ─────────────────────────────────────────────
  /**
   * Approximate patrimonio without costs at a given year.
   * Uses gross return compounded monthly.
   */
  function approxNoCostAtYear(upToYear, p, fundsSnap, rentByFund) {
    const months = upToYear * 12;
    let grossRentAnnual;
    if (rentByFund && fundsSnap.length > 0) {
      grossRentAnnual = fundsSnap.reduce((sum, f) => sum + (f.weight / 100) * ((f.rent || p.rent) / 100), 0);
    } else {
      grossRentAnnual = (p.rent || 0) / 100;
    }
    const monthlyGross = Math.pow(1 + grossRentAnnual, 1 / 12) - 1;
    let pat = (p.initial || 0);
    const mon = p.monthly || 0;
    for (let m = 1; m <= months; m++) {
      pat += mon;
      pat *= (1 + monthlyGross);
    }
    return pat;
  }

  // ─────────────────────────────────────────────
  // SCORE — delega en engine-scorecard (única fuente de verdad)
  //
  // El simulador trabaja con funds/groupCosts sueltos (sin objeto preset completo),
  // así que construimos un preset equivalente antes de llamar a computeCarteraScore.
  // La forma de retorno del simulador mantiene 'metrics' como alias de 'ejes'
  // para no romper el código de renderScoreBlock que ya filtra por m.available.
  // ─────────────────────────────────────────────
  function _getScorecardFn() {
    // En Node: cargamos engine-scorecard dinámicamente para evitar dependencia circular.
    // En browser: engine-scorecard.js se carga antes que simulador-engine.js (ver HTML).
    if (typeof module !== 'undefined' && module.exports) {
      // Require lazy para evitar ciclo de dependencias en Node
      return require('./engine-scorecard.js').computeCarteraScore;
    }
    // En browser: window.SimEngine.computeCarteraScore lo inyecta engine-scorecard.js
    return (typeof window !== 'undefined' && window.SimEngine && window.SimEngine.computeCarteraScore)
      ? window.SimEngine.computeCarteraScore
      : null;
  }

  function computeScoreMetrics(params, funds, groupCosts) {
    if (funds.length === 0) return { overall: 0, metrics: [], ejes: [] };

    const computeCarteraScore = _getScorecardFn();
    if (!computeCarteraScore) {
      // Fallback mínimo si por algún motivo no está disponible (no debería ocurrir)
      return { overall: 0, metrics: [], ejes: [] };
    }

    // Construir objeto preset equivalente con los datos disponibles en el simulador
    const preset = { funds: funds, groupCosts: groupCosts || [] };

    const result = computeCarteraScore(preset);
    // 'ejes' es el nombre canónico; 'metrics' es alias para compatibilidad con renderScoreBlock
    return { overall: result.overall, ejes: result.ejes, metrics: result.ejes, cobertura: result.cobertura };
  }

  function computeOverallScore(params, funds, groupCosts, rentByFund) {
    return computeScoreMetrics(params, funds, groupCosts).overall;
  }

  // ─────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────
  const SimEngine = {
    COST_TYPE_LABELS,
    CATEGORY_LABELS,
    fmt,
    fmtDec,
    parseNum,
    escHtml,
    _scoreInterp,
    _scoreColor,
    simulate,
    approxNoCostAtYear,
    computeScoreMetrics,
    computeOverallScore,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SimEngine;
  if (typeof window !== 'undefined') window.SimEngine = Object.assign(window.SimEngine || {}, SimEngine);
})();
