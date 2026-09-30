# Presets — Sistema de Comparacion de Productos

## Benchmark de referencia

**Todos los productos se comparan contra IWDA (MSCI World EUR).**

El archivo `benchmark-iwda.json` es la vara de medir. Cuando evaluamos cualquier
producto, fondo, cartera o servicio de asesoramiento, la pregunta siempre es:
> "Habria ganado mas simplemente comprando IWDA y no tocando nada?"

## Tipos de preset

| Tipo | Significado | Ejemplo |
|------|------------|---------|
| `benchmark` | Indice de referencia contra el que se compara todo | IWDA |
| `product` | Producto concreto que puedes contratar | Cartera Metal |
| `advisory` | Servicio de asesoramiento (no producto directo) | un servicio de gestión con tarifa anual |
| `product` + `mandate: self-directed` | Cartera autogestionada (cesta de fondos que combinas tú) | Cartera ACWI de referencia |

## Estructura de un preset

```json
{
  "name": "...",
  "type": "benchmark | product | advisory",
  "provider": "...",
  "entity": {                // entidad que ofrece el producto
    "name": "...",           // nombre de la entidad
    "score": 8.9,            // score objetivo (0-10), null si no evaluada
    "category": "Excelente", // Excelente/Buena/Regular/Mala
    "ficha": "..."           // ruta a la ficha de entidad
  },
  "params": {
    "initial": 50000,      // inversion inicial por defecto
    "monthly": 1500,       // aportacion mensual por defecto
    "horizon": 15,         // anos
    "rent": 11.9,          // rentabilidad bruta anualizada (%)
    "inflation": 2
  },
  "groupCosts": [...],     // costes a nivel de servicio/plataforma
  "funds": [...],          // fondos individuales con sus costes
  "historicalReturns": {   // datos reales verificados
    "source": "...",       // de donde salen los datos
    "currency": "EUR",
    "annual": { "2020": 6.2, ... },
    "annualized_5y": 12.98
  },
  "verdict": {             // resultado de la evaluacion
    "semaforo": "green | amber | red",
    "resumen": "...",
    "report": "ruta al HTML de evaluacion o null"
  }
}
```

## Campos de cartera (extensión)

Una cartera (cesta de fondos con pesos) usa el mismo esquema que un producto, más:

| Campo | Nivel | Significado |
|-------|-------|-------------|
| `mandate` | raíz | `discretionary` (robo/todo-en-uno, se rebalancea solo) o `self-directed` (la montas y mantienes tú) |
| `dataAsOf` | raíz | fecha (ISO) del snapshot de datos del MCP |
| `composition[]` | raíz | desglose geográfico agregado con `percentage` — solo en carteras `discretionary` (el MCP no lo da por fondo) |
| `scorecardData` | raíz | por eje del scorecard: `{ "status": "no-data", "reason": "..." }` cuando no hay dato y el engine no debe puntuarlo |
| `categoryMorningstar` | fondo | categoría detallada Morningstar del MCP |
| `ter` | fondo | coste corriente (%) |
| `alloc` | fondo | `{ equity, bond, cash, other }` en % |
| `topSectors[]` | fondo | `{ name, pct }` — composición sectorial |
| `priceSeries` | fondo | serie de NAV (`start`, `currency`, `points.off`, `points.px`) para correlación/drawdown |
| `dataSource` | fondo | origen del dato |

**Regla:** el preset guarda datos crudos; los scores 0-100 de producto/cartera los calcula el
engine (no se guardan aquí). El esquema formal está en `cartera.schema.json`; valídalo con
`scripts/validate_presets.py`.

## Flujo de trabajo

1. Cuando se evalua un nuevo producto → se genera un preset JSON
2. El preset incluye `historicalReturns` con datos reales y fuente
3. Se compara siempre año a año contra `benchmark-iwda.json`
4. Si se genera un reporte HTML, se enlaza en `verdict.report`

> Los presets que trae el repo publican solo **datos del producto** (composición, costes, rentabilidades con
> fuente y fecha). No llevan `verdict`: si un producto te encaja o no depende de tu situación. `/evalua` lo
> añade al valorar un producto para ti.

