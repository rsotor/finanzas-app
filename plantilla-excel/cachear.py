# -*- coding: utf-8 -*-
"""Verifica el libro recalculado por LibreOffice y vuelca sus valores para cachearlos.
Falla si alguna fórmula da error o si LibreOffice y el modelo en Python (objetivos.py) discrepan en más de 1 céntimo."""
import sys, json, openpyxl
FORM, CALC, VALS, OUT = sys.argv[1:5]
f = openpyxl.load_workbook(FORM); v = openpyxl.load_workbook(CALC, data_only=True)
out, errores = {}, []
for ws in f.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith('='):
                x = v[ws.title][c.coordinate].value
                if isinstance(x, str) and x.startswith('#'): errores.append(f'{ws.title}!{c.coordinate} {x}')
                elif x is not None and not isinstance(x, bool): out[f'{ws.title}||{c.coordinate}'] = x
if errores: raise SystemExit('ERRORES DE FÓRMULA:\n  ' + '\n  '.join(errores[:20]))
peor = 0.0
for k, e in json.load(open(VALS)).items():
    sh, ref = k.split('||'); g = v[sh][ref].value
    if isinstance(e, (int, float)) and isinstance(g, (int, float)): peor = max(peor, abs(e - g))
    elif e not in ('', None) and e != g: raise SystemExit(f'DISCREPANCIA {k}: python {e!r} vs libro {g!r}')
if peor > 0.01: raise SystemExit(f'DISCREPANCIA numérica máxima {peor}')
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
print(f'{len(out)} valores · máx. diferencia python↔libro {peor:.2e}')
