#!/usr/bin/env node
// Ejecuta npm DENTRO de una carpeta: node scripts/npm-en.js <carpeta> <args de npm...>
// Sustituye a `npm --prefix <carpeta>`, que en Windows vuelve a lanzar el postinstall de la raíz y entra en bucle.
const path = require('path');
const { spawnSync } = require('child_process');
const [carpeta, ...args] = process.argv.slice(2);
if (!carpeta || !args.length) { console.error('uso: node scripts/npm-en.js <carpeta> <args de npm...>'); process.exit(2); }
const cwd = path.resolve(__dirname, '..', carpeta);
// npm_config_prefix lo hereda del npm de la raíz; si pasara, el npm hijo instalaría en la raíz otra vez.
const env = { ...process.env }; delete env.npm_config_prefix;
const r = spawnSync('npm', args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status == null ? 1 : r.status);
