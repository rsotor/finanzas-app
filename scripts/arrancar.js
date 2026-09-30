#!/usr/bin/env node
// Arranque de un solo comando, igual en Windows, Mac y Linux.
//   npm run demo     -> la app con la familia de ejemplo (base de datos de usar y tirar: se rehace cada vez)
//   npm run empezar  -> la app con TU base de datos (webapp/server/datos/finanzas.sqlite), vacía la primera vez
// Modo local: sin login y solo accesible desde este ordenador (http://127.0.0.1:PUERTO).
// Opciones: --puerto 3001 · --compilar (vuelve a compilar la interfaz aunque ya exista)
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const SERVIDOR = path.join(RAIZ, 'webapp', 'server');
const WEB = path.join(RAIZ, 'webapp', 'web');
const modo = process.argv[2];
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
if (!['demo', 'empezar'].includes(modo)) { console.error('uso: node scripts/arrancar.js demo|empezar [--puerto N] [--compilar]'); process.exit(2); }

const mayor = Number(process.versions.node.split('.')[0]);
if (mayor < 22) { console.error(`✖ Necesitas Node 22 o superior (tienes ${process.versions.node}). Ver docs/instalacion.md`); process.exit(1); }
for (const [dir, nombre] of [[SERVIDOR, 'servidor'], [WEB, 'interfaz']]) {
  if (!fs.existsSync(path.join(dir, 'node_modules'))) { console.error(`✖ Faltan las dependencias del ${nombre}. Ejecuta primero: npm install`); process.exit(1); }
}
if (!fs.existsSync(path.join(WEB, 'dist', 'index.html')) || process.argv.includes('--compilar')) {
  console.log('· compilando la interfaz (solo la primera vez)…');
  execSync('npm run build', { cwd: WEB, stdio: 'inherit', shell: true });
}

const dirDatos = path.join(SERVIDOR, 'datos');
fs.mkdirSync(dirDatos, { recursive: true });
const rutaDb = path.join(dirDatos, modo === 'demo' ? 'demo.sqlite' : 'finanzas.sqlite');
if (modo === 'demo') for (const f of [rutaDb, rutaDb + '-wal', rutaDb + '-shm']) fs.rmSync(f, { force: true });

const { crearApp } = require(path.join(SERVIDOR, 'src', 'app'));
const app = crearApp({
  rutaDb, dirWeb: path.join(WEB, 'dist'), personas: process.env.PERSONAS || null,
  auth: { modo: 'local', localNombre: process.env.AUTH_LOCAL_NOMBRE || null },
});
const puerto = Number(arg('--puerto', process.env.PORT || 3000));
const servidor = app.listen(puerto, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${servidor.address().port}`;
  if (modo === 'demo') {
    const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'ejemplo', 'datos-ejemplo.json'), 'utf8'));
    const r = await fetch(url + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ datos }) });
    if (!r.ok) { console.error('✖ no se pudieron cargar los datos de ejemplo:', await r.text()); process.exit(1); }
  }
  console.log(`\n✔ ${modo === 'demo' ? 'Demo con la familia de ejemplo' : 'Tu app de finanzas'} en ${url}`);
  console.log(modo === 'demo' ? '  (los cambios de la demo se pierden al cerrarla; para tus datos: npm run empezar)'
                              : `  tus datos se guardan en ${path.relative(RAIZ, rutaDb)} — haz copia de seguridad de ese fichero`);
  console.log('  Ctrl+C para cerrar.\n');
});
servidor.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `✖ El puerto ${puerto} está ocupado. Prueba: npm run ${modo} -- --puerto 3001` : `✖ ${e.message}`);
  process.exit(1);
});
const cerrar = () => servidor.close(() => { app.locals.db.close(); process.exit(0); });
process.on('SIGINT', cerrar); process.on('SIGTERM', cerrar);
