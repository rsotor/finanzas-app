# Novedades

Qué cambia en cada versión. Se escribe solo a partir de los títulos de los pull requests
(ver [CONTRIBUTING.md](CONTRIBUTING.md#títulos-de-los-pull-requests)).

## 0.1.0 (2026-09-30)

Primera versión pública.

### Mejoras

* App de finanzas familiares en dos pantallas: **Finanzas** (ingresos, gastos, patrimonio, reparto del ahorro y colchón) y **Plan** (carteras, objetivos, proyección y veredicto «¿llegas?»).
* Escenarios para probar cambios sin tocar los datos reales.
* `npm run demo` con una familia de ejemplo y `npm run empezar` con tus datos, solo en tu ordenador.
* Personas del hogar configurables (`PERSONAS`) y modo local sin login que solo escucha en `127.0.0.1`.
* Plantilla Excel con la misma idea, y comandos de Claude Code para analizar fondos y montar el plan.

### Arreglos

* La instalación funciona en Windows (`npm install` entraba en bucle).

### Dependencias y mantenimiento

* Vite 8 y @vitejs/plugin-react 6; Node mínimo 22.12.
* Express 4.22.
