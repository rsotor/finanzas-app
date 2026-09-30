#!/usr/bin/env node
// Sube un JSON de `datos` a la app: node scripts/importar-datos.js <fichero.json> <url-base> [--dev-user email]
// Contra un servidor con Cloudflare Access usa el token de servicio de Cloudflare Access desde el entorno (CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET),
// cargado con `set -a && source .env && set +a` para que nunca pase por la conversación.
const fs = require('fs');
const [fichero, base, ...resto] = process.argv.slice(2);
if (!fichero || !base) { console.error('uso: importar-datos.js <fichero.json> <url-base> [--dev-user email]'); process.exit(2); }
const datos = JSON.parse(fs.readFileSync(fichero, 'utf8'));
const cabeceras = { 'content-type': 'application/json' };
const i = resto.indexOf('--dev-user');
if (i >= 0) cabeceras['x-dev-user'] = resto[i + 1];
if (process.env.CF_ACCESS_CLIENT_ID) {
  cabeceras['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
  cabeceras['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
}
fetch(base.replace(/\/$/, '') + '/api/import', { method: 'POST', headers: cabeceras, body: JSON.stringify({ datos }) })
  .then(async r => { const j = await r.json(); console.log(r.status, JSON.stringify(j)); process.exit(r.ok ? 0 : 1); })
  .catch(e => { console.error('error:', e.message); process.exit(1); });
