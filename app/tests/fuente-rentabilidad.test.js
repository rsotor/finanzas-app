const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const fr = require('../engine-fuente-rentabilidad.js');
const grey = require('../presets/grey-finanbest.json');
const metal = require('../presets/metal-myinvestor.json');
const cerca = (a, b, tol) => Math.abs(a - b) < (tol || 0.005);

test('I5: en el navegador, engine-fuente-rentabilidad.js no lee SimEngine.x en tiempo de carga (dependencias UMD perezosas)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine-fuente-rentabilidad.js'), 'utf8');
  const sandbox = {}; sandbox.window = sandbox;   // en el navegador window === globalThis
  assert.doesNotThrow(() => vm.runInNewContext(src, sandbox));   // sin module ni SimEngine definidos: no lanza
  assert.ok(sandbox.SimEngine.fuenteRentabilidad);
  sandbox.SimEngine.diversificacion = { volAnualDesdeRetornos: () => 12.34 };   // ahora sí se define la dependencia
  const v = sandbox.SimEngine.fuenteRentabilidad.volatilidad({ historicalReturns: { annual: { '2020': 1 } } });
  assert.strictEqual(v, 12.34);
});

test('coste anual = groupCosts + TER ponderado de fondos (pct anuales)', () => {
  assert.ok(cerca(fr.costeAnualPct(grey), 0.82));
  assert.ok(cerca(fr.costeAnualPct(metal), 0.40));
  assert.ok(cerca(fr.costeAnualPct({ groupCosts: [{ value: 0.1, unit: 'pct', type: 'annual' }],
    funds: [{ weight: 50, costs: [{ value: 0.2, unit: 'pct', type: 'annual' }] }, { weight: 50, costs: [] }] }), 0.2));
});

test('forward_neta = rentabilidad bruta por composición − costes', () => {
  const r = fr.resolver({ rentabilidad_fuente: 'forward_neta' }, grey);
  assert.ok(cerca(r.rentabilidad, 4.257), r.rentabilidad);
  assert.strictEqual(r.fuente, 'forward_neta');
  assert.strictEqual(r.faltaInfo, false);
  assert.ok(/5\.08|5,08/.test(r.detalle) && /0\.82|0,82/.test(r.detalle), r.detalle);
  assert.ok(cerca(fr.resolver({ rentabilidad_fuente: 'forward_neta' }, metal).rentabilidad, 5.60));
});

test('historica prefiere el anualizado del preset y si no, la media geométrica de años completos', () => {
  const g = fr.resolver({ rentabilidad_fuente: 'historica' }, grey);
  assert.strictEqual(g.rentabilidad, 3.82);
  assert.ok(/2017/.test(g.detalle));
  assert.ok(/MyInvestor/.test(g.detalle), g.detalle);
  const sinAnualizado = { historicalReturns: { annual: { '2020': 10, '2021': -10, '2022_ytd': 99 } } };
  const h = fr.historica(sinAnualizado);
  assert.ok(cerca(h.valor, (Math.sqrt(1.1 * 0.9) - 1) * 100));   // ignora el ytd
  assert.strictEqual(h.periodo, '2020-2021');
});

test('volatilidad anual desde los retornos del preset', () => {
  assert.ok(cerca(fr.volatilidad(grey), 5.988, 0.01));
  assert.ok(cerca(fr.volatilidad(metal), 14.30, 0.01));
  assert.strictEqual(fr.volatilidad({}), null);
});

test('forzada exige valor y nota; sin nota es faltaInfo', () => {
  const ok = fr.resolver({ rentabilidad_fuente: 'forzada', rentabilidad_forzada: 5, nota_origen: 'Supuesto: pedir a Indexa' }, null);
  assert.deepStrictEqual([ok.rentabilidad, ok.fuente, ok.faltaInfo, ok.volatilidad], [5, 'forzada', false, null]);
  const sinNota = fr.resolver({ rentabilidad_fuente: 'forzada', rentabilidad_forzada: 5 }, null);
  assert.strictEqual(sinNota.faltaInfo, true);
  assert.ok(sinNota.motivos.some(m => /nota/.test(m)));
});

test('m8: preset con funds pero sin ningún dato de costes (ni groupCosts ni fondos) → costeAnualPct null y forward_neta sin rentabilidad', () => {
  const preset = { name: 'Sin costes', funds: [{ weight: 100, alloc: { equity: 100, bond: 0, cash: 0, other: 0 }, costs: [] }] };
  assert.strictEqual(fr.costeAnualPct(preset), null);
  const r = fr.resolver({ rentabilidad_fuente: 'forward_neta' }, preset);
  assert.strictEqual(r.rentabilidad, null);
  assert.strictEqual(r.faltaInfo, true);
  assert.ok(r.motivos.includes('preset sin datos de costes'));
});

test('m13: forward_neta devuelve también rentBruta y coste; el detalle usa coma decimal', () => {
  const r = fr.resolver({ rentabilidad_fuente: 'forward_neta' }, grey);
  assert.ok(r.detalle.includes('5,08'));
  assert.ok(r.detalle.includes('0,82'));
  assert.ok(cerca(r.rentBruta, 5.077));
  assert.strictEqual(r.coste, 0.82);
});

test('sin preset (o sin lo necesario) → faltaInfo y rentabilidad null, nunca un valor por defecto', () => {
  const r = fr.resolver({ rentabilidad_fuente: 'forward_neta' }, null);
  assert.strictEqual(r.rentabilidad, null);
  assert.strictEqual(r.faltaInfo, true);
  const r2 = fr.resolver({ rentabilidad_fuente: 'historica' }, { funds: [] });
  assert.strictEqual(r2.rentabilidad, null);
  assert.strictEqual(r2.faltaInfo, true);
});
