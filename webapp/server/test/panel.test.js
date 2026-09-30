const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { arrancar, datosMinimos } = require('../test-helpers/helpers');
const repo = require('../src/repo');

// B2: la caché de presets se invalida por mtime de app/presets/index.json, sin reiniciar el servidor.
// Va PRIMERA en el fichero a propósito: motor.js resuelve RAIZ en tiempo de carga del módulo (una vez
// por proceso de test), así que APP_DIR debe fijarse antes del primer arrancar() de este fichero. La
// copia temporal es fiel a app/, así que el resto de tests de este fichero no se ven afectados.
test('/api/presets refleja un preset nuevo sin reiniciar (mtime de index.json)', async (t) => {
  const appOrigen = path.resolve(__dirname, '..', '..', '..', 'app');
  const appTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-app-'));
  fs.cpSync(appOrigen, appTmp, { recursive: true });
  process.env.APP_DIR = appTmp;
  t.after(() => delete process.env.APP_DIR);
  // m1: motor.js fija RAIZ = appTmp para el resto del proceso (ver comentario arriba) — borrarlo aquí
  // tumbaría los tests siguientes de este fichero. Se recoge al salir del proceso, no al acabar el test.
  process.on('exit', () => fs.rmSync(appTmp, { recursive: true, force: true }));

  const s = await arrancar(t);
  const antes = (await s.pedir('GET', '/api/presets')).json;
  assert.ok(!antes.find(p => p.id === 'nuevo-preset.json'));

  const dirPresets = path.join(appTmp, 'presets');
  const rutaIndice = path.join(dirPresets, 'index.json');
  fs.writeFileSync(path.join(dirPresets, 'nuevo-preset.json'), JSON.stringify({ name: 'Nuevo preset', dataAsOf: '2026-09-07' }));
  const indice = JSON.parse(fs.readFileSync(rutaIndice, 'utf8'));
  indice.push({ file: 'nuevo-preset.json', label: 'Nuevo preset', type: 'product' });
  fs.writeFileSync(rutaIndice, JSON.stringify(indice));
  fs.utimesSync(rutaIndice, new Date(Date.now() + 5000), new Date(Date.now() + 5000));   // forzar mtime distinto

  const despues = (await s.pedir('GET', '/api/presets')).json;
  assert.ok(despues.find(p => p.id === 'nuevo-preset.json'));
});

test('/api/datos devuelve la forma completa y /api/panel calcula resumen + panel con los presets del repo', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const d = (await s.pedir('GET', '/api/datos')).json;
  assert.deepStrictEqual(Object.keys(d).sort(), ['acciones', 'carteras', 'conceptos', 'cuentas', 'fecha', 'objetivos', 'supuestos']);
  const p = await s.pedir('GET', '/api/panel');
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.json.resumen.ingresosMes, 3000);
  assert.strictEqual(p.json.resumen.colchon.meses, 20);                    // 10000 / 500
  assert.strictEqual(p.json.panel.proyeccion.filas.length, 85);
  assert.deepStrictEqual(p.json.panel.carteras.map(c => c.id), ['grey', 'metal', 'pp']);
  assert.strictEqual(p.json.panel.carteras[2].aportas, 150);          // enlazada al concepto anual /12
  assert.strictEqual(p.json.panel.carteras[2].editable, false);
  assert.deepStrictEqual(p.json.avisos, []);
});

test('/api/panel sin supuestos responde 422 con explicación, nunca inventa', async (t) => {
  const s = await arrancar(t);
  const p = await s.pedir('GET', '/api/panel');
  assert.strictEqual(p.status, 422);
  assert.match(p.json.detalle, /supuestos|fecha/);
});

// I2: el `try` de /api/panel también cubre motor.escenario.aplicar (antes solo cubría motor.calcular) —
// un escenario con datos corruptos (aquí, escrito directo en la BD, saltándose la validación de la ruta)
// nunca debe tumbar el proceso con un 500.
test('I2: /api/panel con un escenario cuyos cambios tienen una entidad desconocida responde 422, nunca 500', async (t) => {
  const s = await arrancar(t);
  repo.escribirDatos(s.db, datosMinimos());
  const e = repo.insertarEscenario(s.db, { nombre: 'Corrupto', cambios: [
    { entidad: 'nada', id: 'x', operacion: 'modificar', campos: {}, valor_anterior: null },
  ] });
  const p = await s.pedir('GET', `/api/panel?escenario=${e.id}`);
  assert.deepStrictEqual([p.status, /entidad desconocida/.test(p.json.detalle)], [422, true]);
});

test('/api/presets lista los presets del repo con su fecha de datos', async (t) => {
  const s = await arrancar(t);
  const l = (await s.pedir('GET', '/api/presets')).json;
  const grey = l.find(p => p.id === 'grey-finanbest.json');
  assert.ok(grey && grey.dataAsOf && grey.label);
});
