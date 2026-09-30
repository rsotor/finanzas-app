const { test } = require('node:test');
const assert = require('node:assert');
const div = require('../engine-diversificacion.js');

test('solapamiento sectorial: carteras idénticas = 100%', () => {
  const sectors = [{ name: 'Tecnología', pct: 40 }, { name: 'Salud', pct: 60 }];
  assert.strictEqual(div.solapamientoSectorial(sectors, sectors), 100);
});

test('solapamiento sectorial: sin sectores comunes = 0%', () => {
  const a = [{ name: 'Tecnología', pct: 100 }];
  const b = [{ name: 'Energía', pct: 100 }];
  assert.strictEqual(div.solapamientoSectorial(a, b), 0);
});

test('correlación de Pearson: serie idéntica = 1', () => {
  const px = [100, 101, 99, 102, 105];
  const r = div.correlacionPearson(div.retornos(px), div.retornos(px));
  assert.ok(Math.abs(r - 1) < 1e-9);
});

test('correlación de Pearson: serie opuesta = -1', () => {
  const a = div.retornos([100, 110, 100, 110, 100]);
  const b = a.map(x => -x);
  const r = div.correlacionPearson(a, b);
  assert.ok(Math.abs(r + 1) < 1e-9);
});

test('alinearSeries empareja por fecha (start + off), no por índice', () => {
  const A = { start: '2021-01-01', points: { off: [0, 10, 20], px: [10, 11, 12] } };
  const B = { start: '2021-01-01', points: { off: [0, 20],     px: [20, 24] } };
  const out = div.alinearSeries(A, B);
  assert.deepStrictEqual(out.pxA, [10, 12]);
  assert.deepStrictEqual(out.pxB, [20, 24]);
});

test('correlacionCartera devuelve null si falta priceSeries (degradar a solapamiento)', () => {
  const funds = [{ weight: 50, priceSeries: null }, { weight: 50, priceSeries: null }];
  assert.strictEqual(div.correlacionCartera(funds), null);
});

test('volCartera estima volatilidad anual ponderada desde priceSeries', () => {
  const px = [100, 102, 101, 104, 103, 106]; // serie mensual sintética
  const funds = [{ weight: 100, priceSeries: { points: { px } } }];
  const v = div.volCartera(funds);
  assert.ok(v != null && v > 0, 'debe devolver una vol positiva');
});

test('volCartera devuelve null si no hay priceSeries', () => {
  assert.strictEqual(div.volCartera([{ weight: 100 }]), null);
});

test('volAnualDesdeRetornos = std dev muestral de los retornos anuales', () => {
  // [10, 20, 0] → media 10, varianza muestral ((0+100+100)/2)=100 → std 10
  const v = div.volAnualDesdeRetornos({ '2021': 10, '2022': 20, '2023': 0 });
  assert.ok(Math.abs(v - 10) < 1e-9);
});

test('volAnualDesdeRetornos excluye claves de año parcial (ytd)', () => {
  // solo 2021 y 2022 cuentan; 2026_ytd se ignora
  const v = div.volAnualDesdeRetornos({ '2021': 10, '2022': 20, '2026_ytd': 999 });
  // std muestral de [10,20] = sqrt(((5^2)+(5^2))/1)=sqrt(50)
  assert.ok(Math.abs(v - Math.sqrt(50)) < 1e-9);
});

test('volAnualDesdeRetornos devuelve null con menos de 2 años', () => {
  assert.strictEqual(div.volAnualDesdeRetornos({ '2021': 10 }), null);
  assert.strictEqual(div.volAnualDesdeRetornos({}), null);
  assert.strictEqual(div.volAnualDesdeRetornos(null), null);
});
