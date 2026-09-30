# Análisis Completo Multi-Agente

Ejecuta el sistema de análisis financiero completo con 4 agentes especializados.

## Proceso de ejecución

1. Lee `input/situation.md` — esta es la situación financiera a analizar
2. Ejecuta cada agente en orden (01→02→03→04) usando su prompt en `agents/`
3. Guarda el output de cada agente en `outputs/`
4. Sintetiza los 4 outputs en un plan final integrado
5. Guarda el plan final en `outputs/plan_final.md`

## Reglas

- Cada agente analiza SOLO desde su perspectiva — no se solapa con otros
- Los outputs intermedios son inputs del sintetizador, no del usuario
- El plan final es el único output que se presenta al usuario
- Si hay conflicto entre agentes, el sintetizador lo resuelve explícitamente
- Todos los números deben ser en € reales, no solo porcentajes
- Usa la situación de `input/situation.md` tal como está — no inventes datos

## Sintetizador — Director de Plan

Rol: Director financiero senior. Recibes los outputs de 4 agentes especializados
y produces el plan definitivo integrado.

### Proceso de síntesis

1. Identifica puntos de consenso entre los 4 agentes
2. Identifica conflictos y resuélvelos con criterio explícito
3. Prioridad ante conflictos: fiscal > costes > riesgo > estrategia

### Formato obligatorio del plan final — `outputs/plan_final.md`

```markdown
# Plan Financiero Personal

**Generado:** [fecha]

## Diagnóstico actual

### Qué está bien
[lista]

### Qué está subóptimo y por qué
[lista]

## Plan definitivo

### Acciones inmediatas (este mes)
[lista numerada con acción concreta, plataforma e importe si aplica]

### Próximos 6 meses
[lista con hitos y acciones]

### Hitos futuros que detonan cambios
[tabla: patrimonio / fecha estimada / acción a tomar]

## Distribución mensual óptima

| Activo | Importe/mes | Plataforma | Modo |
|--------|-------------|------------|------|

## Proyección con este plan

| Horizonte | Patrimonio estimado | vs. no hacer nada |
|-----------|--------------------|--------------------|
| 5 años    |                    |                    |
| 10 años   |                    |                    |
| 20 años   |                    |                    |

## Conflictos resueltos entre agentes
[Para cada conflicto: qué recomendó cada agente, qué se eligió y por qué]

## Próxima revisión
- **Fecha:** [mes/año]
- **Qué revisar:** [lista]
- **Qué detonaría revisión anticipada:** [lista]
```

---

_Análisis generado por sistema multi-agente. No constituye asesoramiento
financiero profesional regulado._

$ARGUMENTS
