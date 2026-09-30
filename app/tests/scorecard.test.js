const { test } = require('node:test');
const assert = require('node:assert');
const card = require('../engine-scorecard.js');

// Preset mínimo con los campos necesarios para los 6 ejes v1
const preset = {
  mandate: 'self-directed',
  funds: [
    {
      weight: 88,
      structure: 'passive-index',
      categoryMorningstar: 'RV Global Cap. Grande Blend',
      costs: [{ name: 'TER', value: 0.20, unit: 'pct', type: 'annual' }],
    },
    {
      weight: 12,
      structure: 'passive-index',
      categoryMorningstar: 'RV Global Emergente',
      costs: [{ name: 'TER', value: 0.20, unit: 'pct', type: 'annual' }],
    },
  ],
};

test('produce exactamente los 6 ejes del spec v1', () => {
  const r = card.computeCarteraScore(preset);
  const keys = r.ejes.map(e => e.key).sort();
  assert.deepStrictEqual(keys, ['coste', 'diversificacion', 'eficienciaFiscal', 'encaje', 'estructura', 'tamano'].sort());
});

test('encaje queda N/D cuando no hay rvTope (sin perfil)', () => {
  const r = card.computeCarteraScore(preset);
  const encaje = r.ejes.find(e => e.key === 'encaje');
  assert.strictEqual(encaje.available, false);
  assert.strictEqual(encaje.score, null);
});

test('tamano queda N/D cuando los fondos no tienen campo aum', () => {
  const r = card.computeCarteraScore(preset);
  const tamano = r.ejes.find(e => e.key === 'tamano');
  assert.strictEqual(tamano.available, false);
  assert.strictEqual(tamano.score, null);
});

test('el coste de ~0.20% puntúa alto (cartera barata)', () => {
  const r = card.computeCarteraScore(preset);
  const coste = r.ejes.find(e => e.key === 'coste');
  assert.ok(coste.available && coste.score >= 80);
});

test('el overall ignora los ejes no disponibles (renormaliza)', () => {
  const r = card.computeCarteraScore(preset);
  assert.ok(r.overall > 0 && r.overall <= 100);
  const disponibles = r.ejes.filter(e => e.available);
  assert.ok(disponibles.every(e => e.score !== null));
});

test('ETF detectado por vehiculo:"etf" → eficienciaFiscal baja a 40', () => {
  const etf = { vehiculo: 'etf', funds: [{ weight: 100, structure: 'passive-index', costs: [{ name: 'TER', value: 0.19, unit: 'pct', type: 'annual' }] }] };
  const r = card.computeCarteraScore(etf);
  const ef = r.ejes.find(e => e.key === 'eficienciaFiscal');
  assert.strictEqual(ef.score, 40);
});

test('fondo traspasable → eficienciaFiscal puntúa 95', () => {
  const r = card.computeCarteraScore(preset);
  const ef = r.ejes.find(e => e.key === 'eficienciaFiscal');
  assert.strictEqual(ef.score, 95);
});

test('passive-index puntúa 100 en estructura', () => {
  const r = card.computeCarteraScore(preset);
  const est = r.ejes.find(e => e.key === 'estructura');
  assert.strictEqual(est.score, 100);
});

test('active-fof puntúa 30 en estructura', () => {
  const p = { funds: [{ weight: 100, structure: 'active-fof', costs: [] }] };
  const r = card.computeCarteraScore(p);
  const est = r.ejes.find(e => e.key === 'estructura');
  assert.strictEqual(est.score, 30);
});

test('una cartera vacía no puntúa (overall null)', () => {
  const r = card.computeCarteraScore({ funds: [] });
  assert.strictEqual(r.overall, null);
});

test('el resultado informa de la cobertura (ejes disponibles vs total)', () => {
  const r = card.computeCarteraScore(preset);
  assert.strictEqual(r.cobertura.total, 6);
  // Con preset sin AUM ni rvTope → tamano y encaje son N/D
  assert.ok(r.cobertura.disponibles <= 4);
  assert.ok(Array.isArray(r.cobertura.pendientes) && r.cobertura.pendientes.includes('encaje'));
  assert.ok(r.cobertura.pendientes.includes('tamano'));
});

test('el eje de coste incluye los groupCosts (custodia, gestión de grupo)', () => {
  const conGroup = {
    mandate: 'discretionary',
    funds: [{ weight: 100, structure: 'passive-index', costs: [{ name: 'TER', value: 0.10, unit: 'pct', type: 'annual' }] }],
    groupCosts: [{ name: 'Custodia', value: 0.15, unit: 'pct', type: 'annual' }],
  };
  const r = card.computeCarteraScore(conGroup);
  const coste = r.ejes.find(e => e.key === 'coste');
  assert.ok(coste.value.startsWith('0.25'), 'el coste mostrado debe incluir el groupCost: ' + coste.value);
});

test('costeTotalAnual suma coste ponderado de fondos y groupCosts', () => {
  const funds = [{ weight: 100, costs: [{ type: 'annual', unit: 'pct', value: 0.3 }] }];
  const groupCosts = [{ type: 'annual', unit: 'pct', value: 0.1 }];
  const c = card.costeTotalAnual(funds, groupCosts);
  assert.ok(Math.abs(c - 0.4) < 1e-9);
});

test('tamano puntúa correctamente cuando hay aum en los fondos', () => {
  const conAum = {
    funds: [
      { weight: 100, structure: 'passive-index',
        aum: 25789607181, // ~25.8B€ → debe interpolar hacia 100
        costs: [{ name: 'TER', value: 0.06, unit: 'pct', type: 'annual' }] }
    ]
  };
  const r = card.computeCarteraScore(conAum);
  const tam = r.ejes.find(e => e.key === 'tamano');
  assert.ok(tam.available, 'tamano debe estar disponible con aum');
  assert.ok(tam.score >= 90, 'AUM de 25B debe puntuar >= 90, actual: ' + tam.score);
});

test('ACWI (global + emergentes) puntúa 95 en diversificacion', () => {
  const acwi = {
    funds: [
      { weight: 88, structure: 'passive-index', categoryMorningstar: 'RV Global Cap. Grande Blend', costs: [] },
      { weight: 12, structure: 'passive-index', categoryMorningstar: 'RV Global Emergente', costs: [] },
    ]
  };
  const r = card.computeCarteraScore(acwi);
  const div = r.ejes.find(e => e.key === 'diversificacion');
  assert.strictEqual(div.score, 95);
});
