// Identidad del que llama. Tres modos:
//  - local: un solo hogar en su propio ordenador, sin login. Válido en producción, pero el servidor solo escucha en
//    127.0.0.1 (ver src/red.js). Identidad fija; ignora x-dev-user (nadie puede hacerse pasar por otro).
//  - cloudflare: valida el JWT `Cf-Access-Jwt-Assertion` (firmado por Cloudflare Access) contra las claves
//    del equipo y la audiencia de la app. Persona = email en ALLOWED_EMAILS; servicio = common_name == SYNC_CLIENT_ID.
//  - dev: SOLO fuera de producción (tests y desarrollo); identidad fija (AUTH_DEV_EMAIL) o cabecera x-dev-user.
const { jwtVerify, createRemoteJWKSet } = require('jose');

function crearAuth(cfg) {
  const modo = cfg.modo || 'cloudflare';
  if (modo === 'local') {
    const usuario = { tipo: 'persona', email: 'local', nombre: cfg.localNombre || 'yo' };
    return (req, res, next) => { req.usuario = usuario; next(); };
  }
  if (modo === 'dev') {
    if (cfg.produccion) throw new Error('AUTH_MODE=dev está prohibido en producción');
    return (req, res, next) => {
      const email = req.get('x-dev-user') || cfg.devEmail;
      if (!email) return res.status(401).json({ error: 'sin identidad (modo dev: cabecera x-dev-user o AUTH_DEV_EMAIL)' });
      // m8: AUTH_DEV_NOMBRE fija el nombre; por defecto, la parte local del email.
      const nombre = cfg.devNombre || String(email).split('@')[0];
      req.usuario = { tipo: 'persona', email, nombre };
      next();
    };
  }
  if (modo !== 'cloudflare') throw new Error(`AUTH_MODE desconocido: ${modo} (local, dev o cloudflare)`);
  if (!cfg.aud) throw new Error('falta CF_AUD');
  if (!cfg.jwks && !cfg.teamDomain) throw new Error('falta CF_TEAM_DOMAIN');
  // m8: cada entrada de ALLOWED_EMAILS es "email" o "email:Nombre"; sin nombre, la parte local del email.
  const permitidos = new Map();
  (cfg.allowedEmails || []).map(e => e.trim()).filter(Boolean).forEach(entrada => {
    const [correo, nombre] = entrada.split(':');
    const c = correo.trim();
    if (!c) return;
    permitidos.set(c.toLowerCase(), (nombre && nombre.trim()) || c.split('@')[0]);
  });
  // m12: sin nadie autorizado (ni personas ni el token de servicio), la config está rota — mejor no arrancar.
  if (!permitidos.size && !cfg.syncClientId) throw new Error('nadie autorizado: falta ALLOWED_EMAILS o SYNC_CLIENT_ID');
  const claves = cfg.jwks || createRemoteJWKSet(new URL(`https://${cfg.teamDomain}/cdn-cgi/access/certs`));
  const issuer = cfg.issuer || `https://${cfg.teamDomain}`;
  return async (req, res, next) => {
    const token = req.get('cf-access-jwt-assertion') || cookie(req, 'CF_Authorization');
    if (!token) return res.status(401).json({ error: 'sin token de Cloudflare Access' });
    let payload;
    try { ({ payload } = await jwtVerify(token, claves, { audience: cfg.aud, issuer })); }        // I12: issuer del equipo Access
    catch (e) { return res.status(401).json({ error: 'token de Cloudflare Access no válido', detalle: e.code || e.message }); }
    const email = payload.email ? String(payload.email).toLowerCase() : null;
    if (email && permitidos.has(email)) {
      req.usuario = { tipo: 'persona', email, nombre: permitidos.get(email) };
      return next();
    }
    if (cfg.syncClientId && payload.common_name === cfg.syncClientId) {
      req.usuario = { tipo: 'servicio', clientId: payload.common_name };
      return next();
    }
    return res.status(403).json({ error: 'identidad no autorizada' });
  };
}

function cookie(req, nombre) {
  const c = req.get('cookie');
  if (!c) return null;
  const m = c.split(';').map(s => s.trim()).find(s => s.startsWith(nombre + '='));
  return m ? decodeURIComponent(m.slice(nombre.length + 1)) : null;
}

module.exports = { crearAuth };
