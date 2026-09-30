const { test } = require('node:test');
const assert = require('node:assert');
const perfil = require('../engine-perfil.js');

test('gate del colchón: por debajo de la meta no está cubierto', () => {
  const r = perfil.gateColchon(8000, 10000);
  assert.strictEqual(r.cubierto, false);
  assert.strictEqual(r.faltan, 2000);
});

test('gate del colchón: igualando o superando la meta está cubierto', () => {
  assert.strictEqual(perfil.gateColchon(10000, 10000).cubierto, true);
  assert.strictEqual(perfil.gateColchon(12000, 10000).faltan, 0);
});

test('gate del colchón: meta por defecto 10.000 €', () => {
  assert.strictEqual(perfil.gateColchon(9000).cubierto, false);
  assert.strictEqual(perfil.gateColchon(9000).meta, 10000);
});

test('tope de RV por tramo de horizonte (objetivo flexible)', () => {
  assert.strictEqual(perfil.topeRV(2, 'flexible'), 20);
  assert.strictEqual(perfil.topeRV(5, 'flexible'), 50);
  assert.strictEqual(perfil.topeRV(10, 'flexible'), 85);
  assert.strictEqual(perfil.topeRV(20, 'flexible'), 100);
});

test('tope de RV: límites de tramo inclusivos hacia arriba', () => {
  assert.strictEqual(perfil.topeRV(3, 'flexible'), 50);
  assert.strictEqual(perfil.topeRV(7, 'flexible'), 85);
  assert.strictEqual(perfil.topeRV(15, 'flexible'), 100);
});

test('tope de RV: un objetivo crítico-datado recorta el tope', () => {
  assert.ok(perfil.topeRV(10, 'critico') < perfil.topeRV(10, 'flexible'));
  assert.strictEqual(perfil.topeRV(10, 'critico'), 60);
});

test('criticidad por defecto es flexible', () => {
  assert.strictEqual(perfil.topeRV(10), 85);
});
