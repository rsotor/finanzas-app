const { test } = require('node:test');
const assert = require('node:assert');
const plan = require('../engine-plan.js');
const fx = require('./fixtures/plan-pruebas.json');
const TOL = 0.01;   // céntimo

test('con las entradas del Excel, la proyección coincide al céntimo en las 85 filas y 3 bolsas', () => {
  const s = plan.proyectar(fx.entrada);
  assert.strictEqual(s.filas.length, 85);
  fx.esperado.filas.forEach((e, i) => {
    const f = s.filas[i];
    assert.strictEqual(f.anio, e.anio);
    for (const [k, v] of [['total', e.total], ['totalNeto', e.totalNeto], ['aportas', e.aportas], ['retiras', e.retiras]]) {
      assert.ok(Math.abs(f[k] - v) < TOL, `${e.anio} ${k}: motor ${f[k]} vs excel ${v}`);
    }
    e.bolsas.forEach((b, k) => {
      const m = f.bolsas[k];
      [['ap', 0], ['val', 1], ['base', 2], ['re', 3], ['coste', 4], ['sc', 5]].forEach(([campo, j]) => {
        assert.ok(Math.abs(m[campo] - b[j]) < TOL, `${e.anio} bolsa ${k} ${campo}: motor ${m[campo]} vs excel ${b[j]}`);
      });
    });
  });
});

test('veredicto: no llegas, primer objetivo sin pagar en 2031 (el coche)', () => {
  const s = plan.proyectar(fx.entrada);
  assert.strictEqual(s.veredicto.ok, false);
  assert.strictEqual(s.veredicto.primerAnio, fx.esperado.primerAnio);
  assert.strictEqual(s.veredicto.primerObjetivo, 'Coche');
  assert.strictEqual(s.anioJubilacion, 2057);
  assert.ok(Math.abs(s.enJubilacion - fx.esperado.enJubilacion) < TOL);
});

test('el objetivo sin identificar no entra en la proyección pero sí en sinModelar', () => {
  const s = plan.proyectar(fx.entrada);
  assert.deepStrictEqual(s.sinModelar.map(o => [o.nombre, o.anio, o.importe]), [['⚠ POR IDENTIFICAR', 2042, null]]);
});
