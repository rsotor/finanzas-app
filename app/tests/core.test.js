const { test } = require('node:test');
const assert = require('node:assert');
const SimEngine = require('../simulador-engine.js');

test('el engine se importa en Node y expone simulate', () => {
  assert.strictEqual(typeof SimEngine.simulate, 'function');
  assert.strictEqual(typeof SimEngine.computeScoreMetrics, 'function');
});

test('simulate proyecta una cartera simple y crece', () => {
  const r = SimEngine.simulate(
    { initial: 1000, monthly: 0, horizon: 1, rent: 10, inflation: 0 },
    [{ id: 'a', weight: 100, rent: 10, costs: [] }],
    [],
    true
  );
  assert.ok(r.patrimonioFinal > 1000, 'patrimonio final debe superar el inicial');
});
