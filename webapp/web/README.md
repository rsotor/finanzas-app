# finanzas-web

Interfaz de la app de finanzas: React + Vite. Para usar la app basta con `npm run demo` desde la raíz;
esto es para quien quiera tocar la interfaz.

## El diseño
`src/tema.css` (materiales y tipografía) + `src/estilos.css` (componentes). Una sola idea manda:

| Material | Qué significa | Dónde |
|---|---|---|
| **papel** cálido (marrón muy oscuro) | lo que la app **calcula**: se lee, no se toca | fondo, bandas, filas |
| **metal** frío (azulado) | lo que **tú escribes** | todo campo, selector y slider |
| **semáforo** verde/ámbar/rojo | en qué **estado** estás | chips y cifras de estado, nada más |
| **violeta** | un **escenario**: no es real | barra, «Qué cambia», serie comparada |

Fondo marrón y no azul a propósito: se mira de noche y el requisito era que no molestara a la vista.
Tipos: **Literata** (titulares y veredicto) + **Archivo** (interfaz y cifras, con `tabular-nums`), de Google
Fonts, con Georgia y la del sistema como respaldo. La paleta de series del gráfico (`src/Grafico.jsx`) está
validada para daltonismo y contraste sobre el fondo oscuro y es **distinta** de la del semáforo.
La app **no** usa `styles/theme.css` (ese es el de los reports del repo y no debe cambiar por esta).

## Cómo funciona
- **El motor corre en el navegador**: `index.html` carga los mismos engines UMD de `app/` que usa el servidor,
  servidos por él en `/motor` (solo los `engine-*.js` de primer nivel y `presets/`). Cada edición recalcula
  localmente sin pasar por la API (la API solo persiste); el slider de
  aportación (C3) difiere la escritura 150ms tras soltar, pero el recálculo en pantalla sigue siendo local en
  cada paso — no hay optimismo en el store, el PUT en local responde en milisegundos.
- **Un interruptor, "Viendo"**: Real o un escenario. En Real las ediciones van a la API (`PUT` con `updated_at`);
  en un escenario se convierten en deltas del escenario (`PUT /api/escenarios/:id`), coalescidos por entidad.
- **Cola de escrituras** (`store.jsx`): las escrituras se serializan y actualizan un espejo del estado al
  escribir, no al renderizar, para que dos ediciones seguidas nunca usen un `updated_at` viejo.

## Desarrollo en local
    cd webapp/server && npm run dev              # API en :3000 (modo dev, identidad ana@local)
    cd webapp/web && npm install && npm run dev  # Vite en :5180 con proxy de /api, /motor y /estilos
    # datos de ejemplo: node scripts/importar-datos.js ejemplo/datos-ejemplo.json http://localhost:3000

## Producción
    npm run build     # dist/, que el servidor sirve con WEB_DIR=<ruta a dist> (lo hace solo `npm run empezar`)

## Tests (Playwright)
    npx playwright install chromium   # una vez
    npm run build && npm test         # arranca el servidor real con BD temporal, el dist/ compilado y los datos de pruebas

Si ya tienes un Chromium instalado y no quieres descargar otro: `PW_CHROMIUM=/ruta/a/chrome npm test`.
