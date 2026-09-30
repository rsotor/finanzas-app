const { test } = require('node:test');
const assert = require('node:assert');
const fiscal = require('../engine-fiscal.js');

test('traspaso fondo→fondo no tiene coste fiscal', () => {
  const r = fiscal.costeDeMover({ origen: 'fondo', destino: 'fondo', valorActual: 10000, costeAdquisicion: 6000 });
  assert.strictEqual(r.coste, 0);
  assert.strictEqual(r.faltaInfo, false);
});

test('reembolso aplica el primer tramo del ahorro a la plusvalía', () => {
  const r = fiscal.costeDeMover({ origen: 'fondo', destino: 'cash', valorActual: 7000, costeAdquisicion: 6000 });
  const primerTipo = fiscal.SAVINGS_TAX_BRACKETS[0].tipo;
  assert.strictEqual(Math.round(r.coste), Math.round(1000 * primerTipo / 100));
});

test('sin coste de adquisición marca FALTA INFO y no inventa plusvalía', () => {
  const r = fiscal.costeDeMover({ origen: 'fondo', destino: 'cash', valorActual: 7000, costeAdquisicion: null });
  assert.strictEqual(r.faltaInfo, true);
  assert.strictEqual(r.coste, null);
});

test('impuestoAhorro es progresivo por tramos', () => {
  const cruceSegundoTramo = fiscal.SAVINGS_TAX_BRACKETS[0].hasta + 1000;
  const impuesto = fiscal.impuestoAhorro(cruceSegundoTramo);
  const soloPrimerTipo = cruceSegundoTramo * fiscal.SAVINGS_TAX_BRACKETS[0].tipo / 100;
  assert.ok(impuesto > soloPrimerTipo, 'el segundo tramo debe encarecer respecto a aplicar solo el primer tipo');
});
