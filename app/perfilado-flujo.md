# Flujo de perfilado de inversor (consumido por `/cartera`, Plan 5)

Reúne las piezas del Plan 3 en el orden en que el comando las ejecuta. Las reglas duras
(`gateColchon`, `topeRV`) están en `engine-perfil.js`; las preguntas, en `cuestionario-perfil.json`.

## Orden del flujo

1. **Gate del colchón (lo primero).** Estimar la liquidez disponible desde `situation.md` y llamar
   a `engine-perfil.gateColchon(liquidez, 10000)`. Si `cubierto === false`, avisar de que faltan
   `faltan` € y **no asumir riesgo en ningún bloque** hasta cubrirlo. El perfilado de riesgo sigue,
   pero la construcción de cartera de ese bloque queda bloqueada.

2. **Confirmar lo estable de un vistazo.** Agrupar las dimensiones `estable` presentes en
   `situation.md` y mostrarlas juntas para confirmar ("Tengo: España, 2 hijos, tolerancia media,
   conocimiento en formación. ¿Sigue igual?"). Reconfirmar cualquiera con `confirmado:` de más de
   12 meses.

3. **Confirmar lo volátil.** Pedir confirmación rápida de patrimonio, ahorro/mes y valor de
   carteras (dimensión `capacidad_financiera`).

4. **Preguntar lo ausente.** Recorrer las dimensiones sin dato en `situation.md`, usando la
   `pregunta` de `cuestionario-perfil.json`. Aplicar la ramificación (no repetir lo ya cerrado).

5. **Derivar el tope de RV por bloque.** Por cada objetivo/bloque, capturar horizonte (años) y
   criticidad (`flexible` | `critico`) y llamar a `engine-perfil.topeRV(horizonte, criticidad)`.
   Ese % es el techo de renta variable que el engine de scoring (Plan 2) respeta.

6. **Proponer el diff de `situation.md`.** Mostrar el bloque actualizado (no editar sin OK).

## Plantilla del diff de `situation.md`

Reemplaza la sección informal "Perfil inversor" por esta, con metadata de frescura:

```markdown
## Perfil de inversor (validado)

**Última validación:** <YYYY-MM-DD>

| Dimensión | Valor | Frescura |
|-----------|-------|----------|
| Capacidad financiera | <ahorro/mes, patrimonio líquido> | actualizado: <YYYY-MM-DD> |
| Horizonte por objetivo | <por bloque> | confirmado: <YYYY-MM-DD> |
| Tolerancia al riesgo | <vender/aguantar/comprar> | confirmado: <YYYY-MM-DD> |
| Capacidad de pérdida | <flexible/crítico por objetivo> | confirmado: <YYYY-MM-DD> |
| Conocimiento | <nada/básico/soltura> | confirmado: <YYYY-MM-DD> |
| Restricciones y comodidad | <exclusiones, nº máx. productos, plataformas> | confirmado: <YYYY-MM-DD> |
| Fiscalidad | <planes de pensiones, Luis, traspasos> | confirmado: <YYYY-MM-DD> |

**Topes de renta variable derivados** (regla dura, `engine-perfil.topeRV`):

| Bloque | Horizonte | Criticidad | Tope RV |
|--------|-----------|------------|---------|
| <bloque> | <años> | <flexible/crítico> | <%> |

**Gate del colchón:** <cubierto / faltan X € para los 10.000>
```

## Metadata de frescura (ligera)

- Secciones **volátiles** (Patrimonio, Flujo mensual, valor de carteras): añadir `actualizado: YYYY-MM-DD`.
- Datos **estables** del perfil: añadir `confirmado: YYYY-MM-DD`.
- Se conserva la `**Última actualización:**` global del documento.
