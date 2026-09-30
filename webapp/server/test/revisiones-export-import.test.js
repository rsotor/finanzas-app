const { test } = require('node:test');
const assert = require('node:assert');
const { arrancar, datosMinimos } = require('../test-helpers/helpers');
const repo = require('../src/repo');

test('import valida y sustituye todo; export devuelve datos + resultados', async (t) => {
  const s = await arrancar(t);
  assert.strictEqual((await s.pedir('POST', '/api/import', {})).status, 400);
  assert.strictEqual((await s.pedir('POST', '/api/import', { datos: { supuestos: {}, conceptos: 'no' } })).status, 400);
  const d = datosMinimos();
  const i = await s.pedir('POST', '/api/import', { datos: d });
  assert.deepStrictEqual([i.status, i.json.contadores.conceptos], [200, 3]);
  const i2 = await s.pedir('POST', '/api/import', { datos: { ...d, conceptos: d.conceptos.slice(0, 1) } });
  assert.strictEqual(i2.json.contadores.conceptos, 1);                     // sustituye, no acumula
  const x = (await s.pedir('GET', '/api/export')).json;
  assert.strictEqual(x.fecha, '2026-09-02');
  assert.strictEqual(x.datos.carteras.length, 3);
  assert.ok(x.resultados.panel.proyeccion.veredicto);
  assert.ok(x.exportado_en);
});

// C2: import valida supuestos antes de escribir nada (antes solo se validaban las colecciones).
test('C2: import con supuestos inválidos (inflacion no numérica) es 400', async (t) => {
  const s = await arrancar(t);
  const d = datosMinimos();
  d.supuestos.inflacion = 'dos';
  assert.strictEqual((await s.pedir('POST', '/api/import', { datos: d })).status, 400);
});

// I2/C2: ids repetidos en el mismo lote — no es un problema de forma (cada objeto es válido por separado),
// lo atrapa la puerta final de escribirDatos: 422, nunca un 500 de la restricción PRIMARY KEY.
test('I2/C2: import con id repetido en el mismo lote es 422', async (t) => {
  const s = await arrancar(t);
  const d = datosMinimos();
  d.conceptos.push({ ...d.conceptos[0] });   // mismo id que uno ya presente en el lote
  const r = await s.pedir('POST', '/api/import', { datos: d });
  assert.deepStrictEqual([r.status, /id repetido/.test(r.json.detalle)], [422, true]);
});

// I2(c): orden: null se ignora — usa la posición en la lista, nunca intenta escribir NULL en la columna.
test('I2: import con orden: null en una fila usa el valor por defecto, no revienta', async (t) => {
  const s = await arrancar(t);
  const d = datosMinimos();
  d.conceptos[0].orden = null;
  const r = await s.pedir('POST', '/api/import', { datos: d });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(repo.obtener(s.db, 'conceptos', d.conceptos[0].id).orden, 0);
});

// I11: notas de supuestos (de dónde sale cada cifra) viaja por import/export y por la API.
test('I11: supuestos.notas viaja en import/export y por la API', async (t) => {
  const s = await arrancar(t);
  const d = datosMinimos();
  d.supuestos.notas = 'Inflación: Panel B17 (Excel, 06-sep-2026)';
  const r = await s.pedir('POST', '/api/import', { datos: d });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await s.pedir('GET', '/api/supuestos')).json.notas, d.supuestos.notas);
  assert.strictEqual((await s.pedir('GET', '/api/export')).json.datos.supuestos.notas, d.supuestos.notas);
});

// Recomendación 4: /export incluye el mayor updated_at de todo `datos`, para saber si hay algo más nuevo.
test('Recomendación 4: /export incluye max_updated_at', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const x = (await s.pedir('GET', '/api/export')).json;
  assert.ok(x.max_updated_at);
  const grey = repo.obtener(s.db, 'carteras', 'grey');
  assert.ok(x.max_updated_at >= grey.updated_at);
});

// I9: la revisión congela TODO lo que devolvía el motor (no solo la proyección) y con qué presets se calculó.
test('I9: la revisión congela resultados completos (resumen+panel) y la versión de los presets', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const r = await s.pedir('POST', '/api/revisiones', { nota: 'primera' });
  const v = (await s.pedir('GET', `/api/revisiones/${r.json.id}`)).json;
  assert.ok(v.resultados.resumen && v.resultados.panel);
  assert.strictEqual(v.resultados.panel.proyeccion.filas.length, 85);
  assert.ok(Array.isArray(v.presets) && v.presets.length > 0);
  assert.ok(v.presets[0].id && 'dataAsOf' in v.presets[0]);
  assert.strictEqual(v.proyeccion.filas.length, 85);   // proyeccion se mantiene por compatibilidad
});

test('cerrar revisión congela datos y proyección; sin datos calculables responde 422', async (t) => {
  const s = await arrancar(t);
  assert.strictEqual((await s.pedir('POST', '/api/revisiones', {})).status, 422);
  repo.escribirDatos(s.db, datosMinimos());
  const r = await s.pedir('POST', '/api/revisiones', { nota: 'primera' });
  assert.deepStrictEqual([r.status, r.json.fecha, r.json.nota], [201, '2026-09-02', 'primera']);
  repo.actualizar(s.db, 'carteras', 'grey', { aportacion_mensual: 999 });
  const v = (await s.pedir('GET', `/api/revisiones/${r.json.id}`)).json;
  assert.strictEqual(v.datos.carteras.find(c => c.id === 'grey').aportacion_mensual, 300);   // congelado
  assert.strictEqual(v.proyeccion.filas.length, 85);
  assert.deepStrictEqual((await s.pedir('GET', '/api/revisiones')).json.map(x => x.id), [r.json.id]);
});

// m9: borrar una revisión (lo usan los fixtures de test para dejar la BD limpia entre recorridos e2e).
test('m9: DELETE /api/revisiones/:id la quita; sobre un id inexistente es 404', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const r = await s.pedir('POST', '/api/revisiones', { nota: 'a borrar' });
  assert.strictEqual((await s.pedir('DELETE', `/api/revisiones/${r.json.id}`)).status, 204);
  assert.strictEqual((await s.pedir('GET', `/api/revisiones/${r.json.id}`)).status, 404);
  assert.strictEqual((await s.pedir('DELETE', '/api/revisiones/no-existe')).status, 404);
});
