// W4a: borra el directorio temporal de la BD de e2e al terminar, pero SOLO si lo generamos nosotros
// (mkdtempSync en playwright.config.js). Si vino de E2E_DIR (el usuario lo pasó a mano, p.ej. para
// inspeccionar la BD tras el test) no se toca.
import fs from 'node:fs';

export default async function globalTeardown() {
  if (process.env.E2E_DIR_AUTO && process.env.E2E_DIR) {
    fs.rmSync(process.env.E2E_DIR, { recursive: true, force: true });
  }
}
