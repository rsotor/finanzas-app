# Cómo colaborar

Gracias por querer mejorar la app. Tres reglas y un flujo.

## Las tres reglas

1. **Nunca datos reales.** Ni en issues, ni en tests, ni en capturas, ni en commits. Todo se reproduce con la
   familia de ejemplo (`npm run demo`). Tus datos viven en `webapp/server/datos/` y en `input/situation.md`, que
   están en `.gitignore`: no los fuerces.
2. **Cero invenciones.** Cualquier cifra del mundo real (un coste, un tramo del IRPF, una rentabilidad) lleva su
   fuente. Si no la hay, no entra.
3. **Los tests en verde.** `npm test` (motor y servidor) y, si tocas la interfaz, `npm run test:web`.

## El flujo

1. Si es algo grande, abre antes una issue de *Propuesta de mejora* para hablarlo.
2. Haz un fork, una rama y tus cambios.
3. Pasa los tests. La CI los repite en Linux, Mac y Windows.
4. Abre el pull request con la plantilla.

## Títulos de los pull requests

El [CHANGELOG](CHANGELOG.md) y las versiones se generan solos a partir del **título** de cada PR (se mergean
con *squash*: el título acaba siendo el commit). Por eso el título lleva un tipo delante, y la CI lo comprueba:

| Empieza por | Cuándo | En el changelog |
|---|---|---|
| `feat:` | Algo nuevo que ve quien usa la app | Mejoras |
| `fix:` | Arregla algo que fallaba | Arreglos |
| `perf:` | Más rápido, mismo resultado | Rendimiento |
| `docs:` | Solo documentación | Documentación |
| `build:` | Dependencias, Docker, compilación | Dependencias y mantenimiento |
| `ci:`, `test:`, `refactor:`, `chore:` | Cosas internas | (no aparece) |

El número de versión lo decide el tipo más importante desde la última: un `feat:` sube el del medio
(0.1.0 → 0.**2**.0) y un `fix:` o `perf:` sube el último (0.1.0 → 0.1.**1**). Mientras la versión empiece por
`0.`, el proyecto se considera en maduración.

Opcionalmente, entre paréntesis, la parte afectada: `feat(plan): banda pesimista en la proyección`,
`fix(instalación): npm install en Windows`.

**Publicar una versión:** cuando hay cambios nuevos en `main`, aparece solo un PR llamado «chore: versión X.Y.Z»
con el changelog al día (se actualiza con cada merge). Para publicar:

1. En ese PR, pulsa **«Approve workflows and run»**: GitHub trata al robot que lo abre como colaborador externo y
   deja su CI en pausa hasta que un mantenedor la aprueba.
2. Cuando la CI esté en verde, **mergéalo**. Se crean solas la etiqueta `vX.Y.Z` y la *Release* con sus notas.
Cuando quieras publicar, se mergea: se crea la versión en *Releases* con sus notas.

## Dónde está cada cosa

- **Cálculos** → `app/engine-*.js`, con sus tests en `app/tests/`. Si cambias un cálculo que también hace el
  Excel, el test de fidelidad (`plan-fidelidad.test.js`) te lo dirá: regenera los fixtures con
  `plantilla-excel/` (ver su README) y explica en el PR por qué cambian los números.
- **API y base de datos** → `webapp/server/` (un cambio de esquema es una migración nueva en `migraciones/`,
  nunca se edita una existente).
- **Interfaz** → `webapp/web/`.
- **Comandos de Claude** → `.claude/commands/` y `agents/`.

## Tests de interfaz en tu máquina

```bash
(cd webapp/web && npx playwright install chromium)   # una vez
npm run test:web
```
