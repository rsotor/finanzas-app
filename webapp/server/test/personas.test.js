// PERSONAS: quién hay en el hogar sale de la configuración, nunca del código.
const { test } = require('node:test');
const assert = require('node:assert');
const { leerPersonas } = require('../src/personas');
const { arrancar } = require('../test-helpers/helpers');

test('sin PERSONAS: la familia de ejemplo', () => {
  assert.deepStrictEqual(leerPersonas(undefined), [{ id: 'ana', nombre: 'Ana' }, { id: 'luis', nombre: 'Luis' }]);
});

test('1, 2 y 3 personas; el nombre es opcional', () => {
  assert.deepStrictEqual(leerPersonas('yo'), [{ id: 'yo', nombre: 'Yo' }]);
  assert.deepStrictEqual(leerPersonas('marta:Marta, jon:Jon Ander'), [{ id: 'marta', nombre: 'Marta' }, { id: 'jon', nombre: 'Jon Ander' }]);
  assert.strictEqual(leerPersonas('a:A,b:B,c:C').length, 3);
});

test('ids no válidos, repetidos o reservados no arrancan', () => {
  assert.throws(() => leerPersonas('Ana:Ana'), /id no válido/);
  assert.throws(() => leerPersonas('ana,ana'), /repetido/);
  assert.throws(() => leerPersonas('conjunto'), /reservado/);
  assert.throws(() => leerPersonas(' , '), /vacía/);
});

test('GET /api/config devuelve las personas configuradas', async (t) => {
  const s = await arrancar(t, { personas: 'marta:Marta,jon:Jon,leo:Leo' });
  const r = await s.pedir('GET', '/api/config');
  assert.deepStrictEqual([r.status, r.json.personas.map(p => p.id)], [200, ['marta', 'jon', 'leo']]);
});
