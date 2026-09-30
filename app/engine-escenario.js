(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.escenario = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLECCIONES = ['conceptos', 'cuentas', 'carteras', 'objetivos', 'acciones'];
  const CAMPOS_REF = ['cartera_id', 'concepto_id', 'vinculado_a', 'cartera_destino'];   // + ligada_a.id
  const clonar = x => JSON.parse(JSON.stringify(x));
  const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const esTemporal = id => typeof id === 'string' && /^tmp:\d+$/.test(id);

  function nuevoIdTemporal(cambios) {
    const n = (cambios || []).reduce((m, d) => esTemporal(d.id) ? Math.max(m, parseInt(d.id.slice(4), 10)) : m, 0);
    return 'tmp:' + (n + 1);
  }

  // valor_anterior: para modificar, los campos que se tocan tal como estaban; para borrar, la fila entera.
  function nuevoDelta(entidad, operacion, id, campos, filaActual) {
    let valor_anterior = null;
    if (operacion === 'modificar' && filaActual) { valor_anterior = {}; Object.keys(campos || {}).forEach(k => { valor_anterior[k] = filaActual[k]; }); }
    if (operacion === 'borrar' && filaActual) valor_anterior = clonar(filaActual);
    return { entidad, id: id == null ? null : id, operacion, campos: campos ? clonar(campos) : null, valor_anterior };
  }

  function resolverRefs(campos, mapa) {
    const out = clonar(campos || {});
    CAMPOS_REF.forEach(k => { if (out[k] != null && mapa[out[k]] != null) out[k] = mapa[out[k]]; });
    if (out.ligada_a && out.ligada_a.id != null && mapa[out.ligada_a.id] != null) out.ligada_a = { ...out.ligada_a, id: mapa[out.ligada_a.id] };
    return out;
  }

  // Tras resolverRefs, cualquier campo que siga en forma tmp:N es una referencia que no se pudo
  // mapear (apunta a un id temporal que nunca llegó a crearse, o que se crea después en el mismo lote).
  function refsTemporalesSinResolver(campos) {
    const out = [];
    CAMPOS_REF.forEach(k => { if (esTemporal(campos[k])) out.push({ campo: k, valor: campos[k] }); });
    if (campos.ligada_a && esTemporal(campos.ligada_a.id)) out.push({ campo: 'ligada_a.id', valor: campos.ligada_a.id });
    return out;
  }

  function conflictos(fila, d) {
    const out = [];
    // sin valor_anterior no hay nada que contrastar: el delta se aplica sin chequeo
    if (!d.valor_anterior) return out;
    const campos = d.operacion === 'borrar' ? Object.keys(d.valor_anterior) : Object.keys(d.campos || {});
    campos.forEach(k => {
      // spec §4.1: toda entidad lleva updated_at para el control optimista del servidor; no es un dato
      // del escenario y nunca debe contar como conflicto (igual para id, que no cambia)
      if (k === 'updated_at' || k === 'id') return;
      if (k in d.valor_anterior && !igual(fila[k], d.valor_anterior[k])) {
        out.push({ tipo: 'conflicto', entidad: d.entidad, id: d.id, campo: k, esperado: d.valor_anterior[k], real: fila[k] });
      }
    });
    return out;
  }

  function aplicar(datos, cambios, opts) {
    opts = opts || {};
    const out = clonar(datos);
    COLECCIONES.forEach(c => { if (!out[c]) out[c] = []; });
    if (!out.supuestos) out.supuestos = {};
    const avisos = [], mapaIds = {};
    (cambios || []).forEach(d => {
      if (d.entidad === 'supuestos') {
        if (d.operacion !== 'modificar') throw new Error('operación no válida sobre supuestos: ' + d.operacion);
        const cf = conflictos(out.supuestos, d);
        avisos.push(...cf);
        if (!(opts.estricto && cf.length)) Object.assign(out.supuestos, d.campos || {});
        return;
      }
      if (!COLECCIONES.includes(d.entidad)) throw new Error('entidad desconocida: ' + d.entidad);
      const col = out[d.entidad];
      const id = mapaIds[d.id] != null ? mapaIds[d.id] : d.id;
      if (d.operacion === 'crear') {
        const nuevoId = opts.generarId ? opts.generarId() : d.id;
        const resueltos = resolverRefs(d.campos, mapaIds);
        let bloquea = false;
        if (opts.generarId) {
          refsTemporalesSinResolver(resueltos).forEach(r => {
            avisos.push({ tipo: 'referencia_temporal', entidad: d.entidad, id: d.id, campo: r.campo, esperado: null, real: r.valor });
            bloquea = true;
          });
        }
        if (col.some(x => x.id === nuevoId)) {
          avisos.push({ tipo: 'duplicado', entidad: d.entidad, id: nuevoId, campo: 'id', esperado: null, real: nuevoId });
          bloquea = true;
        }
        if (opts.estricto && bloquea) return;
        // solo se mapea el tmp si la fila se añade de verdad; si el crear se bloquea, los deltas
        // posteriores que lo referencien caen en referencia_temporal (o conservan el tmp en vista previa)
        mapaIds[d.id] = nuevoId;
        col.push({ ...resueltos, id: nuevoId });
        return;
      }
      const i = col.findIndex(x => x.id === id);
      if (i < 0) { avisos.push({ tipo: 'huerfano', entidad: d.entidad, id: d.id, campo: null, esperado: null, real: null }); return; }
      const cf = conflictos(col[i], d);
      avisos.push(...cf);
      if (opts.estricto && cf.length) return;
      if (d.operacion === 'modificar') {
        const resueltos = resolverRefs(d.campos, mapaIds);
        if (opts.generarId) {
          const refs = refsTemporalesSinResolver(resueltos);
          if (refs.length) {
            refs.forEach(r => avisos.push({ tipo: 'referencia_temporal', entidad: d.entidad, id: d.id, campo: r.campo, esperado: null, real: r.valor }));
            if (opts.estricto) return;
          }
        }
        Object.assign(col[i], resueltos);
      }
      else if (d.operacion === 'borrar') col.splice(i, 1);
      else throw new Error('operación desconocida: ' + d.operacion);
    });
    return { datos: out, avisos, mapaIds };
  }

  return { COLECCIONES, esTemporal, nuevoIdTemporal, nuevoDelta, aplicar };
});
