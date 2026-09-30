const { test } = require('node:test');
const assert = require('node:assert');
const Global = require('../engine-global.js');

test('agregarGlobal pondera coste y score por importe', () => {
  const carteras = [
    { label: 'Largo', importe: 30000, overall: 80, costeAnualPct: 0.2, funds: [{ weight: 100 }] },
    { label: 'Medio', importe: 10000, overall: 60, costeAnualPct: 0.5, funds: [{ weight: 100 }] },
  ];
  const r = Global.agregarGlobal(carteras);
  assert.strictEqual(r.totalImporte, 40000);
  // coste pond = (0.2*30000 + 0.5*10000)/40000 = 0.275
  assert.ok(Math.abs(r.costeAnualPctPond - 0.275) < 1e-9);
  // score pond = round((80*30000 + 60*10000)/40000) = 75
  assert.strictEqual(r.scorePond, 75);
  assert.strictEqual(r.bloques[0].peso, 75);
});

test('agregarGlobal marca diversificación degradada si no hay correlación', () => {
  const carteras = [{ label: 'A', importe: 10000, overall: 70, costeAnualPct: 0.3, funds: [{ weight: 100 }] }];
  const r = Global.agregarGlobal(carteras);
  assert.strictEqual(r.diversificacion.degradado, true);
});

test('agregarGlobal ignora carteras con overall null en el score ponderado', () => {
  const carteras = [
    { label: 'A', importe: 10000, overall: null, costeAnualPct: 0.3, funds: [] },
    { label: 'B', importe: 10000, overall: 90, costeAnualPct: 0.3, funds: [] },
  ];
  assert.strictEqual(Global.agregarGlobal(carteras).scorePond, 90);
});

test('agregarGlobal excluye carteras con costeAnualPct null del coste ponderado', () => {
  const carteras = [
    { label: 'A', importe: 10000, overall: 70, costeAnualPct: null, funds: [] },
    { label: 'B', importe: 10000, overall: 80, costeAnualPct: 0.4, funds: [] },
  ];
  const r = Global.agregarGlobal(carteras);
  // solo B tiene coste → coste pond = 0.4 (no 0.2)
  assert.ok(Math.abs(r.costeAnualPctPond - 0.4) < 1e-9);
});

test('agregarGlobal propaga id en cada bloque', () => {
  const carteras = [
    { id: 'largo', label: 'Largo plazo', importe: 30000, overall: 80, costeAnualPct: 0.2, funds: [] },
    { id: 'medio', label: 'Medio plazo', importe: 10000, overall: 60, costeAnualPct: 0.5, funds: [] },
  ];
  const r = Global.agregarGlobal(carteras);
  assert.strictEqual(r.bloques[0].id, 'largo');
  assert.strictEqual(r.bloques[1].id, 'medio');
});

test('agregarGlobal propaga composicion con name y weight desde funds', () => {
  const carteras = [
    {
      id: 'largo',
      label: 'Largo plazo',
      importe: 20000,
      overall: 80,
      costeAnualPct: 0.2,
      funds: [
        { name: 'Fondo A', weight: 70, alloc: {} },
        { name: 'Fondo B', weight: 30, alloc: {} },
      ],
    },
  ];
  const r = Global.agregarGlobal(carteras);
  const comp = r.bloques[0].composicion;
  assert.ok(Array.isArray(comp), 'composicion debe ser un array');
  assert.strictEqual(comp.length, 2);
  assert.strictEqual(comp[0].name, 'Fondo A');
  assert.strictEqual(comp[0].weight, 70);
  assert.strictEqual(comp[1].name, 'Fondo B');
  assert.strictEqual(comp[1].weight, 30);
  // No deben aparecer campos extra (alloc, etc.)
  assert.deepStrictEqual(Object.keys(comp[0]).sort(), ['name', 'weight']);
});

test('agregarGlobal: composicion es array vacio si funds esta vacio', () => {
  const carteras = [
    { id: 'colchon', label: 'Colchón', importe: 5000, overall: 50, costeAnualPct: 0.1, funds: [] },
  ];
  const r = Global.agregarGlobal(carteras);
  assert.deepStrictEqual(r.bloques[0].composicion, []);
});

test('agregarGlobal: bloque sin id propaga id undefined (no inventa)', () => {
  const carteras = [
    { label: 'Sin ID', importe: 10000, overall: 70, costeAnualPct: 0.3, funds: [] },
  ];
  const r = Global.agregarGlobal(carteras);
  // Si la entrada no trae id, no se inventa nada (undefined es correcto)
  assert.ok(!r.bloques[0].id, 'id debe ser falsy cuando la entrada no trae id');
});
