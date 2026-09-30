const { test } = require('node:test');
const assert = require('node:assert');
const SimEngine = require('../simulador-engine.js');
const proy = require('../engine-proyeccion.js');

test('el rango ordena pesimista < base < optimista', () => {
  const params = { initial: 10000, monthly: 0, horizon: 15, inflation: 2 };
  const funds = [{ id: 'a', weight: 100, costs: [] }];
  const r = proy.rangoProyeccion(params, funds, { rentBase: 6.5, volAnual: 15 }, SimEngine);
  assert.ok(r.pesimista.patrimonioFinal < r.base.patrimonioFinal);
  assert.ok(r.base.patrimonioFinal < r.optimista.patrimonioFinal);
});

test('la base usa exactamente la rentabilidad base recibida', () => {
  const params = { initial: 1000, monthly: 0, horizon: 1, inflation: 0 };
  const funds = [{ id: 'a', weight: 100, costs: [] }];
  const r = proy.rangoProyeccion(params, funds, { rentBase: 10, volAnual: 0 }, SimEngine);
  assert.strictEqual(Math.round(r.base.patrimonioFinal), Math.round(r.pesimista.patrimonioFinal));
  assert.ok(r.base.patrimonioFinal > 1090 && r.base.patrimonioFinal < 1110);
});

test('rentabilidad pesimista extrema no produce NaN', () => {
  const params = { initial: 1000, monthly: 0, horizon: 10, inflation: 0 };
  const funds = [{ id: 'a', weight: 100, costs: [] }];
  const r = proy.rangoProyeccion(params, funds, { rentBase: 5, volAnual: 200 }, SimEngine);
  assert.ok(Number.isFinite(r.pesimista.patrimonioFinal), 'el patrimonio pesimista debe ser finito, no NaN');
});

test('los groupCosts (capa robo) reducen la proyección — antes se ignoraban', () => {
  const params = { initial: 10000, monthly: 0, horizon: 20, inflation: 0 };
  const funds = [{ id: 'a', weight: 100, costs: [] }];
  const sup = { rentBase: 6, volAnual: 0 };
  const sinCoste = proy.rangoProyeccion(params, funds, sup, SimEngine, []);
  const conCoste = proy.rangoProyeccion(params, funds, sup, SimEngine,
    [{ id: 'robo', name: 'capa robo', value: 0.8, unit: 'pct', type: 'annual' }]);
  assert.ok(conCoste.base.patrimonioFinal < sinCoste.base.patrimonioFinal,
    'la proyección con groupCosts (0,8%/año) debe ser MENOR que sin ellos');
  // Y el sabor por defecto (sin 5º arg) equivale a sin costes de grupo — retrocompatibilidad.
  const legacy = proy.rangoProyeccion(params, funds, sup, SimEngine);
  assert.strictEqual(Math.round(legacy.base.patrimonioFinal), Math.round(sinCoste.base.patrimonioFinal));
});

test('la banda estrecha (vol/√t) es más ceñida que aplicar la volatilidad plana', () => {
  const funds = [{ id: 'a', weight: 100, costs: [] }];
  const params = { initial: 10000, monthly: 0, horizon: 16, inflation: 0 };
  const estrecha = proy.rangoProyeccion(params, funds, { rentBase: 6, volAnual: 15 }, SimEngine);
  // Referencia "banda plana": aplicar la volatilidad anual entera (lo que descartamos).
  const planaPes = SimEngine.simulate({ ...params, rent: 6 - 15 }, funds, [], false).patrimonioFinal;
  const planaOpt = SimEngine.simulate({ ...params, rent: 6 + 15 }, funds, [], false).patrimonioFinal;
  const anchoEstrecha = estrecha.optimista.patrimonioFinal - estrecha.pesimista.patrimonioFinal;
  const anchoPlana = planaOpt - planaPes;
  assert.ok(anchoEstrecha < anchoPlana, 'la banda estrecha debe ser más ceñida que la plana');
});
