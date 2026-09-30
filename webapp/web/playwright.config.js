// Los tres recorridos de la spec (§9.1). Arranca el servidor real con el frontend compilado en dist/ y una BD temporal.
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Puerto fijo: Playwright evalúa este fichero en el runner y en cada worker, así que no puede ser aleatorio.
const puerto = Number(process.env.E2E_PORT || 3457);
const dirProvisto = process.env.E2E_DIR;
const dir = dirProvisto || fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-e2e-'));
// W4a: _teardown.js necesita saber qué directorio usar y si lo generamos nosotros (solo entonces se borra).
process.env.E2E_DIR = dir;
if (!dirProvisto) process.env.E2E_DIR_AUTO = '1';

export default defineConfig({
  testDir: 'tests',
  timeout: 30000,
  retries: 0,
  workers: 1,
  globalTeardown: './tests/_teardown.js',
  use: {
    baseURL: `http://127.0.0.1:${puerto}`, extraHTTPHeaders: { 'x-dev-user': 'ana@e2e' },
    // PW_CHROMIUM: ruta a un Chromium ya instalado, si no quieres (o no puedes) usar `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    // Configuración por `env` y no con VAR=valor delante del comando: así funciona también en Windows.
    command: 'node ../server/src/index.js',
    env: { ...process.env, PERSONAS: 'ana:Ana,luis:Luis,leo:Leo', NODE_ENV: 'development', AUTH_MODE: 'dev', AUTH_DEV_EMAIL: 'ana@e2e',
           PORT: String(puerto), DB_PATH: path.join(dir, 'e2e.sqlite'), WEB_DIR: path.resolve('dist') },
    url: `http://127.0.0.1:${puerto}/salud`,
    reuseExistingServer: false,
    timeout: 20000,
  },
});
