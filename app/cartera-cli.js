'use strict';
// Orquestador fino: escenario JSON → payload JSON. Cero matemática propia (la hacen los engines).

const core = require('./simulador-engine.js');
const scorecard = require('./engine-scorecard.js');
const supuestos = require('./engine-supuestos.js');
const diversificacion = require('./engine-diversificacion.js');
const proyeccion = require('./engine-proyeccion.js');
const comparador = require('./engine-comparador.js');
const globalEngine = require('./engine-global.js');
const dca = require('./engine-dca.js');

function evaluarCartera(item, bloque) {
  const preset = item.preset || {};
  const funds = preset.funds || [];
  const score = scorecard.computeCarteraScore(preset);
  const costeAnualPct = scorecard.costeTotalAnual(funds, preset.groupCosts);
  const cs = supuestos.carteraSupuestos(funds);
  const volPrice = diversificacion.volCartera(funds);
  const volAnual = volPrice != null
    ? volPrice
    : diversificacion.volAnualDesdeRetornos(preset.historicalReturns && preset.historicalReturns.annual);
  const volFuente = volPrice != null ? 'priceSeries' : (volAnual != null ? 'historicalReturns' : null);
  const rangoDisponible = volAnual != null && volAnual > 0;
  const params = { initial: bloque.importe, monthly: bloque.monthly || 0, horizon: bloque.horizon, inflation: bloque.inflation || 0 };
  const rentBase = cs.rentBase != null ? cs.rentBase : ((preset.params && preset.params.rent) || 6);
  const sup = { rentBase, volAnual: volAnual || 0 };
  const proy = proyeccion.rangoProyeccion(params, funds, sup, core, preset.groupCosts || []);
  return {
    label: item.label,
    esTodoEnUno: !!item.esTodoEnUno,
    overall: score.overall,
    ejes: score.ejes,
    cobertura: score.cobertura,
    costeAnualPct,
    supuestos: { rentBase, volAnual: volAnual, volFuente, cobertura: cs.cobertura, faltaInfo: cs.faltaInfo },
    rangoDisponible,
    proyeccion: proy,
  };
}

function construirPayload(escenario) {
  const avisos = [];
  const bloques = (escenario.bloques || []).map(bloque => {
    const diy = (bloque.carteras || []).map(c => evaluarCartera(c, bloque));
    const robo = (bloque.todoEnUno || []).map(c => evaluarCartera(c, bloque));
    const carteras = diy.concat(robo);

    // Comparación A+B+C vs todo-en-uno: primera DIY vs primer todo-en-uno (si existen).
    let comparacion = null;
    if (diy[0] && robo[0]) {
      const params = { initial: bloque.importe, monthly: bloque.monthly || 0, horizon: bloque.horizon, inflation: bloque.inflation || 0, rent: diy[0].supuestos.rentBase };
      const opcionA = { nombre: diy[0].label, costeAnualPct: diy[0].costeAnualPct, peajePct: 0 };
      const opcionB = { nombre: robo[0].label, costeAnualPct: robo[0].costeAnualPct, peajePct: 0 };
      const be = comparador.breakEvenFondoVsEtf(opcionA, opcionB, params, core);
      comparacion = { etiquetaA: opcionA.nombre, etiquetaB: opcionB.nombre, ganadorFinal: be.ganadorFinal, anioCruce: be.anioCruce, netoFinalA: be.netoFinalA, netoFinalB: be.netoFinalB };
    }

    carteras.forEach(c => {
      if (c.supuestos.faltaInfo) avisos.push(`${bloque.label} / ${c.label}: rentBase con cobertura ${c.supuestos.cobertura}% (faltan datos de alloc).`);
      if (c.cobertura && c.cobertura.pendientes && c.cobertura.pendientes.length) avisos.push(`${bloque.label} / ${c.label}: ejes sin datos: ${c.cobertura.pendientes.join(', ')}.`);
      if (!c.rangoDisponible) avisos.push(`${bloque.label} / ${c.label}: proyección sin rango (faltan datos de volatilidad).`);
    });

    return { id: bloque.id, label: bloque.label, importe: bloque.importe, horizon: bloque.horizon, carteras, comparacion };
  });

  // Vista global: cartera seleccionada por bloque = la primera DIY (o la primera disponible).
  const seleccion = bloques.map(b => {
    const elegida = b.carteras.find(c => !c.esTodoEnUno) || b.carteras[0];
    if (!elegida) return null;
    const bloqueOrig = (escenario.bloques || []).find(x => x.id === b.id) || {};
    const presetElegido = ((bloqueOrig.carteras || []).concat(bloqueOrig.todoEnUno || [])).find(c => c.label === elegida.label);
    return { id: b.id, label: b.label, importe: b.importe, overall: elegida.overall, costeAnualPct: elegida.costeAnualPct, funds: (presetElegido && presetElegido.preset && presetElegido.preset.funds) || [] };
  }).filter(Boolean);
  const vistaGlobal = globalEngine.agregarGlobal(seleccion);
  if (vistaGlobal.diversificacion.degradado) avisos.push('Diversificación global degradada a solapamiento (faltan series de precio para correlación).');

  const planDca = dca.planDca(escenario.capitalParado, escenario.dcaMeses);

  return { perfil: escenario.perfil || null, bloques, global: vistaGlobal, dca: planDca, avisos };
}

if (require.main === module) {
  const fs = require('fs');
  const ruta = process.argv[2];
  if (!ruta) { console.error('Uso: node cartera-cli.js <escenario.json>'); process.exit(1); }
  const escenario = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  process.stdout.write(JSON.stringify(construirPayload(escenario), null, 2) + '\n');
}

module.exports = { construirPayload, evaluarCartera };
