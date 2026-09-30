const { test } = require('node:test');
const assert = require('node:assert');
const sup = require('../engine-supuestos.js');

test('hay un supuesto de rentabilidad para RV global y es prudente', () => {
  const rv = sup.expectedReturn('rv-global');
  assert.strictEqual(typeof rv, 'number');
  assert.ok(rv > 0 && rv < 10, 'un supuesto prudente de RV global está por debajo del ~10% nominal');
});

test('cada supuesto declara su fuente', () => {
  assert.ok(sup.SOURCE && sup.SOURCE.length > 0, 'debe citar la fuente');
});

test('clase desconocida devuelve null (no inventa)', () => {
  assert.strictEqual(sup.expectedReturn('clase-inexistente'), null);
});

test('carteraSupuestos mezcla rentabilidad esperada por alloc y weight', () => {
  // 100% RV (equity) → rv-global 6.0 ; 100% RF (bond) → rf-agregada 4.7
  const funds = [
    { weight: 50, alloc: { equity: 100, bond: 0, cash: 0, other: 0 } },
    { weight: 50, alloc: { equity: 0, bond: 100, cash: 0, other: 0 } },
  ];
  const s = sup.carteraSupuestos(funds);
  assert.strictEqual(s.cobertura, 100);
  assert.strictEqual(s.faltaInfo, false);
  assert.ok(Math.abs(s.rentBase - (6.0 * 0.5 + 4.7 * 0.5)) < 1e-9, 'rentBase = 5.35');
});

test('carteraSupuestos marca faltaInfo y baja cobertura si un fondo no trae alloc', () => {
  const funds = [
    { weight: 50, alloc: { equity: 100 } },
    { weight: 50 }, // sin alloc
  ];
  const s = sup.carteraSupuestos(funds);
  assert.strictEqual(s.cobertura, 50);
  assert.strictEqual(s.faltaInfo, true);
  assert.ok(Math.abs(s.rentBase - 6.0) < 1e-9, 'rentBase solo del fondo con datos');
});

test('carteraSupuestos devuelve rentBase null si ningún fondo tiene alloc', () => {
  const s = sup.carteraSupuestos([{ weight: 100 }]);
  assert.strictEqual(s.rentBase, null);
});
