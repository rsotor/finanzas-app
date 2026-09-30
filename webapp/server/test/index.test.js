// C1: el arranque real (proceso hijo, no crearApp() en memoria) respeta el opt-in explícito y el bind a localhost.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ENTRY = path.join(__dirname, '..', 'src', 'index.js');
const lanzar = env => spawn(process.execPath, [ENTRY], { env: { ...process.env, ...env }, cwd: path.join(__dirname, '..') });
// Los directorios temporales se borran al terminar el fichero (misma higiene que db.test.js y panel.test.js).
const dirsTmp = [];
const dbTmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-idx-')); dirsTmp.push(d); return path.join(d, 'x.sqlite'); };
after(() => dirsTmp.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

test('AUTH_MODE=dev sin NODE_ENV=development está prohibido: el proceso sale con código != 0 y avisa por stderr', async () => {
  const hijo = lanzar({ NODE_ENV: '', AUTH_MODE: 'dev', PORT: '0', DB_PATH: dbTmp() });
  let stderr = '';
  hijo.stderr.on('data', d => { stderr += d; });
  const codigo = await new Promise(res => hijo.on('exit', res));
  assert.notStrictEqual(codigo, 0);
  assert.match(stderr, /prohibido/);
});

test('con NODE_ENV=development, AUTH_MODE=dev arranca y escucha solo en 127.0.0.1', async (t) => {
  const hijo = lanzar({ NODE_ENV: 'development', AUTH_MODE: 'dev', PORT: '0', DB_PATH: dbTmp(), AUTH_DEV_EMAIL: 'ana@local' });
  t.after(() => { hijo.kill(); });
  let stdout = '';
  const puerto = await new Promise((res, rej) => {
    hijo.stdout.on('data', d => {
      stdout += d.toString();
      const m = stdout.match(/escuchando en 127\.0\.0\.1:(\d+)/);
      if (m) res(Number(m[1]));
    });
    hijo.on('exit', codigo => rej(new Error(`salió antes de arrancar (código ${codigo}): ${stdout}`)));
  });
  const r = await fetch(`http://127.0.0.1:${puerto}/salud`);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { ok: true });
});
