const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const plan = require('../engine-plan.js');
const fx = require('./fixtures/plan-pruebas.json');
const grey = require('../presets/grey-finanbest.json');
const base = () => plan.clonar(fx.entrada);

test('I5: en el navegador, engine-plan.js no lee SimEngine.x en tiempo de carga (dependencias UMD perezosas)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine-plan.js'), 'utf8');
  const sandbox = {}; sandbox.window = sandbox;   // en el navegador window === globalThis
  assert.doesNotThrow(() => vm.runInNewContext(src, sandbox));   // sin module ni SimEngine definidos: no lanza
  assert.ok(sandbox.SimEngine.plan);
  sandbox.SimEngine.fiscal = { impuestoAhorro: x => x * 0.19 };   // ahora sí se define la dependencia
  const r = sandbox.SimEngine.plan.impuestosPorTitular([{ plusvalia: 100, titular: 'a' }], { modo: 'tramos' });
  assert.ok(Math.abs(r[0] - 19) < 1e-9);
});

test('plano: impuesto = plusvalía × tipo, bolsa a bolsa', () => {
  const r = plan.impuestosPorTitular([{ plusvalia: 1000, titular: 'ana' }, { plusvalia: 500, titular: 'ana' }], { modo: 'plano', tipo: 0.22 });
  assert.deepStrictEqual(r, [220, 110]);
});

test('tramos: dos bolsas del mismo titular tributan juntas (progresivo), dos titulares por separado', () => {
  const mismo = plan.impuestosPorTitular([{ plusvalia: 5000, titular: 'ana' }, { plusvalia: 5000, titular: 'ana' }], { modo: 'tramos' });
  const distintos = plan.impuestosPorTitular([{ plusvalia: 5000, titular: 'ana' }, { plusvalia: 5000, titular: 'luis' }], { modo: 'tramos' });
  assert.strictEqual(mismo[0] + mismo[1], 1980);        // impuestoAhorro(10000)
  assert.strictEqual(distintos[0] + distintos[1], 1900); // 2 × impuestoAhorro(5000)
  assert.strictEqual(mismo[0], 990);                     // reparto proporcional
});

test('desviación declarada: con tramos reales el neto en jubilación cambia respecto al 22 % plano', () => {
  const e = base(); e.impuestos = { modo: 'tramos' };
  const s = plan.proyectar(e);
  assert.notStrictEqual(Math.round(s.enJubilacion), Math.round(fx.esperado.enJubilacion));
  // la proyección bruta (valores) no cambia hasta que hay un rescate: 2027-2030 idénticos
  const s0 = plan.proyectar(base());
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(s.filas[i].total - s0.filas[i].total) < 0.01);
});

test('necesitaAlMes: con esa aportación la bolsa no deja nada sin cubrir; con un euro menos, sí', () => {
  const e = base();
  const r = plan.necesitaAlMes(e, 'grey');
  assert.strictEqual(r.estado, 'faltan');
  assert.ok(r.necesita > 300 && r.necesita < 2000, r.necesita);
  const sc = m => { const e2 = plan.clonar(e); e2.carteras[0].mensual = m; return plan.proyectar(e2).filas.reduce((s, f) => s + f.bolsas[0].sc, 0); };
  assert.ok(sc(r.necesita) <= plan.EPS);
  assert.ok(sc(r.necesita - 1) > plan.EPS);
  assert.ok(Math.abs(r.faltan - (r.necesita - 300)) < 1e-9);
});

test('necesitaAlMes: Metal está cubierta (necesita menos de lo que aporta); PP sin objetivos con importe', () => {
  const e = base();
  const m = plan.necesitaAlMes(e, 'metal');
  assert.strictEqual(m.estado, 'cubierta');
  assert.ok(m.necesita < 300);
  assert.strictEqual(m.faltan, 0);
  const pp = plan.necesitaAlMes(e, 'pp');           // su objetivo tiene importe 0 → nunca pide nada
  assert.strictEqual(pp.estado, 'cubierta');
  assert.strictEqual(pp.necesita, 0);
  const e2 = base(); e2.objetivos = e2.objetivos.filter(o => o.carteraId !== 'pp');
  assert.strictEqual(plan.necesitaAlMes(e2, 'pp').estado, 'sin_objetivos');
});

test('necesitaAlMes con techo: no es monótono, pero el barrido grueso encuentra igual el mismo par (cubre / no cubre con 1€ menos)', () => {
  const e = plan.prepararEntrada(datosMin(), { 'grey-finanbest.json': grey });   // Grey ya trae techo: 30000, destino: metal
  const idx = e.carteras.findIndex(c => c.id === 'grey');
  const sc = m => { const e2 = plan.clonar(e); e2.carteras[idx].mensual = m; return plan.proyectar(e2).filas.reduce((s, f) => s + f.bolsas[idx].sc, 0); };
  const r = plan.necesitaAlMes(e, 'grey');
  assert.ok(sc(r.necesita) <= plan.EPS, r.necesita);
  assert.ok(sc(r.necesita - 1) > plan.EPS, r.necesita);
});

test('necesitaAlMes con techo sobre fx.entrada: misma propiedad', () => {
  const e = base(); e.carteras[0].techo = 20000; e.carteras[0].destino = 'metal';
  const sc = m => { const e2 = plan.clonar(e); e2.carteras[0].mensual = m; return plan.proyectar(e2).filas.reduce((s, f) => s + f.bolsas[0].sc, 0); };
  const r = plan.necesitaAlMes(e, 'grey');
  assert.ok(sc(r.necesita) <= plan.EPS, r.necesita);
  assert.ok(sc(r.necesita - 1) > plan.EPS, r.necesita);
});

test('necesitaAlMes: un objetivo el año que viene por 10 millones es inalcanzable', () => {
  const e = base();
  e.objetivos.push({ id: 'x', nombre: 'Imposible', carteraId: 'grey', tipo: 'unico', anio: e.anio0 + 1, importe: 1e7, duracion: 0, estado: 'activo' });
  assert.strictEqual(plan.necesitaAlMes(e, 'grey').estado, 'inalcanzable');
});

test('I1: objetivo activo con importe no numérico va a sinModelar (motivo sin_importe) y no pide nada', () => {
  const e = base();
  e.objetivos.push({ id: 'x1', nombre: 'Malo', carteraId: 'grey', tipo: 'unico', anio: e.anio0 + 3, importe: null, duracion: 0, estado: 'activo' });
  const s = plan.proyectar(e), s0 = plan.proyectar(base());
  assert.strictEqual(s.sinModelar.find(o => o.id === 'x1').motivo, 'sin_importe');
  assert.strictEqual(s.veredicto.conSinModelar, true);
  assert.strictEqual(s.filas[2].retiras, s0.filas[2].retiras);   // el año 3: no retira nada de más
});

test('I1: tipo renta con duración no numérica o <= 0 va a sinModelar (motivo sin_duracion)', () => {
  const e = base();
  e.objetivos.push({ id: 'x2', nombre: 'Renta mala', carteraId: 'grey', tipo: 'renta', anio: e.anio0 + 3, importe: 500, duracion: 0, estado: 'activo' });
  const s = plan.proyectar(e);
  assert.strictEqual(s.sinModelar.find(o => o.id === 'x2').motivo, 'sin_duracion');
  assert.strictEqual(s.veredicto.conSinModelar, true);
});

test('I1: carteraId que no coincide con ninguna cartera va a sinModelar (motivo cartera_desconocida)', () => {
  const e = base();
  e.objetivos.push({ id: 'x3', nombre: 'Perdido', carteraId: 'no-existe', tipo: 'unico', anio: 2031, importe: 35000, duracion: 0, estado: 'activo' });
  const s = plan.proyectar(e), s0 = plan.proyectar(base());
  assert.strictEqual(s.sinModelar.find(o => o.id === 'x3').motivo, 'cartera_desconocida');
  assert.strictEqual(s.veredicto.conSinModelar, true);
  assert.strictEqual(s.filas[4].retiras, s0.filas[4].retiras);   // 2031: el objetivo perdido no retira de ninguna bolsa real
});

test('I4: cada bolsa de salida.filas[].bolsas[] lleva carteraId; pedidoPor lleva id además de nombre', () => {
  const s = plan.proyectar(base());
  assert.deepStrictEqual(s.filas[0].bolsas.map(b => b.carteraId), ['grey', 'metal', 'pp']);
  const p = s.filas[4].bolsas[0].pedidoPor[0];
  assert.strictEqual(p.id, 'o1'); assert.strictEqual(p.nombre, 'Coche'); assert.ok(typeof p.importe === 'number');
});

test('banda: h = años hasta el primer objetivo de la cartera; sin volatilidad no hay banda', () => {
  const e = base();
  e.carteras[0].volatilidad = 0.06;      // Grey
  const g = plan.bandaDe(e, e.carteras[0]);
  assert.strictEqual(g.h, 5);            // coche 2031 − 2026
  assert.ok(Math.abs(g.banda - 0.06 / Math.sqrt(5)) < 1e-12);
  assert.deepStrictEqual(plan.bandaDe(e, e.carteras[1]), { h: 31, banda: 0 });   // Metal sin volatilidad (jubilación 2057 − 2026)
});

test('bandaDe: una cartera sin objetivos modelables no tiene horizonte', () => {
  const e = base();
  const sinObjetivos = { id: 'zzz', volatilidad: 0.06 };
  assert.deepStrictEqual(plan.bandaDe(e, sinObjetivos), { h: null, banda: 0 });
  const e2 = base(); e2.objetivos = e2.objetivos.filter(o => o.carteraId !== 'grey');
  const b = plan.banda(e2);
  const bGrey = b.bandas.find(x => x.carteraId === 'grey');
  assert.deepStrictEqual(bGrey, { carteraId: 'grey', h: null, banda: 0, sinBanda: true });
});

test('banda: pesimista < base < optimista en el total del año 10, y la base es la proyección normal', () => {
  const e = base(); e.carteras[0].volatilidad = 0.06; e.carteras[1].volatilidad = 0.14;
  const b = plan.banda(e);
  assert.ok(b.pesimista.filas[9].total < b.base.filas[9].total);
  assert.ok(b.base.filas[9].total < b.optimista.filas[9].total);
  assert.strictEqual(b.base.filas[9].total, plan.proyectar(e).filas[9].total);
  assert.deepStrictEqual(b.bandas.map(x => x.sinBanda), [false, false, true]);
});

test('techo: al alcanzarlo, la aportación pasa íntegra a la cartera destino (el Excel no lo hacía)', () => {
  const e = base(); e.carteras[0].techo = 15000; e.carteras[0].destino = 'metal';
  const s = plan.proyectar(e), s0 = plan.proyectar(base());
  // 2030: Grey cerró 2029 con 11.327 (< techo) → aporta normal; 2031: cerró 2030 con 15.469 (≥ techo) → aporta 0 y Metal recibe lo suyo + lo de Grey
  assert.ok(Math.abs(s.filas[3].bolsas[0].ap - s0.filas[3].bolsas[0].ap) < 0.01);
  assert.strictEqual(s.filas[4].bolsas[0].ap, 0);
  assert.ok(Math.abs(s.filas[4].bolsas[1].ap - (s0.filas[4].bolsas[1].ap + s0.filas[4].bolsas[0].ap)) < 0.01);
});

test('m2: el techo compara con el valor tras el rescate; el año siguiente a vaciarse por un rescate, la aportación vuelve a la propia cartera', () => {
  const e = base(); e.carteras[0].techo = 15000; e.carteras[0].destino = 'metal';
  const s = plan.proyectar(e);
  assert.strictEqual(s.filas[4].bolsas[0].ap, 0);                                        // 2031: sobre techo, redirige
  assert.ok(s.filas[4].bolsas[0].val - s.filas[4].bolsas[0].coste < 0);                   // el rescate del coche la deja por debajo del techo
  assert.ok(s.filas[5].bolsas[0].ap > 3000);                                              // 2032: vuelve a aportar a sí misma
});

test('m3: redirección de techos hasta punto fijo, independiente del orden del array (A→B→C con array [B,A,C])', () => {
  const e = {
    anio0: 2026, inflacion: 0, incremento: 0, impuestos: { modo: 'plano', tipo: 0.22 }, baseFiscalInicial: 'aportado',
    carteras: [
      { id: 'B', nombre: 'B', titular: 'x', rentabilidad: 0, volatilidad: null, inicial: 0, aportado: 0, extra: 0, mensual: 100, editable: true, techo: 50, destino: 'C' },
      { id: 'A', nombre: 'A', titular: 'x', rentabilidad: 0, volatilidad: null, inicial: 0, aportado: 0, extra: 0, mensual: 100, editable: true, techo: 50, destino: 'B' },
      { id: 'C', nombre: 'C', titular: 'x', rentabilidad: 0, volatilidad: null, inicial: 0, aportado: 0, extra: 0, mensual: 100, editable: true, techo: null, destino: null },
    ],
    objetivos: [],
  };
  const s = plan.proyectar(e);
  const f2 = s.filas[1];   // año 2: las tres bolsas ya cerraron el año 1 por encima del techo (50)
  assert.deepStrictEqual(f2.bolsas.map(b => b.ap), [0, 0, 3600]);   // todo acaba en C
});

test('m4: prepararEntrada exige fecha válida y supuestos con inflación/incremento numéricos', () => {
  assert.throws(() => plan.prepararEntrada({ ...datosMin(), fecha: 'x' }, {}));
  const sinSupuestos = datosMin(); delete sinSupuestos.supuestos;
  assert.throws(() => plan.prepararEntrada(sinSupuestos, {}));
  const sinInflacion = datosMin(); delete sinInflacion.supuestos.inflacion;
  assert.throws(() => plan.prepararEntrada(sinInflacion, {}));
});

test('m6: cuando con(aportas) <= EPS el estado es cubierta y faltan es 0 (aunque necesita > 0)', () => {
  const m = plan.necesitaAlMes(base(), 'metal');
  assert.strictEqual(m.estado, 'cubierta');
  assert.strictEqual(m.faltan, 0);
});

test('m11: objetivosSinCubrir lista todos los pedidoPor de la bolsa que falla; primerObjetivo es el de mayor importe', () => {
  const e = base();
  e.objetivos.push({ id: 'o10', nombre: 'Otro', carteraId: 'grey', tipo: 'unico', anio: 2031, importe: 5000, duracion: 0, estado: 'activo' });
  const s = plan.proyectar(e);
  assert.strictEqual(s.veredicto.objetivosSinCubrir.length, 2);
  assert.strictEqual(s.veredicto.primerObjetivo, 'Coche');   // 30.000 > 5.000
  assert.deepStrictEqual(s.veredicto.objetivosSinCubrir.map(o => o.nombre).sort(), ['Coche', 'Otro']);
});

test('m1: base fiscal "aportado" nunca es negativa aunque AFIN corte la aportación desde el año 1', () => {
  const e = base(); e.baseFiscalInicial = 'aportado'; e.carteras[1].aportado = 0;   // Metal: inicial 18.000 sin coste declarado
  e.objetivos.push({ id: 'jub', nombre: 'Jubilación anticipada', carteraId: 'metal', tipo: 'jubilacion', anio: e.anio0 + 1, importe: 100, duracion: 1, estado: 'activo' });
  const s = plan.proyectar(e);
  assert.strictEqual(s.afin, 1);                 // corta la aportación ya en el año 1
  assert.ok(s.filas[0].bolsas[1].base >= 0);     // sin el clamp daría -18.000
  assert.ok(s.filas[0].totalNeto >= 0);
});

test('m7: enJubilacion es null sin objetivo de jubilación', () => {
  const e = base(); e.objetivos = e.objetivos.filter(o => o.tipo !== 'jubilacion');
  const s = plan.proyectar(e);
  assert.strictEqual(s.anioJubilacion, null);
  assert.strictEqual(s.enJubilacion, null);
});

test('base fiscal inicial "aportado": lo ya invertido entra con su coste real, no a valor', () => {
  const e = base(); e.baseFiscalInicial = 'aportado'; e.carteras[1].aportado = 8000;   // Metal: invertido 18.000 con coste 8.000
  const s = plan.proyectar(e);
  assert.ok(Math.abs(s.filas[0].bolsas[1].val - fx.esperado.filas[0].bolsas[1][1]) < 0.01);      // el valor no cambia
  assert.ok(Math.abs(s.filas[0].bolsas[1].base - (fx.esperado.filas[0].bolsas[1][2] - 18000 + 8000)) < 0.01);
  assert.ok(s.filas[0].totalNeto < fx.esperado.filas[0].totalNeto);                               // hay plusvalía latente desde el año 1
});

const datosMin = () => ({
  fecha: '2026-09-02',
  conceptos: [{ id: 'c1', nombre: 'Plan de pensiones', tipo: 'gasto', categoria: 'indispensable', importe: 1800, periodicidad: 'anual', esencial_en_paro: false }],
  cuentas: [
    { id: 'k1', nombre: 'Metal', tipo: 'inversion', saldo: 18000, aportado: 8000, cartera_id: 'metal' },
    { id: 'k2', nombre: 'Metal conjunta', tipo: 'inversion', saldo: 1000, aportado: 1000, cartera_id: 'metal' },
  ],
  carteras: [
    { id: 'grey', nombre: 'Finanbest Grey', preset_id: 'grey-finanbest.json', tipo: 'normal', titular: 'conjunto', rentabilidad_fuente: 'historica',
      aportacion_origen: 'tecleada', aportacion_mensual: 300, aportacion_inicial: 0, techo: 30000, cartera_destino: 'metal' },
    { id: 'metal', nombre: 'Cartera Metal', preset_id: null, tipo: 'normal', titular: 'conjunto', rentabilidad_fuente: 'forzada', rentabilidad_forzada: 6, nota_origen: 'Supuesto forward del Excel',
      aportacion_origen: 'tecleada', aportacion_mensual: 300, aportacion_inicial: 25000 },
    { id: 'pp', nombre: 'Plan de pensiones', preset_id: null, tipo: 'plan_pensiones', titular: 'ana', rentabilidad_fuente: 'forzada', rentabilidad_forzada: 5, nota_origen: 'FALTA INFO: pedir a Indexa',
      aportacion_origen: 'enlazada', concepto_id: 'c1', aportacion_inicial: 0 },
  ],
  objetivos: [{ id: 'o1', nombre: 'Coche', cartera_id: 'grey', tipo: 'unico', anio: 2031, importe: 35000, duracion_anios: null, estado: 'activo' }],
  supuestos: { inflacion: 2.75, incremento_aportacion: 1, meses_colchon: 6, impuestos: 'plano', tipo_plano: 22, base_fiscal_inicial: 'aportado', paro: null },
});

test('prepararEntrada: porcentajes a fracción, cuentas enlazadas sumadas, aportación enlazada desde el concepto', () => {
  const e = plan.prepararEntrada(datosMin(), { 'grey-finanbest.json': grey });
  assert.strictEqual(e.anio0, 2026);
  assert.strictEqual(e.inflacion, 0.0275);
  assert.deepStrictEqual(e.impuestos, { modo: 'plano', tipo: 0.22 });
  assert.strictEqual(e.baseFiscalInicial, 'aportado');
  const [g, m, pp] = e.carteras;
  assert.strictEqual(g.rentabilidad, 0.0382);                 // histórica del preset
  assert.ok(Math.abs(g.volatilidad - 0.05988) < 0.0001);
  assert.deepStrictEqual([g.techo, g.destino, g.editable], [30000, 'metal', true]);
  assert.deepStrictEqual([m.inicial, m.aportado, m.extra, m.mensual, m.rentabilidad, m.volatilidad], [19000, 9000, 25000, 300, 0.06, null]);
  assert.deepStrictEqual([pp.mensual, pp.editable, pp.fuente.faltaInfo], [150, false, false]);
  assert.deepStrictEqual(e.objetivos[0], { id: 'o1', nombre: 'Coche', carteraId: 'grey', tipo: 'unico', anio: 2031, importe: 35000, duracion: 0, estado: 'activo' });
});

test('prepararEntrada: cartera sin rentabilidad resoluble queda con rentabilidad null y faltaInfo (no se inventa)', () => {
  const d = datosMin(); d.carteras[1].rentabilidad_fuente = 'forward_neta';   // Metal sin preset
  const e = plan.prepararEntrada(d, {});
  assert.strictEqual(e.carteras[1].rentabilidad, null);
  assert.strictEqual(e.carteras[1].fuente.faltaInfo, true);
});

test('panel: junta proyección, necesita por cartera y banda; una cartera con rentabilidad null se proyecta a 0 % y se marca', () => {
  const d = datosMin(); d.carteras[1].rentabilidad_fuente = 'forward_neta';
  const p = plan.panel(plan.prepararEntrada(d, { 'grey-finanbest.json': grey }));
  assert.strictEqual(p.proyeccion.filas.length, 85);
  assert.deepStrictEqual(p.carteras.map(c => c.id), ['grey', 'metal', 'pp']);
  assert.strictEqual(p.carteras[0].estado, 'faltan');
  assert.strictEqual(p.carteras[1].faltaInfo, true);
  assert.ok(p.banda.pesimista.filas[4].total <= p.banda.base.filas[4].total);
  assert.strictEqual(p.carteras[0].aportas, 300);
});

test('I2: sin rentabilidad ORIGINAL no hay banda ni necesita — panel marca sin_dato', () => {
  const d = datosMin(); d.carteras[1].rentabilidad_fuente = 'forward_neta';   // Metal sin preset
  const p = plan.panel(plan.prepararEntrada(d, { 'grey-finanbest.json': grey }));
  assert.strictEqual(p.carteras[1].estado, 'sin_dato');
  assert.strictEqual(p.carteras[1].necesita, null);
  assert.strictEqual(p.carteras[1].faltan, null);
  assert.strictEqual(p.banda.bandas[1].sinBanda, true);
  assert.strictEqual(p.banda.bandas[1].banda, 0);
});

test('m5: banda(e, base) reutiliza la proyección ya calculada; panel se la pasa (misma referencia)', () => {
  const p = plan.panel(base());
  assert.strictEqual(p.banda.base, p.proyeccion);
});
