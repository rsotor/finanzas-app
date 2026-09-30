const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Cli = require('../cartera-cli.js');

const escenario = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'escenario-ejemplo.json'), 'utf8'));

test('construirPayload devuelve un bloque con score, coste y proyección en rango', () => {
  const p = Cli.construirPayload(escenario);
  assert.strictEqual(p.bloques.length, 1);
  const c = p.bloques[0].carteras[0];
  assert.ok(c.overall >= 0 && c.overall <= 100, 'overall en rango');
  assert.ok(c.costeAnualPct > 0, 'coste calculado');
  assert.ok(c.proyeccion.base.patrimonioFinal > 20000, 'proyección base crece');
  assert.ok(c.proyeccion.pesimista.patrimonioFinal < c.proyeccion.optimista.patrimonioFinal, 'rango ordenado');
});

test('construirPayload compara DIY vs todo-en-uno y declara ganador', () => {
  const p = Cli.construirPayload(escenario);
  const cmp = p.bloques[0].comparacion;
  assert.ok(['DIY RV+RF', 'Robo', null].includes(cmp.ganadorFinal));
  assert.ok(typeof cmp.netoFinalA === 'number' && typeof cmp.netoFinalB === 'number');
});

test('construirPayload agrega la vista global y el plan de DCA', () => {
  const p = Cli.construirPayload(escenario);
  assert.ok(p.global.totalImporte >= 20000);
  assert.strictEqual(p.dca.total, 9000);
  assert.strictEqual(p.dca.calendario.length, 9);
});

test('construirPayload usa rentBase prudente (proyección por debajo de rent histórica alta)', () => {
  const p = Cli.construirPayload(escenario);
  // rentBase prudente para 80/20 ≈ 0.8*6.0 + 0.2*4.7 = 5.74%, no una rent inflada
  assert.ok(p.bloques[0].carteras[0].supuestos.rentBase < 7);
});

test('sin datos de volatilidad: rangoDisponible false y aviso, sin inventar', () => {
  const esc = {
    capitalParado: 1000, dcaMeses: 9,
    bloques: [{
      id: 'x', label: 'X', importe: 10000, horizon: 10, monthly: 0, inflation: 0,
      carteras: [{ label: 'sin datos', esTodoEnUno: false, preset: { params: {}, groupCosts: [], funds: [{ id: 'a', weight: 100, alloc: { equity: 100 }, costs: [] }] } }],
      todoEnUno: []
    }]
  };
  const p = Cli.construirPayload(esc);
  const c = p.bloques[0].carteras[0];
  assert.strictEqual(c.rangoDisponible, false);
  assert.strictEqual(c.proyeccion.pesimista.patrimonioFinal, c.proyeccion.optimista.patrimonioFinal);
  assert.ok(p.avisos.some(a => a.includes('proyección sin rango')));
});
