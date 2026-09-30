const { test } = require('node:test');
const assert = require('node:assert');
const Dca = require('../engine-dca.js');

test('planDca reparte el capital en tramos mensuales que suman el total', () => {
  const r = Dca.planDca(9000, 9);
  assert.strictEqual(r.meses, 9);
  assert.strictEqual(r.importeMensual, 1000);
  assert.strictEqual(r.calendario.length, 9);
  assert.strictEqual(r.calendario[8].acumulado, 9000);
  assert.strictEqual(r.fueraDeRango, false);
});

test('planDca: el último tramo absorbe el redondeo', () => {
  const r = Dca.planDca(10000, 3);
  const suma = r.calendario.reduce((s, x) => s + x.importe, 0);
  assert.strictEqual(suma, 10000);
  assert.strictEqual(r.fueraDeRango, true); // 3 < 6
});

test('planDca usa 9 meses por defecto', () => {
  assert.strictEqual(Dca.planDca(9000).meses, 9);
});

test('planDca rechaza capital <= 0', () => {
  assert.ok(Dca.planDca(0, 9).error);
});

test('planDca rechaza meses < 1', () => {
  assert.ok(Dca.planDca(1000, 0).error);
});
