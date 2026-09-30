const { test } = require('node:test');
const assert = require('node:assert');
const { arrancar } = require('../test-helpers/helpers');

test('CRUD de una colección con control optimista', async (t) => {
  const s = await arrancar(t);
  const malo = await s.pedir('POST', '/api/objetivos', { nombre: 'Coche' });
  assert.deepStrictEqual([malo.status, /anio/.test(malo.json.error)], [400, true]);
  const conId = await s.pedir('POST', '/api/objetivos', { id: 'o-x', nombre: 'Coche', anio: 2031 });   // A3: el id lo asigna el servidor
  assert.deepStrictEqual([conId.status, conId.json.error], [400, 'el id lo asigna el servidor']);
  assert.deepStrictEqual((await s.pedir('POST', '/api/objetivos', { nombre: 'Coche', anio: 'mil' })).status, 400);   // A4: anio no numérico
  const creado = await s.pedir('POST', '/api/objetivos', { nombre: 'Coche', anio: 2031, importe: 35000, cartera_id: 'grey', tipo: 'unico' });
  assert.strictEqual(creado.status, 201);
  const o = creado.json;
  assert.ok(o.id && o.updated_at);
  assert.strictEqual(o.estado, 'activo');
  assert.deepStrictEqual((await s.pedir('GET', '/api/objetivos')).json.map(x => x.id), [o.id]);
  const conOrdenMalo = await s.pedir('POST', '/api/objetivos', { nombre: 'Moto', anio: 2030, orden: 'a' });   // A5
  assert.strictEqual(conOrdenMalo.status, 400);
  const conOrden = await s.pedir('POST', '/api/objetivos', { nombre: 'Moto', anio: 2030, orden: 5 });
  assert.deepStrictEqual([conOrden.status, conOrden.json.orden], [201, 5]);
  const ok = await s.pedir('PUT', `/api/objetivos/${o.id}`, { importe: 36000, updated_at: o.updated_at });
  assert.deepStrictEqual([ok.status, ok.json.importe], [200, 36000]);
  const viejo = await s.pedir('PUT', `/api/objetivos/${o.id}`, { importe: 1, updated_at: o.updated_at });
  assert.deepStrictEqual([viejo.status, viejo.json.actual.importe], [409, 36000]);
  assert.strictEqual((await s.pedir('PUT', `/api/objetivos/${o.id}`, { color: 'rojo', updated_at: ok.json.updated_at })).status, 400);
  assert.strictEqual((await s.pedir('DELETE', `/api/objetivos/${o.id}`)).status, 204);
  assert.strictEqual((await s.pedir('GET', `/api/objetivos/${o.id}`)).status, 404);
  assert.strictEqual((await s.pedir('GET', '/api/loquesea')).status, 404);
});

test('supuestos: registro único con PUT y conflicto', async (t) => {
  const s = await arrancar(t);
  assert.strictEqual((await s.pedir('GET', '/api/supuestos')).json, null);
  const p = await s.pedir('PUT', '/api/supuestos', { fecha: '2026-09-02', inflacion: 2.75, incremento_aportacion: 1, impuestos: 'plano', tipo_plano: 22, paro: { ana: { importe: 1150, meses: null } } });
  assert.strictEqual(p.status, 200);
  assert.deepStrictEqual(p.json.paro, { ana: { importe: 1150, meses: null } });
  const c = await s.pedir('PUT', '/api/supuestos', { inflacion: 3, updated_at: 'desfasado' });
  assert.strictEqual(c.status, 409);
  assert.strictEqual((await s.pedir('GET', '/api/supuestos')).json.inflacion, 2.75);
  assert.strictEqual((await s.pedir('PUT', '/api/supuestos', { inflacion: '3' })).status, 400);   // A4: numérico
});

// I2: fecha/inflación/incremento_aportacion/impuestos/base_fiscal_inicial nunca pueden quedar vacíos —
// sin ellos el motor no calcula. Solo se comprueba si el campo viene en el body (un PUT parcial que no
// lo toca no debe fallar por esto).
test('I2: los supuestos obligatorios no admiten null ni vacío', async (t) => {
  const s = await arrancar(t);
  await s.pedir('PUT', '/api/supuestos', { fecha: '2026-09-02', inflacion: 2.75, incremento_aportacion: 1, impuestos: 'tramos_reales', base_fiscal_inicial: 'aportado' });
  const sinInflacion = await s.pedir('PUT', '/api/supuestos', { inflacion: null });
  assert.deepStrictEqual([sinInflacion.status, sinInflacion.json.error], [400, 'la inflación es obligatoria']);
  assert.strictEqual((await s.pedir('GET', '/api/supuestos')).json.inflacion, 2.75);   // no se tocó
  assert.strictEqual((await s.pedir('PUT', '/api/supuestos', { fecha: '' })).status, 400);
  assert.strictEqual((await s.pedir('PUT', '/api/supuestos', { impuestos: null })).status, 400);
  assert.strictEqual((await s.pedir('PUT', '/api/supuestos', { base_fiscal_inicial: null })).status, 400);
  assert.strictEqual((await s.pedir('PUT', '/api/supuestos', { incremento_aportacion: null })).status, 400);
  // meses_colchon y notas SÍ pueden quedar vacíos: no están en la lista de obligatorios.
  assert.strictEqual((await s.pedir('PUT', '/api/supuestos', { meses_colchon: null })).status, 200);
});

test('validación de tipos (A4) en POST, PUT, supuestos e import', async (t) => {
  const s = await arrancar(t);
  assert.strictEqual((await s.pedir('POST', '/api/objetivos', { nombre: 'x', importe: 'mil', anio: 2031 })).status, 400);
  assert.strictEqual((await s.pedir('POST', '/api/cuentas', { nombre: 'x', tipo: 'liquidez', saldo: 1, rol: 'jefe' })).status, 400);
  const imp = await s.pedir('POST', '/api/import', { datos: { supuestos: { fecha: '2026-09-02', inflacion: 1, incremento_aportacion: 1 },
    conceptos: [{ nombre: 'x', tipo: 'gasto', categoria: 'indispensable', importe: 1, periodicidad: 'semanal' }] } });
  assert.deepStrictEqual([imp.status, /conceptos/.test(imp.json.error)], [400, true]);
});

// I2: valores no escalares en un campo de texto, o un boolean donde no toca, son 400 (nunca un 500 de SQLite).
test('I2: entradas plausibles nunca dan 500', async (t) => {
  const s = await arrancar(t);
  const nombreObjeto = await s.pedir('POST', '/api/objetivos', { nombre: { es: 'Coche' }, anio: 2031 });
  assert.deepStrictEqual([nombreObjeto.status, /nombre/.test(nombreObjeto.json.error)], [400, true]);
  const titularBoolean = await s.pedir('POST', '/api/cuentas', { nombre: 'x', tipo: 'liquidez', saldo: 1, titular: true });
  assert.deepStrictEqual([titularBoolean.status, /titular/.test(titularBoolean.json.error)], [400, true]);
  const creado = await s.pedir('POST', '/api/objetivos', { nombre: 'Coche', anio: 2031 });
  const putNull = await s.pedir('PUT', `/api/objetivos/${creado.json.id}`, { nombre: null, updated_at: creado.json.updated_at });
  assert.strictEqual(putNull.status, 400);
  // orden: null se ignora — el POST usa el defecto (0), no revienta el NOT NULL de la columna.
  const conOrdenNulo = await s.pedir('POST', '/api/objetivos', { nombre: 'Moto', anio: 2030, orden: null });
  assert.deepStrictEqual([conOrdenNulo.status, conOrdenNulo.json.orden], [201, 0]);
});

// m9: reordenar toda una colección de una vez, sin tocar updated_at.
test('m9: PUT /api/:col/orden reordena sin tocar updated_at; ids desconocidos son 400', async (t) => {
  const s = await arrancar(t);
  const a = (await s.pedir('POST', '/api/objetivos', { nombre: 'A', anio: 2030 })).json;
  const b = (await s.pedir('POST', '/api/objetivos', { nombre: 'B', anio: 2031 })).json;
  const r = await s.pedir('PUT', '/api/objetivos/orden', { ids: [b.id, a.id] });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.map(x => x.id), [b.id, a.id]);   // listar() ordena por orden asc
  assert.strictEqual(r.json.find(x => x.id === a.id).updated_at, a.updated_at);
  assert.strictEqual(r.json.find(x => x.id === b.id).updated_at, b.updated_at);
  assert.strictEqual((await s.pedir('PUT', '/api/objetivos/orden', { ids: ['no-existe'] })).status, 400);
});

test('C2: JSON mal formado de verdad (cuerpo crudo, no un string JSON válido)', async (t) => {
  const s = await arrancar(t);
  const crudo = await s.pedir('POST', '/api/conceptos', '{ esto no es json', {}, { crudo: true });
  assert.deepStrictEqual([crudo.status, crudo.json], [400, { error: 'JSON mal formado' }]);
});

// 004: `detalles` es texto libre de la cuenta (entidad, IBAN, acceso…): se guarda, se devuelve y se puede vaciar.
test('cuentas.detalles: texto libre que se guarda, se devuelve y se vacía', async (t) => {
  const s = await arrancar(t);
  const texto = 'Banco B · ES00 1234 · acceso con la app de Luis';
  const c = (await s.pedir('POST', '/api/cuentas', { nombre: 'Colchón', tipo: 'liquidez', saldo: 1, detalles: texto })).json;
  assert.strictEqual(c.detalles, texto);
  assert.strictEqual((await s.pedir('GET', '/api/cuentas')).json.find(x => x.id === c.id).detalles, texto);
  const vaciada = await s.pedir('PUT', `/api/cuentas/${c.id}`, { detalles: null, updated_at: c.updated_at });
  assert.deepStrictEqual([vaciada.status, vaciada.json.detalles], [200, null]);
});

// 006: la regla de aportación de una cuenta personal es JSON: se guarda y se devuelve como objeto, se vacía con null
// (vuelve a valer lo tecleado) y una mal formada se rechaza, también dentro de un delta de escenario.
test('cuentas.aportacion_regla: objeto que se guarda, se devuelve, se vacía y se valida', async (t) => {
  const s = await arrancar(t);
  const regla = { porcentaje: 10, base: [{ concepto_id: 'ig-6', parte: 100 }, { concepto_id: 'ig-34', parte: 50 }] };
  const c = (await s.pedir('POST', '/api/cuentas', { nombre: 'Cuentas Ana', tipo: 'liquidez', rol: 'personal', saldo: 1, aportacion_regla: regla })).json;
  assert.deepStrictEqual(c.aportacion_regla, regla);
  assert.deepStrictEqual((await s.pedir('GET', '/api/cuentas')).json.find(x => x.id === c.id).aportacion_regla, regla);
  const vaciada = await s.pedir('PUT', `/api/cuentas/${c.id}`, { aportacion_regla: null, updated_at: c.updated_at });
  assert.deepStrictEqual([vaciada.status, vaciada.json.aportacion_regla], [200, null]);
  for (const mala of [{ porcentaje: '10', base: [] }, { porcentaje: 10 }, { porcentaje: 10, base: [{ parte: 50 }] }, { porcentaje: 10, base: [{ concepto_id: 'x', parte: -1 }] }, [1]]) {
    const r = await s.pedir('POST', '/api/cuentas', { nombre: 'Mala', tipo: 'liquidez', saldo: 1, aportacion_regla: mala });
    assert.strictEqual(r.status, 400, JSON.stringify(mala));
    assert.match(r.json.error, /aportacion_regla/);
  }
  const repo = require('../src/repo');
  assert.match(repo.validarTiposDelta('cuentas', { aportacion_regla: { porcentaje: 10, base: 'x' } }), /aportacion_regla/);
  assert.strictEqual(repo.validarTiposDelta('cuentas', { aportacion_regla: regla }), null);
});
