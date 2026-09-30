#!/usr/bin/env node
// Comprueba que la versión de Node es la misma en todos los sitios donde se declara:
// .nvmrc (la que usan la CI y nvm), los engines de los tres package.json y la imagen del Dockerfile.
// Si alguien sube el mínimo en un sitio y se olvida de otro, falla aquí y no en el ordenador de un usuario.
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const nvmrc = leer('.nvmrc').trim();
const mayor = nvmrc.split('.')[0];
const engines = ['package.json', 'webapp/server/package.json', 'webapp/web/package.json']
  .map(f => [f, (JSON.parse(leer(f)).engines || {}).node]);
const imagenes = [...leer('Dockerfile').matchAll(/^FROM node:(\d+)/gm)].map(m => m[1]);

const errores = [];
const distintos = new Set(engines.map(([, v]) => v));
if (distintos.size !== 1) errores.push(`los engines no coinciden: ${engines.map(([f, v]) => `${f}=${v}`).join(', ')}`);
for (const [f, v] of engines) {
  const m = /^>=(\d+)(\.\d+)*$/.exec(v || '');
  if (!m) errores.push(`${f}: engines.node debe ser ">=X.Y" (es ${v})`);
  else if (m[1] !== mayor) errores.push(`${f}: engines pide Node ${m[1]} y .nvmrc dice ${mayor}`);
}
if (!imagenes.length) errores.push('Dockerfile: no encuentro ninguna línea FROM node:<versión>');
for (const v of imagenes) if (v !== mayor) errores.push(`Dockerfile: usa node:${v} y .nvmrc dice ${mayor}`);

if (errores.length) { console.error('✖ Versiones de Node incoherentes:\n  - ' + errores.join('\n  - ')); process.exit(1); }
console.log(`✔ Node coherente en todo el repo: .nvmrc ${nvmrc}, engines ${[...distintos][0]}, Docker node:${mayor}`);
