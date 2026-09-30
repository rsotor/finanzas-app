# Instalación

Tiempo estimado: 10 minutos. Si algo falla, mira [Problemas frecuentes](#problemas-frecuentes) y, si no está,
[abre una issue de instalación](../../../issues/new?template=instalacion.yml).

## 1. Requisitos

- **Node.js 22.12 o superior** (la versión LTS). Compruébalo con `node --version`.
  - Si no lo tienes: descárgalo de <https://nodejs.org/> (versión LTS), o usa un gestor de versiones:
    [nvm](https://github.com/nvm-sh/nvm) en Mac/Linux, [nvm-windows](https://github.com/coreybutler/nvm-windows) en Windows.
    El repo trae un `.nvmrc`: con nvm basta `nvm install && nvm use` dentro de la carpeta.
- **git**, para descargar el proyecto y actualizarlo.

## 2. Descargar e instalar

```bash
git clone https://github.com/rsotor/finanzas-app.git
cd finanzas-app
npm install
```

`npm install` instala también las dependencias del servidor y de la interfaz (tarda 1-2 minutos la primera vez).

## 3. Probar la demo

```bash
npm run demo
```

Abre <http://127.0.0.1:3000>. Verás la familia de ejemplo (Ana, Luis y Leo): la pestaña **Plan** con sus
carteras y objetivos, y **Finanzas** con ingresos, gastos, patrimonio y colchón. Toca lo que quieras: la demo
se rehace desde cero cada vez que la arrancas. `Ctrl+C` para cerrarla.

## 4. Empezar con tus datos

```bash
npm run empezar
```

Arranca con **tu** base de datos, vacía la primera vez. Se guarda en `webapp/server/datos/finanzas.sqlite`.

- **Haz copia de seguridad de ese fichero.** Es lo único que contiene tus datos.
- **Nunca se sube a git**: está en `.gitignore`, también si haces un fork.

### Tus personas

Por defecto el hogar son «Ana» y «Luis». Para usar los vuestros, define `PERSONAS` antes de arrancar
(`id:Nombre`, separados por comas). El `id` se guarda en los datos: elígelo una vez y no lo cambies.

| Sistema | Comando |
|---|---|
| Mac / Linux | `PERSONAS="marta:Marta,jon:Jon" npm run empezar` |
| Windows (PowerShell) | `$env:PERSONAS="marta:Marta,jon:Jon"; npm run empezar` |
| Windows (cmd) | `set PERSONAS=marta:Marta,jon:Jon && npm run empezar` |

Funciona con una, dos o más personas.

### Otras opciones

- Otro puerto: `npm run empezar -- --puerto 3001`
- Recompilar la interfaz (tras actualizar): `npm run empezar -- --compilar`

## 5. Actualizar

```bash
git pull
npm install
npm run empezar -- --compilar
```

Tus datos no se tocan al actualizar.

## Seguridad: por qué solo funciona en tu ordenador

`npm run demo` y `npm run empezar` usan el **modo local**: sin usuario ni contraseña, y por eso el servidor
solo escucha en `127.0.0.1`. Nadie de tu red puede entrar. **No cambies esto para "abrirla" al móvil**: mira
[Acceso desde el móvil](#opcional-acceso-desde-el-móvil).

## Opcional: Docker

Si prefieres no instalar Node:

```bash
docker compose up -d
```

App en <http://127.0.0.1:3000>, datos en `webapp/server/datos/`. El puerto se publica solo en `127.0.0.1`.
Las personas se fijan con `PERSONAS` en el entorno o en un fichero `.env` junto a `docker-compose.yml`.

## Opcional: acceso desde el móvil

Requiere exponer la app **con autenticación**. El servidor soporta
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) (`AUTH_MODE=cloudflare`):
la app valida el token firmado de Cloudflare y solo deja pasar los emails de `ALLOWED_EMAILS`. Las variables
están explicadas en `webapp/server/.env.example`. Es una configuración avanzada (dominio propio, túnel y
política de acceso): si te interesa y te atascas, abre una issue.

## Opcional: los comandos de Claude

La carpeta `.claude/commands/` trae comandos para [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
(`/consultor`, `/evalua`, `/compara`, `/planifica`, `/cartera`…). Leen tu situación de `input/situation.md`:

```bash
cp input/situation.example.md input/situation.md   # y edítalo con tus datos
```

`input/situation.md` está en `.gitignore`: tus datos no se suben.

## Problemas frecuentes

**`Necesitas Node 22.12 o superior`** — actualiza Node (paso 1).

**Error al instalar `better-sqlite3`** (mensajes con `node-gyp`, `gyp ERR!`, `prebuild-install`) —
`better-sqlite3` trae binarios precompilados para las versiones LTS de Node; si tu versión no los tiene,
intenta compilar y necesita herramientas de compilación. Lo más fácil: usar la versión LTS de Node
(`nvm install` con el `.nvmrc` del repo) y repetir `npm install`. Si aun así falla, instala las herramientas:
- Windows: "Desktop development with C++" de Visual Studio Build Tools.
- Mac: `xcode-select --install`.
- Linux (Debian/Ubuntu): `sudo apt install build-essential python3`.

**`El puerto 3000 está ocupado`** — `npm run empezar -- --puerto 3001`.

**`Faltan las dependencias`** — ejecuta `npm install` en la raíz del proyecto.

**La página sale en blanco tras actualizar** — `npm run empezar -- --compilar` y recarga el navegador.
