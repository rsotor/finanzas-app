# Plantilla Excel

**`Finanzas familiares - plantilla de ejemplo.xlsx`** es la versión hoja de cálculo de la app: finanzas
(patrimonio, ingresos y gastos, presupuesto, fondo de emergencia) y plan (carteras, objetivos y proyección),
con la familia de ejemplo. Empieza por la pestaña **Léeme**.

Pensada para Excel y Google Sheets (en Sheets: súbela a Drive y ábrela con «Hojas de cálculo de Google»).
Las fórmulas se verifican automáticamente con LibreOffice; si en tu herramienta algo no cuadra,
[abre una issue](../../../issues/new/choose).

## Para desarrolladores: los generadores

Los libros **no se editan a mano**: se generan, y de ellos salen los datos de ejemplo y los fixtures de los tests.

| Fichero | Qué hace |
|---|---|
| `escenarios.py` | Los dos planes de la familia de ejemplo: `ejemplo` (la plantilla y la demo) y `pruebas` (tests) |
| `finanzas.py`, `objetivos.py`, `leeme.py` | Construyen el libro (fórmulas, formato, gráficos) |
| `cachear.py`, `inyectar-valores.py` | Recalculan con LibreOffice, comprueban que no hay errores y que coincide con el modelo en Python, y guardan los valores (para que el fichero se vea bien aunque no recalcule) |
| `datos.py` | Libro → datos de la app (`ejemplo/datos-ejemplo.json`, `app/tests/fixtures/datos-pruebas.json`) |
| `fixture-plan.py` | Libro de pruebas → `app/tests/fixtures/plan-pruebas.json` (test de fidelidad Excel ↔ motor) |

```bash
pip install openpyxl            # y LibreOffice instalado (comando soffice)
bash plantilla-excel/generar.sh
python3 plantilla-excel/datos.py "plantilla-excel/Finanzas familiares - plantilla de ejemplo.xlsx" ejemplo ejemplo/datos-ejemplo.json
python3 plantilla-excel/datos.py plantilla-excel/pruebas.xlsx pruebas app/tests/fixtures/datos-pruebas.json
python3 plantilla-excel/fixture-plan.py plantilla-excel/pruebas.xlsx app/tests/fixtures/plan-pruebas.json
```

Limitación conocida: la columna «Necesita €/mes» del Excel es una aproximación conservadora (no descuenta lo ya
invertido ni la subida anual de la aportación). La app lo calcula exacto simulando la proyección completa.
