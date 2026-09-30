// Arranque del servidor. Toda la configuración viene de variables de entorno (ver README).
const path = require('path');
const { crearApp } = require('./app');
const { hostPara } = require('./red');

const env = process.env;
// C1: seguro por defecto — sin NODE_ENV=development explícito (falte del todo o venga cualquier otro
// valor) se asume producción. AUTH_MODE=dev con produccion=true lanza en crearAuth (ver src/auth.js).
const produccion = env.NODE_ENV !== 'development';
const modo = env.AUTH_MODE || 'cloudflare';
const app = crearApp({
  rutaDb: env.DB_PATH || path.join(__dirname, '..', 'datos', 'finanzas.sqlite'),
  dirWeb: env.WEB_DIR || null,
  personas: env.PERSONAS || null,
  auth: {
    modo,
    localNombre: env.AUTH_LOCAL_NOMBRE || null,
    produccion,
    devEmail: env.AUTH_DEV_EMAIL || null,
    devNombre: env.AUTH_DEV_NOMBRE || null,
    teamDomain: env.CF_TEAM_DOMAIN,
    aud: env.CF_AUD,
    allowedEmails: (env.ALLOWED_EMAILS || '').split(','),
    syncClientId: env.SYNC_CLIENT_ID || null,
  },
});
const puerto = Number(env.PORT || 3000);
// C1: sin login (local, dev) solo escucha en localhost, nunca en 0.0.0.0 (ver src/red.js).
const host = hostPara(modo, env);
if (modo === 'local' && host !== '127.0.0.1') console.warn(`⚠ modo local escuchando en ${host}: la app no tiene login. Solo tiene sentido dentro de Docker con el puerto publicado en 127.0.0.1.`);
const server = app.listen(puerto, host, () => {
  console.log(`finanzas-server escuchando en ${host}:${server.address().port} (auth ${modo})`);
});

// m7: cierre ordenado al recibir señal de parada (systemd/docker stop).
function cerrar() {
  server.close(() => { app.locals.db.close(); process.exit(0); });
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
