// En qué interfaz escucha el servidor. Seguro por defecto: sin login (local, dev) solo desde este ordenador.
// HOST solo se respeta en modo local y existe para Docker (dentro del contenedor hace falta 0.0.0.0; el
// docker-compose.yml publica el puerto solo en 127.0.0.1 del ordenador). Nunca lo uses para abrir la app a la red.
function hostPara(modo, env) {
  if (modo === 'cloudflare') return '0.0.0.0';
  if (modo === 'local' && env && env.HOST) return env.HOST;
  return '127.0.0.1';
}
module.exports = { hostPara };
