# finanzas-app — instrucciones para Claude

## Qué es

Una app de finanzas familiares (Finanzas + Plan) y un consultor financiero independiente (fee-only) en forma
de comandos de Claude Code, con un sistema multi-agente para análisis profundos. Fiscalidad española.

**No es asesoramiento financiero.** Es una herramienta de cálculo y análisis: las decisiones son del usuario.

## Datos del usuario

- La situación del usuario está en `input/situation.md` (no versionado; se crea copiando
  `input/situation.example.md`). Todos los comandos lo leen como contexto. **Si no existe, avisa y ofrece
  crearlo desde el ejemplo; no inventes su contenido.**
- Los datos de la app (ingresos, gastos, cuentas, carteras, objetivos) viven en su base SQLite
  (`webapp/server/datos/`, no versionada). Nunca se copian al repo.
- **Nunca** subas a git datos reales de nadie: ni en tests, ni en ejemplos, ni en issues. Los ejemplos usan la
  familia ficticia (Ana, Luis y Leo) de `ejemplo/` y `plantilla-excel/`.

## Comando principal

```
/consultor [lo que necesites en lenguaje natural]
```

Orquesta todo internamente. Ejemplos: "evalúa este fondo", "compárame X vs Y", "qué opinas de este asesor",
"prepárame para la reunión del jueves", "qué es el TER", "monta mi plan".

| Subcomando | Se activa cuando... |
|------------|---------------------|
| `evalua` | Pides evaluar un producto concreto |
| `compara` | Pides comparar productos |
| `revisa-propuesta` | Traes lo que te propone un asesor |
| `evalua-asesor` | Preguntas sobre un asesor como profesional |
| `prepara-reunion` | Necesitas preparar una reunión |
| `busca` | Pides buscar opciones en internet |
| `explica` | Preguntas qué es un concepto |
| `planifica` | Quieres crear o revisar tu plan (reparte el dinero por bloques) |
| `cartera` | Quieres decidir los fondos/vehículos concretos de cada bloque (`planifica` reparte, `cartera` invierte) |
| `analiza` | Pides análisis profundo multi-agente |

## Estructura

```
input/situation.example.md  → situación de ejemplo (cópiala a input/situation.md, que no se versiona)
outputs/                    → todo lo que generan los comandos (no se versiona)

app/                        → el motor y las calculadoras
  engine-*.js                 → engines deterministas (Node + navegador), con tests en app/tests/
  simulador-fondos.html, comparador-fondos.html, cartera-global.html
  presets/                    → datos de producto (JSON con fuente y fecha) + index.json + schema
webapp/server/              → API + SQLite (ver su README)
webapp/web/                 → interfaz React + Vite (ver su README)
ejemplo/datos-ejemplo.json  → datos de la demo (npm run demo)
plantilla-excel/            → la plantilla Excel de ejemplo y sus generadores (también generan los fixtures de tests)
agents/01-04_*.md           → los 4 agentes especializados (/analiza y panel crítico de /cartera)
.claude/commands/           → los comandos
referencia/                 → guía de costes (diccionario, crece con /explica)
styles/                     → CSS compartido de reports y calculadoras
docs/                       → instalación y capturas
```

## Coherencia de documentos (fuente de verdad → derivados)

- `input/situation.md` = fuente de verdad de la situación del usuario (perfil, reparto, plataformas, decisiones).
- `app/presets/*.json` = fuente de verdad de datos de producto (con `dataAsOf` + `source`).
- Todo lo demás (reports HTML, vistas de cartera) son **vistas derivadas**: nunca contradicen su fuente.

**Sello de frescura (obligatorio en cada derivado HTML):** en la cabecera,
`Datos a fecha: YYYY-MM[-DD] · Fuente de verdad: input/situation.md`. Si la fuente es más nueva que el sello,
el derivado está STALE: banner ⚠ visible y regenerarlo en cuanto se pueda.

| Derivado | Owner (lo regenera) | Depende de |
|---|---|---|
| `outputs/reports/plan-financiero-*.html`, `decisiones-plan-*.html` | `/planifica` | `situation.md` |
| `outputs/cartera/global.html` | `/cartera` | `situation.md`, presets |
| `app/comparador-fondos.html` (lee presets en vivo) | — | `app/presets/*.json` |
| `referencia/guia-costes-inversion.html` | `/explica` | conceptos |
| `app/presets/*.json` | `/evalua`, `/cartera`, `/busca`, `/compara` | fuentes con URL |

**Regla de propagación:** si un comando modifica una fuente (`situation.md` o un preset), antes de terminar
revisa esta tabla: si es owner de un derivado afectado, lo regenera con el sello actualizado; si no, lo marca
STALE y avisa de qué hay que regenerar.

## Regla crítica: CERO invenciones

**PROHIBIDO inventar, alucinar, estimar sin base o rellenar con información ficticia.** Aplica a TODO: datos
financieros, afirmaciones, recomendaciones, URLs, nombres de productos, características de servicios.

- **Si lo sabes con certeza y es verificable** → incluye la URL de la fuente.
- **Si no estás seguro** → dilo: "no estoy seguro de esto".
- **Si no tienes el dato** → `⚠ FALTA INFO: [qué falta y a quién pedirlo]`.
- **Proyecciones** → solo si parten de datos reales con fuente citada.
- **NUNCA** un dato "porque parece razonable".

Preferir SIEMPRE "no lo sé, vamos a buscarlo".

## Reglas generales

- Todos los números en € reales, no solo porcentajes.
- Usar `input/situation.md` tal cual: no asumir datos que no estén ahí.
- Fiscalidad siempre española.
- Explicar los conceptos técnicos la primera vez que aparezcan.
- Al evaluar un producto, generar un preset compatible (`app/presets/README.md`), con `historicalReturns`,
  `verdict` y `type`, y **actualizar siempre `app/presets/index.json`**.
- `/explica` añade las entradas nuevas a `referencia/guia-costes-inversion.html`.

## Sistema multi-agente (/analiza)

Los 4 agentes de `agents/` analizan desde perspectivas independientes: **Costes**, **Fiscal**, **Riesgo** y
**Estrategia**. El sintetizador integra los cuatro. Prioridad ante conflictos: fiscal > costes > riesgo > estrategia.

## Desarrollo

- Tests: `npm test` (motor + servidor) y `npm run test:web` (Playwright). Todo en verde antes de proponer un cambio.
- Los fixtures de tests salen de `plantilla-excel/` (`generar.sh`, `datos.py`, `fixture-plan.py`): el test de
  fidelidad garantiza que el motor da lo mismo que el Excel.
- La app no sabe nada de ninguna familia concreta: las personas vienen de `PERSONAS` (ver `webapp/server/.env.example`).
