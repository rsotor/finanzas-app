const { test } = require('node:test');
const assert = require('node:assert');
const SimEngine = require('../simulador-engine.js');
const cmp = require('../engine-comparador.js');

const params = { initial: 10000, monthly: 0, horizon: 30, inflation: 0, rent: 6 };
const fondo = { nombre: 'Fondo (traspasable)', costeAnualPct: 0.5, peajePct: 0 };
const etf   = { nombre: 'ETF (más barato)',    costeAnualPct: 0.2, peajePct: 2 };

test('a corto plazo gana el fondo (el peaje del ETF no se recupera aún)', () => {
  const r = cmp.breakEvenFondoVsEtf(fondo, etf, { ...params, horizon: 2 }, SimEngine);
  assert.strictEqual(r.ganadorFinal, 'Fondo (traspasable)');
});

test('a largo plazo gana el ETF (el ahorro de coste supera el peaje)', () => {
  const r = cmp.breakEvenFondoVsEtf(fondo, etf, { ...params, horizon: 30 }, SimEngine);
  assert.strictEqual(r.ganadorFinal, 'ETF (más barato)');
});

test('devuelve un año de cruce entre 1 y el horizonte', () => {
  const r = cmp.breakEvenFondoVsEtf(fondo, etf, params, SimEngine);
  assert.ok(r.anioCruce >= 1 && r.anioCruce <= params.horizon);
});

test('dos opciones iguales no tienen cruce (anioCruce null)', () => {
  const r = cmp.breakEvenFondoVsEtf(fondo, { ...fondo, nombre: 'Igual' }, params, SimEngine);
  assert.strictEqual(r.anioCruce, null);
});
