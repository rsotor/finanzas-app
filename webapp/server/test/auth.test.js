const { test } = require('node:test');
const assert = require('node:assert');
const { generateKeyPair, SignJWT } = require('jose');
const { arrancar } = require('../test-helpers/helpers');
const { crearAuth } = require('../src/auth');

test('modo dev: identidad por cabecera o por defecto; prohibido en producción', async (t) => {
  const s = await arrancar(t);
  assert.deepStrictEqual((await s.pedir('GET', '/api/yo')).json, { tipo: 'persona', email: 'ana@test', nombre: 'ana' });
  assert.deepStrictEqual((await s.pedir('GET', '/api/yo', undefined, { 'x-dev-user': 'luis@test' })).json, { tipo: 'persona', email: 'luis@test', nombre: 'luis' });
  assert.throws(() => crearAuth({ modo: 'dev', produccion: true }), /prohibido en producción/);
  assert.doesNotThrow(() => crearAuth({ modo: 'dev', produccion: false }));   // C1: solo lanza si produccion es true
});

test('modo dev: AUTH_DEV_NOMBRE fija el nombre aunque cambie el email por cabecera', async (t) => {
  const s = await arrancar(t, { auth: { modo: 'dev', devEmail: 'ana@test', devNombre: 'Ana' } });
  assert.deepStrictEqual((await s.pedir('GET', '/api/yo')).json, { tipo: 'persona', email: 'ana@test', nombre: 'Ana' });
});

test('modo cloudflare: sin jwks ni teamDomain, lanza al crear (B1)', () => {
  assert.throws(() => crearAuth({ modo: 'cloudflare', aud: 'aud-finanzas' }), /falta CF_TEAM_DOMAIN/);
});

test('modo cloudflare: JWT válido de persona permitida, de servicio, y rechazos', async (t) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const s = await arrancar(t, { auth: { modo: 'cloudflare', jwks: publicKey, aud: 'aud-finanzas', issuer: 'https://equipo.cloudflareaccess.com', allowedEmails: ['ana@x.com', 'Luis@x.com:Luis'], syncClientId: 'svc-sync.access' } });
  const firmar = (claims, aud) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setAudience(aud || 'aud-finanzas').setIssuer('https://equipo.cloudflareaccess.com').setIssuedAt().setExpirationTime('5m').sign(privateKey);

  assert.strictEqual((await s.pedir('GET', '/api/yo')).status, 401);                                   // sin token
  const persona = await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': await firmar({ email: 'LUIS@x.com' }) });
  assert.deepStrictEqual([persona.status, persona.json], [200, { tipo: 'persona', email: 'luis@x.com', nombre: 'Luis' }]);   // m8: nombre de "email:Nombre"
  const servicio = await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': await firmar({ common_name: 'svc-sync.access' }) });
  assert.deepStrictEqual([servicio.status, servicio.json], [200, { tipo: 'servicio', clientId: 'svc-sync.access' }]);
  assert.strictEqual((await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': await firmar({ email: 'intruso@x.com' }) })).status, 403);
  assert.strictEqual((await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': await firmar({ email: 'ana@x.com' }, 'otra-app') })).status, 401);
  const otra = await generateKeyPair('RS256');
  const falso = await new SignJWT({ email: 'ana@x.com' }).setProtectedHeader({ alg: 'RS256' }).setAudience('aud-finanzas').setIssuer('https://equipo.cloudflareaccess.com').setExpirationTime('5m').sign(otra.privateKey);
  assert.strictEqual((await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': falso })).status, 401);
  const cookie = await s.pedir('GET', '/api/yo', undefined, { cookie: `CF_Authorization=${await firmar({ email: 'ana@x.com' })}` });
  assert.strictEqual(cookie.status, 200);
  // I12: issuer equivocado (o ausente cuando el token no lo firma) → 401, nunca se confía en un token de otro equipo Access.
  const otroIssuer = await new SignJWT({ email: 'ana@x.com' }).setProtectedHeader({ alg: 'RS256' }).setAudience('aud-finanzas').setIssuer('https://otro-equipo.cloudflareaccess.com').setExpirationTime('5m').sign(privateKey);
  assert.strictEqual((await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': otroIssuer })).status, 401);
  // m8: sin nombre explícito, el defecto es la parte local del email tal cual viene en ALLOWED_EMAILS.
  const ana = await s.pedir('GET', '/api/yo', undefined, { 'cf-access-jwt-assertion': await firmar({ email: 'ana@x.com' }) });
  assert.strictEqual(ana.json.nombre, 'ana');
});

// I1: el token de servicio solo puede leer.
test('token de servicio: GET permitido, cualquier escritura 403', async (t) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const s = await arrancar(t, { auth: { modo: 'cloudflare', jwks: publicKey, aud: 'aud-finanzas', issuer: 'https://equipo.cloudflareaccess.com', allowedEmails: ['ana@x.com'], syncClientId: 'svc-sync.access' } });
  const firmar = () => new SignJWT({ common_name: 'svc-sync.access' }).setProtectedHeader({ alg: 'RS256' }).setAudience('aud-finanzas').setIssuer('https://equipo.cloudflareaccess.com').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const cab = { 'cf-access-jwt-assertion': await firmar() };
  assert.strictEqual((await s.pedir('GET', '/api/datos', undefined, cab)).status, 200);
  const post = await s.pedir('POST', '/api/objetivos', { nombre: 'x', anio: 2031 }, cab);
  assert.deepStrictEqual([post.status, post.json.error], [403, 'el token de servicio es de solo lectura']);
});

// m12: sin nadie autorizado (ni email permitido ni token de servicio), la config está rota y no debe arrancar.
test('modo cloudflare: sin ALLOWED_EMAILS ni SYNC_CLIENT_ID, lanza al crear (m12)', () => {
  assert.throws(() => crearAuth({ modo: 'cloudflare', aud: 'aud-finanzas', teamDomain: 'equipo.cloudflareaccess.com', allowedEmails: [] }), /nadie autorizado/);
});
