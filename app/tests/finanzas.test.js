const { test } = require('node:test');
const assert = require('node:assert');
const fin = require('../engine-finanzas.js');

const datos = {
  conceptos: [
    { id: 'c1', nombre: 'Nómina', tipo: 'ingreso', categoria: 'ana', importe: 2000, periodicidad: 'mensual', esencial_en_paro: false },
    { id: 'c2', nombre: 'Extra', tipo: 'ingreso', categoria: 'luis', importe: 1200, periodicidad: 'anual', esencial_en_paro: false },
    { id: 'c3', nombre: 'Hipoteca', tipo: 'gasto', categoria: 'indispensable', importe: 500, periodicidad: 'mensual', esencial_en_paro: true },
    { id: 'c4', nombre: 'Seguro coche', tipo: 'gasto', categoria: 'necesario', importe: 600, periodicidad: 'anual', esencial_en_paro: true },
    { id: 'c5', nombre: 'Restaurantes', tipo: 'gasto', categoria: 'revisable', importe: 150, periodicidad: 'mensual', esencial_en_paro: false },
    { id: 'c6', nombre: 'Plan de pensiones', tipo: 'gasto', categoria: 'indispensable', importe: 300, periodicidad: 'mensual', esencial_en_paro: false },
  ],
  cuentas: [
    { id: 'k1', nombre: 'Colchón', tipo: 'liquidez', saldo: 6600, rol: 'colchon', aportacion_mensual: 0, tipo_interes: 2.5 },
    { id: 'k2', nombre: 'Buffer', tipo: 'liquidez', saldo: 1000, rol: 'buffer', aportacion_mensual: 400 },
    { id: 'k3', nombre: 'Personal', tipo: 'liquidez', saldo: 200, rol: 'personal', aportacion_mensual: 100 },
    { id: 'k4', nombre: 'Cuenta al 0%', tipo: 'liquidez', saldo: 5000, rol: null, aportacion_mensual: 0 },
    { id: 'k5', nombre: 'Metal', tipo: 'inversion', saldo: 9000, aportado: 8000, cartera_id: 'metal' },
    { id: 'k6', nombre: 'Hipoteca', tipo: 'deuda', saldo: -100000 },
  ],
  carteras: [
    { id: 'metal', aportacion_origen: 'tecleada', aportacion_mensual: 700 },
    { id: 'pp', aportacion_origen: 'enlazada', concepto_id: 'c6' },
  ],
  supuestos: { meses_colchon: 6, paro: { ana: { importe: 300, meses: 4 }, luis: { importe: 0, meses: 0 } } },
};

test('mensual y anual normalizan por periodicidad', () => {
  assert.strictEqual(fin.mensual({ importe: 1200, periodicidad: 'anual' }), 100);
  assert.strictEqual(fin.anual({ importe: 100, periodicidad: 'mensual' }), 1200);
});

test('totales, ahorro y categorías', () => {
  const r = fin.resumen(datos);
  assert.strictEqual(r.ingresosMes, 2100);
  assert.strictEqual(r.gastosMes, 1000);            // 500 + 50 + 150 + 300
  assert.strictEqual(r.ahorroMes, 1100);
  assert.ok(Math.abs(r.tasaAhorro - 1100 / 2100) < 1e-12);
  assert.deepStrictEqual(r.porCategoria, { indispensable: 800, necesario: 50, revisable: 150 });
});

test('patrimonio neto resta deudas; intereses del colchón salen del TAE', () => {
  const r = fin.resumen(datos);
  assert.strictEqual(r.patrimonioNeto, 6600 + 1000 + 200 + 5000 + 9000 - 100000);
  assert.strictEqual(r.interesesAnual, 165);         // 6600 × 2,5 %
});

test('colchón contra gasto de supervivencia (solo esencial_en_paro), con y sin paro', () => {
  const r = fin.resumen(datos);
  assert.strictEqual(r.colchon.gastoSupervivencia, 550);   // 500 + 50; ni restaurantes ni plan de pensiones
  assert.strictEqual(r.colchon.meses, 12);                  // 6600 / 550
  // con paro: 4 meses cobrando 300 → déficit 250/mes (1000 gastados) → quedan 5600 / 550 = 10,18 → 4 + 10 = 14 meses enteros
  assert.strictEqual(r.colchon.mesesConParo, 14);
});

test('sin paro informado mesesConParo es null; sin gasto de supervivencia meses es null', () => {
  const r = fin.resumen({ ...datos, supuestos: { meses_colchon: 6, paro: null } });
  assert.strictEqual(r.colchon.mesesConParo, null);
  const r2 = fin.resumen({ ...datos, conceptos: datos.conceptos.map(c => ({ ...c, esencial_en_paro: false })) });
  assert.strictEqual(r2.colchon.meses, null);
});

test('m14: ingresosAnual, gastosAnual y ahorroAnual son el mensual × 12', () => {
  const r = fin.resumen(datos);
  assert.strictEqual(r.ingresosAnual, 25200);
  assert.strictEqual(r.gastosAnual, 12000);
  assert.strictEqual(r.ahorroAnual, 13200);
});

test('m7: sin ingresos, tasaAhorro es null (no 0: 0 significa "no ahorra nada", no "no hay dato")', () => {
  const r = fin.resumen({ ...datos, conceptos: datos.conceptos.filter(c => c.tipo !== 'ingreso') });
  assert.strictEqual(r.tasaAhorro, null);
});

test('reparto del ahorro: solo carteras tecleadas; la enlazada ya está en los gastos; el buffer es el resto', () => {
  const r = fin.resumen(datos);
  // k2 tiene aportacion_mensual 400 tecleada, pero el buffer no se teclea: es lo que queda (1100 − 700 − 100).
  assert.deepStrictEqual(r.reparto, { ahorro: 1100, carterasTecleadas: 700, buffer: 300, personales: 100, sinDueno: 0, hayBuffer: true });
});

test('reparto sin cuenta buffer: el resto queda sin dueño (aviso), el buffer es 0', () => {
  const sinBuffer = { ...datos, cuentas: datos.cuentas.map(k => k.rol === 'buffer' ? { ...k, rol: null } : k) };
  const r = fin.resumen(sinBuffer);
  assert.deepStrictEqual(r.reparto, { ahorro: 1100, carterasTecleadas: 700, buffer: 0, personales: 100, sinDueno: 300, hayBuffer: false });
});

// 09-14: una cuenta personal puede llevar una regla (% de una base de conceptos, cada uno con su parte) en vez del
// importe tecleado. Caso real: 10 % de (nómina + seguro + la mitad del plan, que la otra mitad la pone la empresa).
test('aportación personal con regla: % de la base, cada concepto con su parte', () => {
  const conRegla = { ...datos, cuentas: datos.cuentas.map(k => k.id === 'k3' ? { ...k, aportacion_regla: { porcentaje: 10, base: [{ concepto_id: 'c1', parte: 100 }, { concepto_id: 'c2' }, { concepto_id: 'c6', parte: 50 }] } } : k) };
  const r = fin.resumen(conRegla);
  const k3 = r.aportacionesPersonales.find(a => a.id === 'k3');
  // base = 2000 + 100 (1200 al año, parte por defecto 100) + 50 % de 300 = 2250 → 10 % = 225
  assert.strictEqual(k3.base, 2250);
  assert.strictEqual(k3.aporta, 225);
  assert.strictEqual(k3.regla, true);
  assert.deepStrictEqual(k3.lineas.map(l => [l.concepto_id, l.parte, l.importe]), [['c1', 100, 2000], ['c2', 100, 100], ['c6', 50, 150]]);
  assert.deepStrictEqual(k3.faltan, []);
  // el reparto usa lo calculado, no el 100 tecleado que sigue en la cuenta
  assert.strictEqual(r.reparto.personales, 225);
  assert.strictEqual(r.reparto.buffer, 1100 - 700 - 225);
});

test('aportación personal con regla: un concepto de la base que ya no existe cuenta 0 y se avisa', () => {
  const huerfana = { ...datos, cuentas: datos.cuentas.map(k => k.id === 'k3' ? { ...k, aportacion_regla: { porcentaje: 10, base: [{ concepto_id: 'c1', parte: 100 }, { concepto_id: 'borrado', parte: 100 }] } } : k) };
  const k3 = fin.resumen(huerfana).aportacionesPersonales.find(a => a.id === 'k3');
  assert.strictEqual(k3.aporta, 200);
  assert.deepStrictEqual(k3.faltan, ['borrado']);
});

test('aportación personal sin regla: la tecleada, con su nombre, una fila por cuenta personal', () => {
  assert.deepStrictEqual(fin.resumen(datos).aportacionesPersonales, [{ id: 'k3', nombre: 'Personal', aporta: 100, regla: false, porcentaje: null, base: null, lineas: [], faltan: [] }]);
});

test('liquidez sin rol', () => {
  assert.strictEqual(fin.resumen(datos).liquidezSinRol, 5000);
});

test('MESES_MAX_SIMULACION es 600 (50 años) y con paro que cubre todo el gasto devuelve Infinity', () => {
  assert.strictEqual(fin.MESES_MAX_SIMULACION, 600);
  const paro = { ana: { importe: 10000, meses: 10000 } };
  assert.strictEqual(fin.mesesAguanteConParo(1000, 500, paro), Infinity);
});
