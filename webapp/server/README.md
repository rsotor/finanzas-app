# finanzas-server

Servidor de la app: API + SQLite + el motor de `app/`. Para usar la app no hace falta leer esto: desde la raíz,
`npm run demo` o `npm run empezar` (ver `docs/instalacion.md`). Esto es para quien quiera tocar el servidor.

## Arrancar en desarrollo

    cd webapp/server && npm install
    npm run dev          # http://127.0.0.1:3000, modo dev (identidad fija ana@local), funciona en Windows/Mac/Linux
    node ../../scripts/importar-datos.js ../../ejemplo/datos-ejemplo.json http://127.0.0.1:3000
    curl -s 127.0.0.1:3000/api/panel | head -c 400

Con `npm start` el servidor lee la configuración del entorno (ver `.env.example`): `AUTH_MODE=local` para un hogar
en su ordenador, `cloudflare` para acceso remoto con login.

## Modos de autenticación

| Modo | Para qué | Escucha en |
|---|---|---|
| `local` | Un hogar en su propio ordenador, sin login | `127.0.0.1` (o `HOST`, solo para Docker) |
| `cloudflare` | Acceso remoto detrás de Cloudflare Access | `0.0.0.0` |
| `dev` | Tests y desarrollo (exige `NODE_ENV=development`) | `127.0.0.1` |

`PERSONAS` (`id:Nombre,…`) define quién hay en el hogar: titulares y paro. La interfaz lo lee de `GET /api/config`.

## Estáticos y frontend

`/motor/*` sirve solo lo que carga la interfaz de `app/` (los `engine-*.js` de primer nivel y `presets/`; el
resto — demos, tests, CLIs — es 404) y `/estilos/*` sirve `styles/`, ambos detrás de la auth; el frontend
compilado se sirve con `WEB_DIR=../web/dist`. `POST /api/escenarios/:id/aplicar` admite `indices` (aplicar solo esos
cambios; el resto se queda en el escenario) y devuelve `restantes` (cuántos quedan) y `no_aplicados` (los índices
originales que, aun elegidos, no llegaron a escribirse por conflicto sin confirmar o por huérfano — vuelven al
escenario en vez de perderse).

## Tests

    npm test                        # node --test (los helpers viven en test-helpers/)

## Variables de entorno

Ver `.env.example`. En producción `AUTH_MODE=cloudflare` con `CF_TEAM_DOMAIN`, `CF_AUD`, `ALLOWED_EMAILS`
(admite `email:Nombre` por entrada, p. ej. `ana@x.com:Ana`), `SYNC_CLIENT_ID`; `AUTH_MODE=dev` lanza
salvo `NODE_ENV=development` explícito (nunca ponerlo en un servidor accesible). El token de servicio (`SYNC_CLIENT_ID`)
solo puede leer: cualquier método distinto de GET responde 403.

## Migraciones de esquema

Ficheros `migraciones/NNN_*.sql`, aplicados en orden al abrir la BD (tabla `migraciones`). Nunca editar
`001_inicial.sql`: un cambio de esquema es un fichero nuevo.

## Datos

`DB_PATH` (por defecto `datos/finanzas.sqlite`, ignorado por git; el directorio se crea solo si falta).
Copia consistente: `sqlite3 datos/finanzas.sqlite ".backup copia.sqlite"`.

## Seguridad

Invariantes que no dependen de la config, siempre activos:

- Sin CORS: la app y la API se sirven desde el mismo origen (o no se sirven, en desarrollo).
- El body solo se parsea como `application/json` (`express.json`); no hay soporte de `urlencoded`.
- La identidad de Cloudflare Access llega por cabecera (`Cf-Access-Jwt-Assertion`) o por la cookie
  `CF_Authorization`; el JWT se valida contra `audience` e `issuer` del equipo (nunca se confía en un
  token de otro equipo Access).
- El token de servicio (`SYNC_CLIENT_ID`) es de solo lectura: cualquier escritura con ese token es 403.
- `AUTH_MODE=dev` solo arranca con `NODE_ENV=development` explícito, y en ese caso el servidor escucha
  únicamente en `127.0.0.1` (nunca en `0.0.0.0`); sin `NODE_ENV=development`, `AUTH_MODE=dev` hace que el
  proceso no arranque.
- Sin `ALLOWED_EMAILS` ni `SYNC_CLIENT_ID` en modo `cloudflare`, el servidor tampoco arranca: una config
  así no autoriza a nadie, y es casi siempre un error de despliegue.
