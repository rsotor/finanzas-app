const express = require('express');
const repo = require('./repo');
const motor = require('./motor');

function crearRutas(db) {
  const r = express.Router();
  const col = (req, res, next) => {
    if (!repo.COLECCIONES.includes(req.params.col)) return res.status(404).json({ error: `colección desconocida: ${req.params.col}` });
    next();
  };

  r.get('/yo', (req, res) => res.json(req.usuario));
  r.get('/presets', (req, res) => res.json(motor.cargarPresets().lista));

  r.get('/datos', (req, res) => res.json(repo.leerDatos(db)));

  r.get('/panel', (req, res) => {
    let datos = repo.leerDatos(db);
    let avisos = [];
    try {
      if (req.query.escenario) {
        const e = repo.obtenerEscenario(db, req.query.escenario);
        if (!e) return res.status(404).json({ error: 'escenario no encontrado' });
        ({ datos, avisos } = motor.escenario.aplicar(datos, e.cambios));   // vista previa: sin generarId, laxa
      }
      res.json({ ...motor.calcular(datos), avisos, escenario: req.query.escenario || null });
    } catch (e) { res.status(422).json({ error: 'no se puede calcular con estos datos', detalle: e.message }); }
  });

  // --- supuestos (registro único) ---
  r.get('/supuestos', (req, res) => res.json(repo.leerSupuestos(db)));
  r.put('/supuestos', (req, res) => {
    const { updated_at, ...campos } = req.body || {};
    const err = repo.validarSupuestos(campos);
    if (err) return res.status(400).json({ error: err });
    const out = repo.escribirSupuestos(db, campos, updated_at);
    if (out.conflicto) return res.status(409).json({ error: 'conflicto: alguien lo cambió antes', actual: out.conflicto });
    res.json(out.supuestos);
  });

  // --- CRUD genérico ---
  r.get('/:col', col, (req, res) => res.json(repo.listar(db, req.params.col)));
  r.post('/:col', col, (req, res) => {
    if ((req.body || {}).id !== undefined) return res.status(400).json({ error: 'el id lo asigna el servidor' });
    const err = repo.validar(req.params.col, req.body || {});
    if (err) return res.status(400).json({ error: err });
    res.status(201).json(repo.insertar(db, req.params.col, req.body));
  });
  r.get('/:col/:id', col, (req, res) => {
    const f = repo.obtener(db, req.params.col, req.params.id);
    f ? res.json(f) : res.status(404).json({ error: 'no encontrado' });
  });
  r.put('/:col/:id', col, (req, res) => {
    const { updated_at, id, ...campos } = req.body || {};
    const err = repo.validar(req.params.col, campos, true);
    if (err) return res.status(400).json({ error: err });
    const out = repo.actualizar(db, req.params.col, req.params.id, campos, updated_at);
    if (out.noExiste) return res.status(404).json({ error: 'no encontrado' });
    if (out.conflicto) return res.status(409).json({ error: 'conflicto: alguien lo cambió antes', actual: out.conflicto });
    res.json(out.fila);
  });
  r.delete('/:col/:id', col, (req, res) => {
    repo.borrar(db, req.params.col, req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'no encontrado' });
  });

  return r;
}

module.exports = { crearRutas };
