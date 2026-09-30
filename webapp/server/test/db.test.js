const { test, after } = require('node:test');
const assert = require('node:assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
const { abrir, migrar } = require('../src/db');
const repo = require('../src/repo');
const { datosMinimos } = require('../test-helpers/helpers');

// m1: recoger los directorios temporales de todos los tests del fichero y borrarlos al final.
const dirsTmp = [];
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-db-')); dirsTmp.push(dir); return path.join(dir, 'x.sqlite'); };
after(() => { for (const d of dirsTmp) fs.rmSync(d, { recursive: true, force: true }); });

test('abrir aplica las migraciones una sola vez y deja las 8 tablas', () => {
  const db = abrir(tmp());
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  for (const t of ['conceptos', 'cuentas', 'carteras', 'objetivos', 'supuestos', 'acciones', 'escenarios', 'revisiones', 'migraciones']) assert.ok(tablas.includes(t), t);
  assert.deepStrictEqual(migrar(db), []);        // segunda vez: nada pendiente
  assert.strictEqual(db.pragma('journal_mode', { simple: true }), 'wal');
  db.close();
});

test('escribirDatos + leerDatos son inversas (booleanos y JSON incluidos)', () => {
  const db = abrir(tmp());
  const d = datosMinimos();
  const contadores = repo.escribirDatos(db, d);
  assert.deepStrictEqual(contadores, { conceptos: 3, cuentas: 2, carteras: 3, objetivos: 2, acciones: 1 });
  const leido = repo.leerDatos(db);
  assert.strictEqual(leido.fecha, '2026-09-02');
  assert.strictEqual(leido.conceptos.find(c => c.id === 'c-hipoteca').esencial_en_paro, true);
  assert.strictEqual(leido.conceptos.find(c => c.id === 'c-pp').esencial_en_paro, false);
  assert.deepStrictEqual(leido.acciones[0].ligada_a, { entidad: 'carteras', id: 'grey' });
  assert.strictEqual(leido.supuestos.paro, null);
  assert.ok(leido.carteras[0].updated_at);
  db.close();
});

test('actualizar con updated_at desfasado devuelve conflicto y no escribe', () => {
  const db = abrir(tmp());
  const fila = repo.insertar(db, 'objetivos', { nombre: 'Coche', anio: 2031, importe: 35000 });
  const ok = repo.actualizar(db, 'objetivos', fila.id, { importe: 36000 }, fila.updated_at);
  assert.strictEqual(ok.fila.importe, 36000);
  const viejo = repo.actualizar(db, 'objetivos', fila.id, { importe: 1 }, fila.updated_at);
  assert.ok(viejo.conflicto);
  assert.strictEqual(repo.obtener(db, 'objetivos', fila.id).importe, 36000);
  assert.deepStrictEqual(repo.actualizar(db, 'objetivos', 'no-existe', { importe: 1 }), { noExiste: true });
  db.close();
});

test('validar: obligatorios y campos desconocidos', () => {
  assert.match(repo.validar('conceptos', { nombre: 'x' }), /faltan campos obligatorios: tipo, importe, periodicidad/);
  assert.match(repo.validar('cuentas', { nombre: 'x', tipo: 'liquidez', saldo: 1, color: 'rojo' }), /campos desconocidos: color/);
  assert.strictEqual(repo.validar('acciones', { texto: 'hola' }), null);
});

// I3: escribir el mismo registro de supuestos dos veces no debe renovar su updated_at.
test('escribirSupuestos: escribir dos veces lo mismo deja updated_at igual', () => {
  const db = abrir(tmp());
  const campos = { fecha: '2026-09-02', inflacion: 2.75, incremento_aportacion: 1, impuestos: 'plano', tipo_plano: 22, base_fiscal_inicial: 'valor', paro: { ana: { importe: 1150, meses: 24 } } };
  const uno = repo.escribirSupuestos(db, campos);
  const dos = repo.escribirSupuestos(db, { ...campos });
  assert.strictEqual(dos.supuestos.updated_at, uno.supuestos.updated_at);
  const tres = repo.escribirSupuestos(db, { ...campos, inflacion: 3 });
  assert.notStrictEqual(tres.supuestos.updated_at, uno.supuestos.updated_at);
  db.close();
});

// I6: arranque en local — abrir() prepara el directorio si no existe (salvo :memory:).
test('abrir en un directorio inexistente lo crea', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-db-'));
  dirsTmp.push(base);
  const ruta = path.join(base, 'no-existe-aun', 'x.sqlite');
  const db = abrir(ruta);
  assert.ok(fs.existsSync(ruta));
  db.close();
});

// A2: escribirDatos conserva updated_at de lo que no cambia (solo escribe si algo cambia de verdad).
test('escribirDatos: reimportar lo mismo deja todos los updated_at iguales; cambiar un concepto solo cambia el suyo; quitar una fila la borra', () => {
  const db = abrir(tmp());
  const d = datosMinimos();
  repo.escribirDatos(db, d);
  const antes = repo.leerDatos(db);

  repo.escribirDatos(db, d);   // reimportar exactamente lo mismo
  const despues = repo.leerDatos(db);
  for (const col of ['conceptos', 'cuentas', 'carteras', 'objetivos', 'acciones']) {
    antes[col].forEach(f => assert.strictEqual(despues[col].find(x => x.id === f.id).updated_at, f.updated_at, `${col} ${f.id}`));
  }

  const d2 = JSON.parse(JSON.stringify(d));
  d2.conceptos.find(c => c.id === 'c-nomina').importe = 3500;
  repo.escribirDatos(db, d2);
  const tras = repo.leerDatos(db);
  assert.notStrictEqual(tras.conceptos.find(c => c.id === 'c-nomina').updated_at, antes.conceptos.find(c => c.id === 'c-nomina').updated_at);
  assert.strictEqual(tras.conceptos.find(c => c.id === 'c-hipoteca').updated_at, antes.conceptos.find(c => c.id === 'c-hipoteca').updated_at);

  const d3 = JSON.parse(JSON.stringify(d2));
  d3.conceptos = d3.conceptos.filter(c => c.id !== 'c-pp');
  repo.escribirDatos(db, d3);
  assert.strictEqual(repo.listar(db, 'conceptos').find(c => c.id === 'c-pp'), undefined);
  assert.strictEqual(repo.listar(db, 'conceptos').length, 2);
  db.close();
});
