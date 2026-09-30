// Levanta la app con una BD temporal y auth en modo dev; devuelve helpers HTTP con fetch (Node 18+).
const os = require('os');
const path = require('path');
const fs = require('fs');

async function arrancar(t, opts) {
  const { crearApp } = require('../src/app');   // perezoso: db.test.js usa datosMinimos() antes de que exista src/app
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-test-'));
  const app = crearApp({ rutaDb: path.join(dir, 'test.sqlite'), auth: { modo: 'dev', devEmail: 'ana@test' }, ...(opts || {}) });
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  // extra.crudo: envía `cuerpo` tal cual (string), sin JSON.stringify — para probar JSON mal formado de verdad.
  const pedir = async (metodo, ruta, cuerpo, cabeceras, extra) => {
    const crudo = extra && extra.crudo;
    const r = await fetch(url + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(cabeceras || {}) },
      body: cuerpo === undefined ? undefined : (crudo ? cuerpo : JSON.stringify(cuerpo)),
    });
    const texto = await r.text();
    let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { json = { _raw: texto }; }
    return { status: r.status, json };
  };
  const cerrar = () => new Promise(res => {
    app.locals.db.close();
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(() => { fs.rmSync(dir, { recursive: true, force: true }); res(); });
  });
  if (t && t.after) t.after(cerrar);          // se cierra aunque una aserción falle: sin esto el proceso se queda colgado
  return { app, db: app.locals.db, url, pedir, cerrar };
}

// Datos mínimos coherentes para pruebas de API (no son los reales).
function datosMinimos() {
  return {
    fecha: '2026-09-02',
    supuestos: { inflacion: 2.75, incremento_aportacion: 1, meses_colchon: 6, impuestos: 'plano', tipo_plano: 22, base_fiscal_inicial: 'valor', paro: null },
    conceptos: [
      { id: 'c-nomina', nombre: 'Nómina', tipo: 'ingreso', categoria: 'laboral', importe: 3000, periodicidad: 'mensual', titular: 'ana', esencial_en_paro: false },
      { id: 'c-hipoteca', nombre: 'Hipoteca', tipo: 'gasto', categoria: 'indispensable', grupo: 'Vivienda', importe: 500, periodicidad: 'mensual', esencial_en_paro: true },
      { id: 'c-pp', nombre: 'Plan de pensiones', tipo: 'gasto', categoria: 'indispensable', grupo: 'Ahorro', importe: 1800, periodicidad: 'anual', esencial_en_paro: false },
    ],
    cuentas: [
      { id: 'k-colchon', nombre: 'Colchón', tipo: 'liquidez', titular: 'conjunto', saldo: 10000, rol: 'colchon', tipo_interes: 2.5 },
      { id: 'k-metal', nombre: 'Metal', tipo: 'inversion', titular: 'ana', saldo: 18000, aportado: 18000, cartera_id: 'metal' },
    ],
    carteras: [
      { id: 'grey', nombre: 'Finanbest Grey', preset_id: 'grey-finanbest.json', tipo: 'normal', titular: 'conjunto', rentabilidad_fuente: 'forzada', rentabilidad_forzada: 3.82, nota_origen: 'test', aportacion_origen: 'tecleada', aportacion_mensual: 300, aportacion_inicial: 0 },
      { id: 'metal', nombre: 'Cartera Metal', preset_id: 'metal-myinvestor.json', tipo: 'normal', titular: 'ana', rentabilidad_fuente: 'forzada', rentabilidad_forzada: 6, nota_origen: 'test', aportacion_origen: 'tecleada', aportacion_mensual: 300, aportacion_inicial: 25000 },
      { id: 'pp', nombre: 'Plan de pensiones', preset_id: null, tipo: 'plan_pensiones', titular: 'ana', rentabilidad_fuente: 'forzada', rentabilidad_forzada: 5, nota_origen: 'test', aportacion_origen: 'enlazada', concepto_id: 'c-pp', aportacion_inicial: 0 },
    ],
    objetivos: [
      { id: 'o-coche', nombre: 'Coche', cartera_id: 'grey', tipo: 'unico', anio: 2031, importe: 35000, estado: 'activo' },
      { id: 'o-jub', nombre: 'Jubilación', cartera_id: 'metal', tipo: 'jubilacion', anio: 2056, importe: 350, duracion_anios: 50, estado: 'activo' },
    ],
    acciones: [{ id: 'a-1', texto: 'Verificar contratación de Grey', estado: 'abierta', ligada_a: { entidad: 'carteras', id: 'grey' } }],
  };
}

module.exports = { arrancar, datosMinimos };
