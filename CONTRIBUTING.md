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
