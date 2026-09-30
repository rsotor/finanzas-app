// Modo local: un hogar en su propio ordenador. Sin login, así que solo puede escuchar en 127.0.0.1.
const { test } = require('node:test');
const assert = require('node:assert');
const { crearAuth } = require('../src/auth');
const { hostPara } = require('../src/red');
const { arrancar } = require('../test-helpers/helpers');

test('local arranca también en producción e ignora x-dev-user', async (t) => {
  assert.doesNotThrow(() => crearAuth({ modo: 'local', produccion: true }));
  const s = await arrancar(t, { auth: { modo: 'local', produccion: true, localNombre: 'Marta' } });
  const r = await s.pedir('GET', '/api/yo', undefined, { 'x-dev-user': 'otro@x' });
  assert.deepStrictEqual(r.json, { tipo: 'persona', email: 'local', nombre: 'Marta' });
});

test('sin login nunca se escucha fuera de 127.0.0.1 (salvo HOST explícito en local, para Docker)', () => {
  assert.strictEqual(hostPara('local', {}), '127.0.0.1');
  assert.strictEqual(hostPara('dev', { HOST: '0.0.0.0' }), '127.0.0.1');
  assert.strictEqual(hostPara('local', { HOST: '0.0.0.0' }), '0.0.0.0');
  assert.strictEqual(hostPara('cloudflare', {}), '0.0.0.0');
});

test('un AUTH_MODE mal escrito no arranca', () => {
  assert.throws(() => crearAuth({ modo: 'locla' }), /AUTH_MODE desconocido/);
});
