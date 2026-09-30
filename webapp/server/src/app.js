// Construye la app Express. Separado de index.js para que los tests la levanten con su propia BD y auth.
const express = require('express');
const path = require('path');
const { abrir } = require('./db');
const { crearAuth } = require('./auth');
const { crearRutas } = require('./rutas');
const { crearRutasEspeciales } = require('./rutas-especiales');
const { leerPersonas } = require('./personas');

// I1: el token de servicio (sync) solo puede leer — cualquier escritura es 403.
function soloLecturaServicio(req, res, next) {
  if (req.usuario.tipo === 'servicio' && req.method !== 'GET') return res.status(403).json({ error: 'el token de servicio es de solo lectura' });
  next();
}

function crearApp(opts) {
  const db = opts.db || abrir(opts.rutaDb);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  // m6: /salud toca la base de verdad; si no responde, el contenedor está roto aunque el proceso viva.
  app.get('/salud', (req, res) => {
    try { db.prepare('SELECT 1').get(); res.json({ ok: true }); }
    catch (err) { res.status(503).json({ ok: false }); }
  });
  const auth = crearAuth(opts.auth);
  // Configuración del hogar que necesita la interfaz. Se valida al arrancar: una PERSONAS mal escrita no arranca.
  const personas = Array.isArray(opts.personas) ? opts.personas : leerPersonas(opts.personas);
  app.get('/api/config', auth, (req, res) => res.json({ personas }));
  app.use('/api', auth, soloLecturaServicio, crearRutasEspeciales(db), crearRutas(db));
  // m5: mismo middleware de auth para el frontend compilado (plan 3) — no hay estáticos sin identidad.
  // El motor (app/ del repo: engines UMD y presets) y los estilos compartidos, detrás de la misma auth.
  // m6: `app/` también tiene HTML de demo, tests y CLIs internos — /motor solo expone lo que carga la
  // interfaz: los engines de primer nivel (`engine-*.js`) y `presets/`. Todo lo demás, 404 (nunca el
  // listado de directorio, y nunca un fichero interno servido por accidente).
  const motor = require('./motor');
  // 09-14: tras un despliegue, el navegador siguió usando el motor viejo con la interfaz nueva (los engines, los presets,
  // los estilos e index.html no llevan hash en el nombre). Eso se revalida siempre: `no-cache` pregunta con ETag y
  // recibe 304 si no cambió. Lo que compila Vite en assets/ lleva hash: si cambia, cambia el nombre, y puede guardarse.
  const revalidar = res => res.setHeader('Cache-Control', 'no-cache');
  const estatico = (dir, extra) => express.static(dir, { index: false, cacheControl: false, setHeaders: revalidar, ...extra });
  const RUTA_ENGINE = /^\/engine-[\w-]+\.js$/;
  const rutaMotor = express.Router();
  rutaMotor.use('/presets', estatico(path.join(motor.RAIZ, 'presets')));
  rutaMotor.use((req, res, next) => {
    if (!RUTA_ENGINE.test(req.path)) return next();
    estatico(motor.RAIZ)(req, res, next);
  });
  rutaMotor.use((req, res) => res.status(404).json({ error: 'no encontrado' }));
  app.use('/motor', auth, rutaMotor);
  app.use('/estilos', auth, estatico(path.join(motor.RAIZ, '..', 'styles')));
  const CON_HASH = `${path.sep}assets${path.sep}`;
  if (opts.dirWeb) app.use(auth, estatico(opts.dirWeb, {
    index: 'index.html',
    setHeaders: (res, fichero) => (fichero.includes(CON_HASH) ? res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') : revalidar(res)),
  }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'ruta no encontrada' }));
  app.use((err, req, res, next) => {          // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado' });
    console.error(err);
    res.status(500).json({ error: 'error interno' });
  });
  app.locals.db = db;
  return app;
}

module.exports = { crearApp };
