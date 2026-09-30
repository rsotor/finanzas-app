const express = require('express');
const repo = require('./repo');
const motor = require('./motor');

// C2: forma de un delta al guardar un escenario. No sustituye la puerta final (escribirDatos, sobre la
// fila resultante completa) — solo atrapa pronto lo obvio: entidad/operación desconocida, campos que no
// existen en el esquema, y los tipos numéricos/enumerados (nunca obligatorios: un delta puede dejar, de
// camino, un campo vacío que resuelve otro delta del mismo escenario).
function validarDelta(d, i) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return `delta ${i}: formato inválido`;
  const { entidad, operacion, campos } = d;
  if (entidad !== 'supuestos' && !repo.COLECCIONES.includes(entidad)) return `delta ${i}: entidad desconocida`;
  if (!['crear', 'modificar', 'borrar'].includes(operacion)) return `delta ${i}: operación desconocida`;
  if (operacion === 'borrar') {
    if (campos !== null && campos !== undefined) return `delta ${i}: campos debe ser null al borrar`;
    return null;
  }
  if (campos === null || typeof campos !== 'object' || Array.isArray(campos)) return `delta ${i}: campos debe ser un objeto`;
  const columnas = entidad === 'supuestos' ? repo.COLUMNAS_SUPUESTOS : repo.COLUMNAS[entidad];
  const desconocidos = Object.keys(campos).filter(k => !columnas.includes(k));
  if (desconocidos.length) return `delta ${i}: campos desconocidos: ${desconocidos.join(', ')}`;
  // I2: al GUARDAR el delta se valida solo el tipo (sin obligatorios) — un escenario puede, de camino,
  // dejar un campo obligatorio vacío que otro paso resuelve; quien de verdad bloquea es escribirDatos al
  // aplicar (spec ya establecida para el resto de entidades, ver validarTiposDelta).
  const err = entidad === 'supuestos' ? repo.validarTiposSupuestos(campos) : repo.validarTiposDelta(entidad, campos);
  return err ? `delta ${i}: ${err}` : null;
}
function validarCambios(cambios) {
  for (let i = 0; i < (cambios || []).length; i++) { const err = validarDelta(cambios[i], i); if (err) return err; }
  return null;
}

// I5: el engine no numera los avisos por delta; se ubica el delta que lo originó por entidad+id+campo
// (si es ambiguo, el primero que encaje).
function conIndice(avisos, cambios) {
  return avisos.map(a => {
    let indice = cambios.findIndex(d => d.entidad === a.entidad && d.id === a.id && (
      a.campo == null ||
      (d.campos && Object.prototype.hasOwnProperty.call(d.campos, a.campo)) ||
      (d.valor_anterior && Object.prototype.hasOwnProperty.call(d.valor_anterior, a.campo))
    ));
    if (indice < 0) indice = cambios.findIndex(d => d.entidad === a.entidad && d.id === a.id);
    return { ...a, indice };
  });
}

// Recomendación 4: el mayor updated_at de todo `datos`, para que quien consuma /export sepa si hay algo más nuevo.
function maxUpdatedAt(datos) {
  let max = null;
  for (const col of repo.COLECCIONES) for (const f of datos[col] || []) if (f.updated_at && (!max || f.updated_at > max)) max = f.updated_at;
  if (datos.supuestos && datos.supuestos.updated_at && (!max || datos.supuestos.updated_at > max)) max = datos.supuestos.updated_at;
  return max;
}

// Rutas que no encajan en el CRUD genérico (van ANTES del genérico para que `/escenarios` y `/:col/orden`
// no caigan en `/:col/:id`).
function crearRutasEspeciales(db) {
  const r = express.Router();

  // m9: reordenar una colección entera de una vez (arrastrar en la UI) sin tocar updated_at de cada fila.
  r.put('/:col/orden', (req, res) => {
    if (!repo.COLECCIONES.includes(req.params.col)) return res.status(404).json({ error: `colección desconocida: ${req.params.col}` });
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'falta ids' });
    const out = repo.reordenar(db, req.params.col, ids);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out.lista);
  });

  r.get('/escenarios', (req, res) => res.json(repo.listarEscenarios(db)));
  r.post('/escenarios', (req, res) => {
    // El autor lo pone el servidor a partir de la identidad autenticada, nunca el cliente.
    const b = { ...(req.body || {}), creado_por: req.usuario.tipo === 'persona' ? req.usuario.nombre : null };
    if (!b.nombre) return res.status(400).json({ error: 'falta nombre' });
    if (b.cambios && !Array.isArray(b.cambios)) return res.status(400).json({ error: 'cambios debe ser una lista' });
    const err = validarCambios(b.cambios);
    if (err) return res.status(400).json({ error: err });
    res.status(201).json(repo.insertarEscenario(db, b));
  });
  r.get('/escenarios/:id', (req, res) => {
    const e = repo.obtenerEscenario(db, req.params.id);
    e ? res.json(e) : res.status(404).json({ error: 'no encontrado' });
  });
  r.put('/escenarios/:id', (req, res) => {
    const { updated_at, id, creado, ...campos } = req.body || {};
    if (campos.cambios && !Array.isArray(campos.cambios)) return res.status(400).json({ error: 'cambios debe ser una lista' });
    const err = validarCambios(campos.cambios);
    if (err) return res.status(400).json({ error: err });
    const out = repo.actualizarEscenario(db, req.params.id, campos, updated_at);
    if (out.noExiste) return res.status(404).json({ error: 'no encontrado' });
    if (out.conflicto) return res.status(409).json({ error: 'conflicto: alguien lo cambió antes', actual: out.conflicto });
    res.json(out.escenario);
  });
  r.delete('/escenarios/:id', (req, res) => {
    repo.borrarEscenario(db, req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'no encontrado' });
  });

  // Aplicar a lo real. `indices` (opcional, ronda 2 de UX): aplica SOLO esos cambios y deja el resto en el
  // escenario; sin `indices` aplica todos y borra el escenario (si al final no queda ninguno). Estricto
  // primero; solo un conflicto de valor_anterior es confirmable con `confirmar`: true (todos) | lista de
  // índices no vacía (siempre índices de `cambios` originales) — duplicados y referencias temporales nunca
  // lo son, y `confirmar: []` cuenta como "nada confirmado" (409, no como confirmar-todos-menos-ninguno).
  // I4: un huérfano no bloquea, viaja como aviso en el 200. I5: un elegido que no se llega a escribir de
  // verdad (conflicto sin confirmar, o huérfano) no se descarta con el resto — vuelve a `restantes` y su
  // índice original viaja en `no_aplicados`, para no perder el cambio en silencio.
  r.post('/escenarios/:id/aplicar', (req, res) => {
    const e = repo.obtenerEscenario(db, req.params.id);
    if (!e) return res.status(404).json({ error: 'no encontrado' });
    const confirmar = req.body && req.body.confirmar;
    const indices = req.body && req.body.indices;
    if (indices !== undefined && (!Array.isArray(indices) || indices.some(i => !Number.isInteger(i) || i < 0 || i >= e.cambios.length))) {
      return res.status(400).json({ error: 'indices debe ser una lista de posiciones válidas de cambios' });
    }
    const elegidos = indices === undefined ? e.cambios.map((_, i) => i) : [...new Set(indices)].sort((a, b) => a - b);
    if (indices !== undefined && !elegidos.length) return res.status(400).json({ error: 'no hay cambios que aplicar' });   // sin indices y sin cambios: aplicar vacío = borrar el escenario
    const subconjunto = elegidos.map(i => e.cambios[i]);
    const aOriginal = avisos => conIndice(avisos, subconjunto).map(a => ({ ...a, indice: a.indice == null ? null : elegidos[a.indice] }));
    const datos = repo.leerDatos(db);
    let estricto;
    try { estricto = motor.escenario.aplicar(datos, subconjunto, { estricto: true, generarId: repo.nuevoId }); }
    catch (err) { return res.status(422).json({ error: 'el escenario no se puede aplicar', detalle: err.message }); }
    let avisos = aOriginal(estricto.avisos);
    const bloqueantes = avisos.filter(a => a.tipo === 'duplicado' || a.tipo === 'referencia_temporal');
    if (bloqueantes.length) return res.status(409).json({ error: 'el escenario no se puede aplicar', avisos, confirmable: false });
    const confirmables = avisos.filter(a => a.tipo === 'conflicto');
    let resultado = estricto;
    // I5: `confirmar: []` es "nada confirmado" (una lista vacía es truthy en JS, no vale mirar solo `!confirmar`).
    const hayConfirmacion = confirmar === true || (Array.isArray(confirmar) && confirmar.length > 0);
    if (confirmables.length) {
      if (!hayConfirmacion) return res.status(409).json({ error: 'lo real cambió desde que se creó el escenario', avisos, confirmable: true });
      const confirmados = confirmar === true ? elegidos : confirmar;
      const pasada2 = subconjunto.map((d, k) => confirmados.includes(elegidos[k]) ? { ...d, valor_anterior: null } : d);
      resultado = motor.escenario.aplicar(datos, pasada2, { estricto: true, generarId: repo.nuevoId });
      avisos = aOriginal(resultado.avisos);
    }
    // I5: un elegido cuyo delta terminó en aviso 'conflicto' (no confirmado) o 'huerfano' NO se escribió de
    // verdad — si se descarta del escenario igualmente, el cambio se pierde en silencio. Vuelve con los no
    // elegidos a `restantes`, y su índice original viaja en `no_aplicados` para que la interfaz avise.
    const noEscritos = [...new Set(avisos.filter(a => (a.tipo === 'conflicto' || a.tipo === 'huerfano') && a.indice != null).map(a => a.indice))].sort((a, b) => a - b);
    const restantes = e.cambios.filter((_, i) => !elegidos.includes(i) || noEscritos.includes(i));
    let contadores;
    try {
      db.transaction(() => {           // escribirDatos ya es una transacción; better-sqlite3 anida con savepoints
        contadores = repo.escribirDatos(db, resultado.datos);
        if (restantes.length) repo.actualizarEscenario(db, e.id, { cambios: restantes });
        else repo.borrarEscenario(db, e.id);
      })();
    } catch (err) {
      if (err.codigo === 'VALIDACION') return res.status(422).json({ error: 'datos no válidos', detalle: err.message });
      throw err;
    }
    res.json({ aplicado: true, avisos, contadores, restantes: restantes.length, no_aplicados: noEscritos });
  });

  // Revisiones: foto congelada de datos + TODO lo que el motor devolvía (I9: no solo la proyección) +
  // la versión de los presets con la que se calculó (para saber si una revisión vieja usó datos de
  // producto que ya cambiaron).
  r.get('/revisiones', (req, res) => res.json(repo.listarRevisiones(db)));
  r.get('/revisiones/:id', (req, res) => {
    const x = repo.obtenerRevision(db, req.params.id);
    x ? res.json(x) : res.status(404).json({ error: 'no encontrada' });
  });
  r.post('/revisiones', (req, res) => {
    const datos = repo.leerDatos(db);
    let calc;
    try { calc = motor.calcular(datos); } catch (e) { return res.status(422).json({ error: 'no se puede cerrar la revisión: el motor no calcula', detalle: e.message }); }
    const fecha = (req.body && req.body.fecha) || datos.fecha || new Date().toISOString().slice(0, 10);
    const presets = motor.cargarPresets().lista.map(p => ({ id: p.id, dataAsOf: p.dataAsOf }));
    res.status(201).json(repo.insertarRevision(db, { fecha, nota: req.body && req.body.nota, datos, resultados: calc, presets }));
  });
  // m9: limpieza de fixtures de test — no la usa la interfaz normal (las revisiones son fotos, no se editan).
  r.delete('/revisiones/:id', (req, res) => {
    repo.borrarRevision(db, req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'no encontrada' });
  });

  // Puente con el repo (plan 4 lo consume).
  r.get('/export', (req, res) => {
    const datos = repo.leerDatos(db);
    let resultados = null, error = null;
    try { resultados = motor.calcular(datos); } catch (e) { error = e.message; }
    res.json({ exportado_en: new Date().toISOString(), fecha: datos.fecha, max_updated_at: maxUpdatedAt(datos), datos, resultados, error });
  });
  r.post('/import', (req, res) => {
    const d = req.body && req.body.datos;
    if (!d || typeof d !== 'object') return res.status(400).json({ error: 'falta datos' });
    for (const c of repo.COLECCIONES) if (d[c] !== undefined && !Array.isArray(d[c])) return res.status(400).json({ error: `${c} debe ser una lista` });
    if (!d.supuestos || typeof d.supuestos !== 'object') return res.status(400).json({ error: 'faltan supuestos' });
    if (!d.fecha && !d.supuestos.fecha) return res.status(400).json({ error: 'falta fecha' });
    const errSup = repo.validarSupuestos(d.supuestos);
    if (errSup) return res.status(400).json({ error: `supuestos: ${errSup}` });
    for (const c of repo.COLECCIONES) for (const obj of d[c] || []) { const err = repo.validar(c, obj); if (err) return res.status(400).json({ error: `${c}: ${err}` }); }
    try { res.json({ importado: true, contadores: repo.escribirDatos(db, d) }); }
    catch (err) {
      if (err.codigo === 'VALIDACION') return res.status(422).json({ error: 'datos no válidos', detalle: err.message });
      throw err;
    }
  });

  return r;
}

module.exports = { crearRutasEspeciales };
