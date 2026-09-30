const { test } = require('node:test');
const assert = require('node:assert');
const { arrancar, datosMinimos } = require('../test-helpers/helpers');
const repo = require('../src/repo');

test('crear escenario, verlo en el panel (vista previa) y aplicarlo a lo real', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const grey = repo.obtener(s.db, 'carteras', 'grey');
  const e = await s.pedir('POST', '/api/escenarios', { nombre: 'Moto', cambios: [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 700 }, valor_anterior: { aportacion_mensual: 300 } },
    { entidad: 'objetivos', id: 'tmp:1', operacion: 'crear', campos: { nombre: 'Moto', cartera_id: 'grey', tipo: 'unico', anio: 2028, importe: 8000, estado: 'activo' }, valor_anterior: null },
  ] });
  assert.strictEqual(e.status, 201);
  const previa = (await s.pedir('GET', `/api/panel?escenario=${e.json.id}`)).json;
  assert.strictEqual(previa.panel.carteras[0].aportas, 700);
  assert.strictEqual(previa.escenario, e.json.id);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 300);   // lo real intacto
  const metalAntes = repo.obtener(s.db, 'carteras', 'metal');
  const ap = await s.pedir('POST', `/api/escenarios/${e.json.id}/aplicar`, {});
  assert.deepStrictEqual([ap.status, ap.json.aplicado, ap.json.avisos], [200, true, []]);
  assert.strictEqual(s.db.inTransaction, false);   // A1: escribirDatos + borrarEscenario en una sola transacción
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 700);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'metal').updated_at, metalAntes.updated_at);   // A2: no la toca, no cambia
  const moto = repo.listar(s.db, 'objetivos').find(o => o.nombre === 'Moto');
  assert.ok(moto && !/^tmp:/.test(moto.id));
  assert.strictEqual((await s.pedir('GET', `/api/escenarios/${e.json.id}`)).status, 404);   // se borra al aplicar
  assert.ok(grey.updated_at);
});

test('aplicar con conflicto: 409 confirmable; con confirmar pisa; referencia temporal sin resolver nunca es confirmable', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'Viejo', cambios: [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 500 }, valor_anterior: { aportacion_mensual: 300 } },
  ] })).json;
  const g = repo.obtener(s.db, 'carteras', 'grey');
  repo.actualizar(s.db, 'carteras', 'grey', { aportacion_mensual: 350 }, g.updated_at);      // Luis lo cambió
  const r1 = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, {});
  assert.deepStrictEqual([r1.status, r1.json.confirmable, r1.json.avisos[0].tipo], [409, true, 'conflicto']);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 350);
  const r2 = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { confirmar: true });
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 500);
  // el aviso 'duplicado' es inalcanzable por la API (los ids los genera randomUUID); está cubierto en app/tests/escenario.test.js
  const ref = (await s.pedir('POST', '/api/escenarios', { nombre: 'Ref', cambios: [
    { entidad: 'objetivos', id: 'tmp:9', operacion: 'crear', campos: { nombre: 'Huérfano', cartera_id: 'tmp:1', anio: 2030, importe: 1 }, valor_anterior: null },
  ] })).json;
  const r3 = await s.pedir('POST', `/api/escenarios/${ref.id}/aplicar`, { confirmar: true });
  assert.deepStrictEqual([r3.status, r3.json.confirmable, r3.json.avisos[0].tipo], [409, false, 'referencia_temporal']);
  assert.strictEqual(repo.listar(s.db, 'objetivos').length, 2);
});

// C2: forma de cada delta al guardar el escenario.
test('C2: guardar un escenario valida la forma de cada delta', async (t) => {
  const s = await arrancar(t);
  const malTipo = await s.pedir('POST', '/api/escenarios', { nombre: 'x', cambios: [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 'mil' }, valor_anterior: null },
  ] });
  assert.strictEqual(malTipo.status, 400);
  const malEntidad = await s.pedir('POST', '/api/escenarios', { nombre: 'x', cambios: [
    { entidad: 'nada', id: 'x', operacion: 'modificar', campos: {}, valor_anterior: null },
  ] });
  assert.strictEqual(malEntidad.status, 400);
});

// C2: un delta se guarda bien (tipos correctos) pero, aplicado, deja un obligatorio a null — la puerta
// final es escribirDatos: 422 y lo real no cambia.
test('C2: un delta válido guardado que deja un obligatorio a null falla al aplicar (422), lo real no cambia', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const antes = repo.obtener(s.db, 'conceptos', 'c-nomina');
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'Rompe', cambios: [
    { entidad: 'conceptos', id: 'c-nomina', operacion: 'modificar', campos: { nombre: null }, valor_anterior: null },
  ] })).json;
  assert.ok(e.id);   // se guardó sin problema
  const ap = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, {});
  assert.deepStrictEqual([ap.status, ap.json.error], [422, 'datos no válidos']);
  assert.strictEqual(repo.obtener(s.db, 'conceptos', 'c-nomina').nombre, antes.nombre);
});

// I4: un huérfano (delta sobre un id que ya no existe) no bloquea el resto del escenario.
test('I4: un huérfano no bloquea — aplica igual y viaja como aviso en el 200', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  repo.borrar(s.db, 'objetivos', 'o-coche');
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'x', cambios: [
    { entidad: 'objetivos', id: 'o-coche', operacion: 'modificar', campos: { importe: 1 }, valor_anterior: null },
  ] })).json;
  const ap = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, {});
  assert.deepStrictEqual([ap.status, ap.json.avisos[0].tipo], [200, 'huerfano']);
});

// I5: confirmar acepta una lista de índices de `cambios` — solo esos se escriben, el resto sigue como aviso.
test('I5: confirmar por índice — el confirmado se escribe, el otro no y viene como aviso con su índice', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'Dos', cambios: [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 500 }, valor_anterior: { aportacion_mensual: 300 } },
    { entidad: 'carteras', id: 'metal', operacion: 'modificar', campos: { aportacion_mensual: 900 }, valor_anterior: { aportacion_mensual: 300 } },
  ] })).json;
  const grey = repo.obtener(s.db, 'carteras', 'grey');
  const metal = repo.obtener(s.db, 'carteras', 'metal');
  repo.actualizar(s.db, 'carteras', 'grey', { aportacion_mensual: 350 }, grey.updated_at);     // Luis cambió las dos
  repo.actualizar(s.db, 'carteras', 'metal', { aportacion_mensual: 360 }, metal.updated_at);
  const r1 = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { confirmar: [0] });
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 500);        // confirmado: se escribe
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'metal').aportacion_mensual, 360);       // no confirmado: sigue como estaba
  assert.deepStrictEqual(r1.json.avisos.map(a => [a.entidad, a.indice]), [['carteras', 1]]);
});

// I5: un conflicto no confirmado no se descarta con el resto del escenario (se perdía en silencio); su
// índice original viaja en `no_aplicados`. Y `confirmar: []` cuenta como "nada confirmado" (409 sigue).
test('I5: un cambio en conflicto sin confirmar vuelve al escenario (no_aplicados); confirmar: [] sigue en 409', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'Dos', cambios: [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 500 }, valor_anterior: { aportacion_mensual: 300 } },
    { entidad: 'carteras', id: 'metal', operacion: 'modificar', campos: { aportacion_mensual: 900 }, valor_anterior: { aportacion_mensual: 300 } },
  ] })).json;
  const grey = repo.obtener(s.db, 'carteras', 'grey');
  const metal = repo.obtener(s.db, 'carteras', 'metal');
  repo.actualizar(s.db, 'carteras', 'grey', { aportacion_mensual: 350 }, grey.updated_at);
  repo.actualizar(s.db, 'carteras', 'metal', { aportacion_mensual: 360 }, metal.updated_at);
  const vacio = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { confirmar: [] });
  assert.deepStrictEqual([vacio.status, vacio.json.confirmable], [409, true]);   // confirmar: [] = nada confirmado
  const r = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { confirmar: [0] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 500);    // confirmado: escrito
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'metal').aportacion_mensual, 360);   // no confirmado: intacto
  assert.deepStrictEqual(r.json.no_aplicados, [1]);
  const queda = (await s.pedir('GET', `/api/escenarios/${e.id}`)).json;
  assert.strictEqual(queda.cambios.length, 1);   // el no aplicado sigue en el escenario, no se perdió
  assert.strictEqual(queda.cambios[0].id, 'metal');
});

// I3: aplicar un escenario sin cambios sobre supuestos no debe renovar su updated_at.
test('I3: aplicar un escenario vacío no cambia el updated_at de supuestos', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const antes = repo.leerSupuestos(s.db);
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'Vacío', cambios: [] })).json;
  const ap = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, {});
  assert.strictEqual(ap.status, 200);
  assert.strictEqual(repo.leerSupuestos(s.db).updated_at, antes.updated_at);
});

test('PUT/DELETE de escenarios y validación de cambios', async (t) => {
  const s = await arrancar(t);
  assert.strictEqual((await s.pedir('POST', '/api/escenarios', { nombre: 'x', cambios: 'no' })).status, 400);
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'x' })).json;
  const p = await s.pedir('PUT', `/api/escenarios/${e.id}`, { nombre: 'y', cambios: [], updated_at: e.updated_at });
  assert.deepStrictEqual([p.status, p.json.nombre], [200, 'y']);
  assert.strictEqual((await s.pedir('PUT', `/api/escenarios/${e.id}`, { nombre: 'z', updated_at: e.updated_at })).status, 409);
  assert.strictEqual((await s.pedir('DELETE', `/api/escenarios/${e.id}`)).status, 204);
  assert.deepStrictEqual((await s.pedir('GET', '/api/escenarios')).json, []);
});

test('ronda 2: aplicar solo algunos cambios (indices) escribe esos y deja el resto en el escenario', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const e = (await s.pedir('POST', '/api/escenarios', { nombre: 'Parcial', cambios: [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 900 }, valor_anterior: { aportacion_mensual: 300 } },
    { entidad: 'carteras', id: 'metal', operacion: 'modificar', campos: { aportacion_mensual: 50 }, valor_anterior: { aportacion_mensual: 300 } },
    { entidad: 'supuestos', id: null, operacion: 'modificar', campos: { inflacion: 3 }, valor_anterior: { inflacion: 2.75 } },
  ] })).json;
  assert.strictEqual((await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { indices: [7] })).status, 400);
  assert.strictEqual((await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { indices: [] })).status, 400);
  const r = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { indices: [0, 2] });
  assert.deepStrictEqual([r.status, r.json.aplicado, r.json.restantes], [200, true, 1]);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'grey').aportacion_mensual, 900);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'metal').aportacion_mensual, 300);      // no elegido: intacto
  assert.strictEqual(repo.leerSupuestos(s.db).inflacion, 3);
  const queda = (await s.pedir('GET', `/api/escenarios/${e.id}`)).json;
  assert.strictEqual(queda.cambios.length, 1);
  assert.strictEqual(queda.cambios[0].id, 'metal');
  // el aviso de conflicto de un cambio elegido lleva el índice ORIGINAL (ahora 0 en el escenario restante)
  const g = repo.obtener(s.db, 'carteras', 'metal');
  repo.actualizar(s.db, 'carteras', 'metal', { aportacion_mensual: 310 }, g.updated_at);
  const c = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { indices: [0] });
  assert.deepStrictEqual([c.status, c.json.avisos[0].tipo, c.json.avisos[0].indice], [409, 'conflicto', 0]);
  const ok = await s.pedir('POST', `/api/escenarios/${e.id}/aplicar`, { indices: [0], confirmar: [0] });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(repo.obtener(s.db, 'carteras', 'metal').aportacion_mensual, 50);
  assert.strictEqual((await s.pedir('GET', `/api/escenarios/${e.id}`)).status, 404);   // sin restantes: se borra
});

// 005: el autor del escenario lo fija el servidor con la identidad autenticada; /api/yo dice quién soy.
test('creado_por sale de la identidad, no del cuerpo; /api/yo devuelve nombre y email', async (t) => {
  const s = await arrancar(t);
  const yo = await s.pedir('GET', '/api/yo');
  assert.deepStrictEqual([yo.status, yo.json.nombre, yo.json.email], [200, 'ana', 'ana@test']);
  const mio = await s.pedir('POST', '/api/escenarios', { nombre: 'Mío', cambios: [], creado_por: 'impostor' });
  assert.deepStrictEqual([mio.status, mio.json.creado_por], [201, 'ana']);
  const suyo = await s.pedir('POST', '/api/escenarios', { nombre: 'Suyo', cambios: [] }, { 'x-dev-user': 'luis@test' });
  assert.strictEqual(suyo.json.creado_por, 'luis');
  const lista = (await s.pedir('GET', '/api/escenarios')).json;
  assert.deepStrictEqual(lista.map(e => e.creado_por), ['ana', 'luis']);
});
