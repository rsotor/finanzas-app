// El servidor sirve el motor (app/) y los estilos compartidos detrás de la misma auth que la API (plan 3).
const { test } = require('node:test');
const assert = require('node:assert');
const { arrancar } = require('../test-helpers/helpers');

test('/motor sirve los engines y presets del repo; /estilos el theme; ambos exigen identidad', async (t) => {
  const s = await arrancar(t);
  const js = await fetch(s.url + '/motor/engine-plan.js', { headers: { 'x-dev-user': 'ana@test' } });
  assert.strictEqual(js.status, 200);
  assert.match(await js.text(), /proyectar/);
  const preset = await fetch(s.url + '/motor/presets/index.json', { headers: { 'x-dev-user': 'ana@test' } });
  assert.strictEqual(preset.status, 200);
  const css = await fetch(s.url + '/estilos/theme.css', { headers: { 'x-dev-user': 'ana@test' } });
  assert.strictEqual(css.status, 200);
  assert.strictEqual((await fetch(s.url + '/motor/', { headers: { 'x-dev-user': 'ana@test' } })).status, 404);   // sin índice de directorio
  assert.strictEqual((await fetch(s.url + '/estilos/', { headers: { 'x-dev-user': 'ana@test' } })).status, 404);   // sin índice de directorio
});

// m6: /motor solo expone lo que carga la interfaz (engine-*.js de primer nivel y presets/) — el resto de
// app/ (demos, tests, CLIs) no debe quedar accesible por accidente detrás de la misma auth.
test('m6: /motor solo sirve engine-*.js y presets/; el resto de app/ es 404', async (t) => {
  const s = await arrancar(t);
  const cab = { headers: { 'x-dev-user': 'ana@test' } };
  assert.strictEqual((await fetch(s.url + '/motor/simulador-fondos.html', cab)).status, 404);
  assert.strictEqual((await fetch(s.url + '/motor/tests/core.test.js', cab)).status, 404);
  assert.strictEqual((await fetch(s.url + '/motor/simulador-engine.js', cab)).status, 404);
  assert.strictEqual((await fetch(s.url + '/motor/presets/cartera.schema.json', cab)).status, 200);
});

// 09-14: sin hash en el nombre, el motor/presets/estilos deben revalidarse siempre — si no, tras un despliegue el
// navegador mezcla la interfaz nueva con el motor viejo (pasó en producción: faltaban las líneas por cuenta del reparto).
test('caché: motor, presets y estilos se revalidan siempre (no-cache) y responden 304 si no cambiaron', async (t) => {
  // La petición condicional va con http y no con fetch: fetch, por especificación, añade `Cache-Control: no-cache` a
  // toda petición con If-None-Match, y con eso el servidor está obligado a responder 200 aunque nada haya cambiado.
  const http = require('node:http');
  const estado = (url, headers) => new Promise((ok, ko) => http.get(url, { headers }, res => { res.resume(); ok(res.statusCode); }).on('error', ko));
  const s = await arrancar(t);
  const cab = { 'x-dev-user': 'ana@test' };
  for (const ruta of ['/motor/engine-finanzas.js', '/motor/presets/index.json', '/estilos/theme.css']) {
    const r = await fetch(s.url + ruta, { headers: cab });
    assert.strictEqual(r.status, 200, ruta);
    assert.strictEqual(r.headers.get('cache-control'), 'no-cache', ruta);
    const etag = r.headers.get('etag');
    assert.ok(etag, ruta);
    assert.strictEqual(await estado(s.url + ruta, { ...cab, 'if-none-match': etag }), 304, ruta);
  }
});

test('caché de la web: index.html se revalida; lo de assets/ (con hash de Vite) se guarda para siempre', async (t) => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const dirWeb = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-web-'));
  t.after(() => fs.rmSync(dirWeb, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dirWeb, 'index.html'), '<!doctype html><title>x</title>');
  fs.mkdirSync(path.join(dirWeb, 'assets'));
  fs.writeFileSync(path.join(dirWeb, 'assets', 'index-abc123.js'), 'console.log(1)');
  const s = await arrancar(t, { dirWeb });
  const cab = { headers: { 'x-dev-user': 'ana@test' } };
  const raiz = await fetch(s.url + '/', cab);
  assert.strictEqual(raiz.status, 200);
  assert.strictEqual(raiz.headers.get('cache-control'), 'no-cache');
  const asset = await fetch(s.url + '/assets/index-abc123.js', cab);
  assert.strictEqual(asset.status, 200);
  assert.strictEqual(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('sin identidad, /motor y /estilos responden 401 (modo dev sin AUTH_DEV_EMAIL)', async (t) => {
  const s = await arrancar(t, { auth: { modo: 'dev', devEmail: null } });
  assert.strictEqual((await fetch(s.url + '/motor/engine-plan.js')).status, 401);
  assert.strictEqual((await fetch(s.url + '/estilos/theme.css')).status, 401);
});
