// Enchufe con el motor de app/ (plan 1) y con los presets de producto.
const fs = require('fs');
const path = require('path');

const RAIZ = process.env.APP_DIR ? path.resolve(process.env.APP_DIR) : path.resolve(__dirname, '..', '..', '..', 'app');
const plan = require(path.join(RAIZ, 'engine-plan.js'));
const fin = require(path.join(RAIZ, 'engine-finanzas.js'));
const escenario = require(path.join(RAIZ, 'engine-escenario.js'));

// La caché se invalida si cambia el mtime de presets/index.json (para no reiniciar al añadir un preset).
let cachePresets = null, cacheMtime = null;
function cargarPresets() {
  const dir = path.join(RAIZ, 'presets');
  const rutaIndice = path.join(dir, 'index.json');
  const mtime = fs.statSync(rutaIndice).mtimeMs;
  if (cachePresets && cacheMtime === mtime) return cachePresets;
  const indice = JSON.parse(fs.readFileSync(rutaIndice, 'utf8'));
  const porId = {}, lista = [];
  for (const e of indice) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, e.file), 'utf8'));
      porId[e.file] = p;
      lista.push({ id: e.file, label: e.label, type: e.type, objetivo: e.objetivo || null, dataAsOf: p.dataAsOf || null, name: p.name || e.label });
    } catch (err) { /* un preset roto no tumba el servidor: no aparece */ }
  }
  cachePresets = { porId, lista };
  cacheMtime = mtime;
  return cachePresets;
}

// Todo lo que la UI pinta: resumen de finanzas + panel del plan (proyección, necesita, banda).
function calcular(datos) {
  const presets = cargarPresets().porId;
  const entrada = plan.prepararEntrada(datos, presets);
  return { resumen: fin.resumen(datos), panel: plan.panel(entrada) };
}

module.exports = { RAIZ, plan, fin, escenario, cargarPresets, calcular };
