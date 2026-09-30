const { test } = require('node:test');
const assert = require('node:assert');
const esc = require('../engine-escenario.js');

const real = () => ({
  fecha: '2026-09-02',
  conceptos: [{ id: 'c1', nombre: 'Luz', tipo: 'gasto', categoria: 'indispensable', importe: 90, periodicidad: 'mensual' }],
  cuentas: [], carteras: [{ id: 'grey', nombre: 'Grey', aportacion_mensual: 300 }],
  objetivos: [{ id: 'o1', nombre: 'Coche', cartera_id: 'grey', tipo: 'unico', anio: 2031, importe: 35000 }],
  supuestos: { inflacion: 2.75 }, acciones: [],
});

test('modificar, crear con id temporal y borrar, sin tocar el original', () => {
  const r0 = real();
  const cambios = [
    esc.nuevoDelta('carteras', 'modificar', 'grey', { aportacion_mensual: 500 }, r0.carteras[0]),
    esc.nuevoDelta('objetivos', 'crear', 'tmp:1', { nombre: 'Moto', cartera_id: 'grey', tipo: 'unico', anio: 2027, importe: 8000 }),
    esc.nuevoDelta('objetivos', 'modificar', 'tmp:1', { importe: 9000 }, { importe: 8000 }),
    esc.nuevoDelta('conceptos', 'borrar', 'c1', null, r0.conceptos[0]),
    esc.nuevoDelta('supuestos', 'modificar', null, { inflacion: 3 }, r0.supuestos),
  ];
  const { datos, avisos } = esc.aplicar(r0, cambios);
  assert.deepStrictEqual(avisos, []);
  assert.strictEqual(datos.carteras[0].aportacion_mensual, 500);
  assert.deepStrictEqual(datos.objetivos.map(o => [o.id, o.nombre, o.importe]), [['o1', 'Coche', 35000], ['tmp:1', 'Moto', 9000]]);
  assert.deepStrictEqual(datos.conceptos, []);
  assert.strictEqual(datos.supuestos.inflacion, 3);
  assert.strictEqual(r0.carteras[0].aportacion_mensual, 300);   // el original no se toca
  assert.strictEqual(cambios[0].valor_anterior.aportacion_mensual, 300);
});

test('generarId resuelve los temporales y las referencias entre entidades creadas', () => {
  const cambios = [
    esc.nuevoDelta('carteras', 'crear', 'tmp:1', { nombre: 'Nueva' }),
    esc.nuevoDelta('objetivos', 'crear', 'tmp:2', { nombre: 'Viaje', cartera_id: 'tmp:1', anio: 2028, importe: 3000 }),
    esc.nuevoDelta('acciones', 'crear', 'tmp:3', { texto: 'mirar', ligada_a: { entidad: 'objetivos', id: 'tmp:2' } }),
  ];
  let n = 0;
  const { datos, mapaIds } = esc.aplicar(real(), cambios, { generarId: () => 'id' + (++n) });
  assert.deepStrictEqual(mapaIds, { 'tmp:1': 'id1', 'tmp:2': 'id2', 'tmp:3': 'id3' });
  assert.strictEqual(datos.objetivos[1].cartera_id, 'id1');
  assert.deepStrictEqual(datos.acciones[0].ligada_a, { entidad: 'objetivos', id: 'id2' });
});

test('conflicto: si lo real cambió desde que se creó el delta, avisa campo a campo; en estricto no escribe', () => {
  const r0 = real();
  const d = esc.nuevoDelta('carteras', 'modificar', 'grey', { aportacion_mensual: 500 }, r0.carteras[0]);   // valor_anterior 300
  r0.carteras[0].aportacion_mensual = 350;                                                                // Luis lo cambió
  const laxo = esc.aplicar(r0, [d]);
  assert.deepStrictEqual(laxo.avisos, [{ tipo: 'conflicto', entidad: 'carteras', id: 'grey', campo: 'aportacion_mensual', esperado: 300, real: 350 }]);
  assert.strictEqual(laxo.datos.carteras[0].aportacion_mensual, 500);
  const estricto = esc.aplicar(r0, [d], { estricto: true });
  assert.strictEqual(estricto.avisos.length, 1);
  assert.strictEqual(estricto.datos.carteras[0].aportacion_mensual, 350);
});

test('huérfano: modificar o borrar algo que ya no existe avisa y no rompe', () => {
  const r0 = real(); r0.objetivos = [];
  const { datos, avisos } = esc.aplicar(r0, [esc.nuevoDelta('objetivos', 'modificar', 'o1', { importe: 1 }, { importe: 35000 }),
                                            esc.nuevoDelta('objetivos', 'borrar', 'o1', null, { importe: 35000 })]);
  assert.deepStrictEqual(avisos.map(a => a.tipo), ['huerfano', 'huerfano']);
  assert.deepStrictEqual(datos.objetivos, []);
});

test('aplicar y descartar deja lo real idéntico; un temporal creado y borrado no deja rastro', () => {
  const r0 = real();
  const antes = JSON.stringify(r0);
  const cambios = [esc.nuevoDelta('objetivos', 'crear', 'tmp:1', { nombre: 'Moto', anio: 2027, importe: 8000 }),
                   esc.nuevoDelta('objetivos', 'borrar', 'tmp:1', null, { nombre: 'Moto' })];
  const { datos, avisos } = esc.aplicar(r0, cambios);
  assert.deepStrictEqual(avisos, []);
  assert.strictEqual(JSON.stringify(datos), antes);          // descartar = no escribir: lo real es r0, intacto
  assert.strictEqual(JSON.stringify(r0), antes);
});

test('aplicar el mismo escenario dos veces: la segunda avisa (conflicto o huérfano) y en estricto no escribe nada', () => {
  const r0 = real();
  const cambios = [esc.nuevoDelta('carteras', 'modificar', 'grey', { aportacion_mensual: 500 }, r0.carteras[0]),
                   esc.nuevoDelta('conceptos', 'borrar', 'c1', null, r0.conceptos[0])];
  const una = esc.aplicar(r0, cambios, { estricto: true });
  assert.deepStrictEqual(una.avisos, []);
  const dos = esc.aplicar(una.datos, cambios, { estricto: true });
  assert.deepStrictEqual(dos.avisos.map(a => a.tipo).sort(), ['conflicto', 'huerfano']);
  assert.strictEqual(JSON.stringify(dos.datos), JSON.stringify(una.datos));
});

test('crear+borrar no es modificar: los ids temporales se numeran sin chocar', () => {
  const cambios = [esc.nuevoDelta('objetivos', 'crear', 'tmp:1', { nombre: 'a' }), esc.nuevoDelta('objetivos', 'crear', 'tmp:7', { nombre: 'b' })];
  assert.strictEqual(esc.nuevoIdTemporal(cambios), 'tmp:8');
  assert.strictEqual(esc.esTemporal('tmp:3'), true);
  assert.strictEqual(esc.esTemporal('o1'), false);
});

test('conflicto en supuestos: avisa campo a campo; en estricto no escribe, en laxo sí', () => {
  const r0 = real(); r0.supuestos.inflacion = 3;
  const d = { entidad: 'supuestos', id: null, operacion: 'modificar', campos: { inflacion: 3.5 }, valor_anterior: { inflacion: 2.75 } };
  const laxo = esc.aplicar(r0, [d]);
  assert.deepStrictEqual(laxo.avisos, [{ tipo: 'conflicto', entidad: 'supuestos', id: null, campo: 'inflacion', esperado: 2.75, real: 3 }]);
  assert.strictEqual(laxo.datos.supuestos.inflacion, 3.5);
  const estricto = esc.aplicar(r0, [d], { estricto: true });
  assert.strictEqual(estricto.avisos.length, 1);
  assert.strictEqual(estricto.datos.supuestos.inflacion, 3);   // en estricto no escribe
});

test('referencias temporales en concepto_id, vinculado_a y cartera_destino se resuelven con generarId', () => {
  const cambios = [
    esc.nuevoDelta('conceptos', 'crear', 'tmp:1', { nombre: 'Nuevo concepto', tipo: 'gasto', categoria: 'x', importe: 10, periodicidad: 'mensual' }),
    esc.nuevoDelta('carteras', 'crear', 'tmp:2', { nombre: 'Cartera nueva', concepto_id: 'tmp:1' }),
    esc.nuevoDelta('carteras', 'crear', 'tmp:3', { nombre: 'Otra cartera', cartera_destino: 'tmp:2' }),
    esc.nuevoDelta('conceptos', 'crear', 'tmp:4', { nombre: 'Vinculado', vinculado_a: 'tmp:1' }),
  ];
  let n = 0;
  const { datos, mapaIds } = esc.aplicar(real(), cambios, { generarId: () => 'id' + (++n) });
  assert.strictEqual(datos.carteras.find(c => c.id === mapaIds['tmp:2']).concepto_id, mapaIds['tmp:1']);
  assert.strictEqual(datos.carteras.find(c => c.id === mapaIds['tmp:3']).cartera_destino, mapaIds['tmp:2']);
  assert.strictEqual(datos.conceptos.find(c => c.id === mapaIds['tmp:4']).vinculado_a, mapaIds['tmp:1']);
});

test('borrar con valor_anterior parcial: si coincide borra sin avisos; si difiere avisa y en estricto no borra', () => {
  const r0 = real(); r0.objetivos = [{ id: 'o1', nombre: 'Coche', cartera_id: 'grey', tipo: 'unico', anio: 2031, importe: 35000 }];
  const delta = { entidad: 'objetivos', id: 'o1', operacion: 'borrar', campos: null, valor_anterior: { importe: 35000 } };
  const ok = esc.aplicar(r0, [delta]);
  assert.deepStrictEqual(ok.avisos, []);
  assert.deepStrictEqual(ok.datos.objetivos, []);

  const r1 = real(); r1.objetivos = [{ id: 'o1', nombre: 'Coche', cartera_id: 'grey', tipo: 'unico', anio: 2031, importe: 40000 }];
  const laxo = esc.aplicar(r1, [delta]);
  assert.deepStrictEqual(laxo.avisos, [{ tipo: 'conflicto', entidad: 'objetivos', id: 'o1', campo: 'importe', esperado: 35000, real: 40000 }]);
  const estricto = esc.aplicar(r1, [delta], { estricto: true });
  assert.strictEqual(estricto.avisos.length, 1);
  assert.strictEqual(estricto.datos.objetivos.length, 1);   // en estricto no se borra
});

test('valor_anterior null (delta construido sin filaActual): se aplica sin chequear nada', () => {
  const r0 = real();
  const { datos, avisos } = esc.aplicar(r0, [
    { entidad: 'carteras', id: 'grey', operacion: 'modificar', campos: { aportacion_mensual: 1 }, valor_anterior: null },
  ], { estricto: true });
  assert.strictEqual(datos.carteras[0].aportacion_mensual, 1);
  assert.deepStrictEqual(avisos, []);
});

test('referencia temporal sin resolver: aplicar a lo real avisa y en estricto no crea; en vista previa (sin generarId) no avisa', () => {
  const cambios = [
    esc.nuevoDelta('objetivos', 'crear', 'tmp:2', { nombre: 'Viaje', cartera_id: 'tmp:1', anio: 2028, importe: 3000 }),
    esc.nuevoDelta('carteras', 'crear', 'tmp:1', { nombre: 'Nueva' }),   // tmp:1 se crea DESPUÉS del objetivo que lo referencia
  ];
  let n = 0;
  const conGenerarId = esc.aplicar(real(), cambios, { generarId: () => 'id' + (++n), estricto: true });
  assert.deepStrictEqual(conGenerarId.avisos, [{ tipo: 'referencia_temporal', entidad: 'objetivos', id: 'tmp:2', campo: 'cartera_id', esperado: null, real: 'tmp:1' }]);
  assert.strictEqual(conGenerarId.datos.objetivos.length, 1);   // solo o1: el nuevo objetivo no se crea
  const sinGenerarId = esc.aplicar(real(), cambios);
  assert.deepStrictEqual(sinGenerarId.avisos, []);
  assert.strictEqual(sinGenerarId.datos.objetivos.length, 2);   // vista previa: se crea con la referencia literal
});

test('referencia temporal sin resolver en un modificar (con generarId)', () => {
  const r0 = real();
  const cambios = [
    { entidad: 'objetivos', id: 'o1', operacion: 'modificar', campos: { cartera_id: 'tmp:9' }, valor_anterior: null },
  ];
  const { avisos, datos } = esc.aplicar(r0, cambios, { generarId: () => 'idX', estricto: true });
  assert.deepStrictEqual(avisos, [{ tipo: 'referencia_temporal', entidad: 'objetivos', id: 'o1', campo: 'cartera_id', esperado: null, real: 'tmp:9' }]);
  assert.strictEqual(datos.objetivos[0].cartera_id, 'grey');   // en estricto no se escribe
});

test('m9: crear con un id ya existente en la colección avisa duplicado y en estricto no lo añade', () => {
  const r0 = real();   // ya trae objetivos: [{ id: 'o1', ... }]
  const cambios = [esc.nuevoDelta('objetivos', 'crear', 'tmp:1', { nombre: 'Choca con o1' })];
  const { datos, avisos } = esc.aplicar(r0, cambios, { generarId: () => 'o1', estricto: true });
  assert.deepStrictEqual(avisos, [{ tipo: 'duplicado', entidad: 'objetivos', id: 'o1', campo: 'id', esperado: null, real: 'o1' }]);
  assert.strictEqual(datos.objetivos.length, 1);   // no se añade una segunda fila con el mismo id
  const laxo = esc.aplicar(r0, cambios, { generarId: () => 'o1' });
  assert.strictEqual(laxo.avisos.length, 1);
  assert.strictEqual(laxo.datos.objetivos.length, 2);   // en laxo sí se escribe (con id duplicado, avisado)
});

test('m10: operación distinta de "modificar" sobre supuestos lanza', () => {
  const r0 = real();
  assert.throws(() => esc.aplicar(r0, [{ entidad: 'supuestos', id: null, operacion: 'crear', campos: {}, valor_anterior: null }]),
    /operación no válida sobre supuestos/);
  assert.throws(() => esc.aplicar(r0, [{ entidad: 'supuestos', id: null, operacion: 'borrar', campos: null, valor_anterior: null }]),
    /operación no válida sobre supuestos/);
});

test('updated_at e id nunca cuentan como conflicto', () => {
  const r0 = real(); r0.carteras[0].updated_at = 'y';
  const delta = { entidad: 'carteras', id: 'grey', operacion: 'modificar',
    campos: { aportacion_mensual: 300, updated_at: 'z' },
    valor_anterior: { aportacion_mensual: 300, updated_at: 'x' } };
  const { avisos } = esc.aplicar(r0, [delta]);
  assert.deepStrictEqual(avisos, []);
});

test('un crear bloqueado en estricto no deja mapeado su id temporal', () => {
  const r0 = real();
  const cambios = [
    esc.nuevoDelta('carteras', 'crear', 'tmp:1', { nombre: 'Choca con grey' }),
    esc.nuevoDelta('objetivos', 'crear', 'tmp:2', { nombre: 'Viaje', cartera_id: 'tmp:1', anio: 2028, importe: 3000 }),
  ];
  let n = 0;
  const generarId = () => (++n === 1 ? 'grey' : 'nuevo2');
  const { datos, avisos, mapaIds } = esc.aplicar(r0, cambios, { estricto: true, generarId });
  assert.deepStrictEqual(avisos, [
    { tipo: 'duplicado', entidad: 'carteras', id: 'grey', campo: 'id', esperado: null, real: 'grey' },
    { tipo: 'referencia_temporal', entidad: 'objetivos', id: 'tmp:2', campo: 'cartera_id', esperado: null, real: 'tmp:1' },
  ]);
  assert.strictEqual(mapaIds['tmp:1'], undefined);
  assert.strictEqual(datos.carteras.length, 1);
  assert.strictEqual(datos.objetivos.length, 1);
});
