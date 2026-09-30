// Fidelidad de los datos: el libro de pruebas (plantilla-excel/pruebas.xlsx, familia ficticia) importado a la app
// y pasado por el motor reproduce el Panel del libro. Datos y fixture se regeneran con plantilla-excel/ (ver su README).
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { arrancar } = require('../test-helpers/helpers');
const motor = require('../src/motor');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const datos = require(path.join(RAIZ, 'app', 'tests', 'fixtures', 'datos-pruebas.json'));
const fx = require(path.join(RAIZ, 'app', 'tests', 'fixtures', 'plan-pruebas.json'));
const TOL = 0.01;

test('totales de Ingresos - Gastos y colchón coinciden con el libro', () => {
  const r = motor.fin.resumen(datos);
  assert.ok(Math.abs(r.ingresosAnual - 49980) < TOL, r.ingresosAnual);        // Ingresos - Gastos «TOTAL INGRESOS»
  assert.ok(Math.abs(r.gastosAnual - 38818) < TOL, r.gastosAnual);            // «TOTAL GASTOS»
  assert.ok(Math.abs(r.ahorroMes - 930.17) < TOL, r.ahorroMes);               // «AHORRO MENSUAL»
  // Fondo de emergencia C12 = 2.482,50: el libro resta además un recorte tecleado a mano (−80 € de supermercado)
  // que no es un concepto; la app no lo conoce, así que su gasto de supervivencia es 80 € mayor.
  assert.ok(Math.abs(r.colchon.gastoSupervivencia - (2482.5 + 80)) < 0.02, r.colchon.gastoSupervivencia);
  assert.strictEqual(r.colchon.saldo, 14000);
  assert.strictEqual(r.colchon.objetivoMeses, null);   // el libro no fija un objetivo en meses
  assert.ok(Math.abs(r.patrimonioNeto - 146200) < TOL, r.patrimonioNeto);    // Patrimonio Neto E3
  assert.deepStrictEqual(r.reparto, { ahorro: r.ahorroMes, carterasTecleadas: 600, buffer: 0, personales: 250, sinDueno: r.ahorroMes - 600 - 250, hayBuffer: false });
  assert.strictEqual(r.liquidezSinRol, 4500);
  assert.strictEqual(r.interesesAnual, 0);   // el interés del colchón ya cuenta como concepto, no se duplica
  assert.strictEqual(datos.supuestos.paro.ana.meses, 24);   // Fondo de emergencia, bloque G
  assert.ok(typeof r.colchon.mesesConParo === 'number' && r.colchon.mesesConParo > 0);
});

test('la proyección con los datos migrados coincide al céntimo con la del Excel (por carteraId)', () => {
  const { panel } = motor.calcular(datos);
  const s = panel.proyeccion;
  assert.strictEqual(s.veredicto.primerAnio, 2031);
  assert.strictEqual(s.veredicto.primerObjetivo, 'Coche');
  assert.strictEqual(s.veredicto.conSinModelar, true);
  assert.ok(Math.abs(s.enJubilacion - fx.esperado.enJubilacion) < TOL);
  const orden = ['grey', 'metal', 'pp'];
  fx.esperado.filas.forEach((e, i) => {
    const f = s.filas[i];
    assert.strictEqual(f.anio, e.anio);
    assert.ok(Math.abs(f.total - e.total) < TOL, `${e.anio} total ${f.total} vs ${e.total}`);
    e.bolsas.forEach((b, k) => {
      const m = f.bolsas.find(x => x.carteraId === orden[k]);
      [['ap', 0], ['val', 1], ['base', 2], ['re', 3], ['coste', 4], ['sc', 5]].forEach(([campo, j]) => {
        assert.ok(Math.abs(m[campo] - b[j]) < TOL, `${e.anio} ${orden[k]} ${campo}: ${m[campo]} vs ${b[j]}`);
      });
    });
  });
  // obj-8 (jubilación del plan de pensiones sin repartir) entra como falta_info: la cartera 'pp' se queda sin
  // ningún objetivo modelable y sale 'sin_objetivos', no 'cubierta' (que sugeriría un objetivo ya resuelto).
  assert.deepStrictEqual(panel.carteras.map(c => [c.id, c.estado]), [['grey', 'faltan'], ['metal', 'cubierta'], ['pp', 'sin_objetivos']]);
  assert.strictEqual(panel.carteras[2].editable, false);
  assert.ok(panel.proyeccion.sinModelar.find(o => o.id === 'obj-8' && o.motivo === 'falta_info'));
});

test('de punta a punta: import por la API y panel con el veredicto del libro', async (t) => {
  const s = await arrancar(t);
  const i = await s.pedir('POST', '/api/import', { datos });
  assert.deepStrictEqual([i.status, i.json.contadores], [200, { conceptos: 42, cuentas: 9, carteras: 3, objetivos: 9, acciones: 4 }]);
  const p = (await s.pedir('GET', '/api/panel')).json;
  assert.strictEqual(p.panel.proyeccion.veredicto.primerAnio, 2031);
  assert.ok(Math.abs(p.panel.carteras[0].necesita - 520.41) < TOL);
  assert.strictEqual((await s.pedir('GET', '/api/acciones')).json.length, 4);
});
