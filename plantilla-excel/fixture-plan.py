# -*- coding: utf-8 -*-
"""Libro de pruebas -> app/tests/fixtures/plan-pruebas.json: ENTRADAS del plan y SALIDAS del Excel (85 filas).
Es la garantía «el motor da lo mismo que el Excel» (app/tests/plan-fidelidad.test.js).
Uso: python3 plantilla-excel/fixture-plan.py plantilla-excel/pruebas.xlsx app/tests/fixtures/plan-pruebas.json"""
import sys, os, json, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from escenarios import ESCENARIOS
XLSX, OUT = sys.argv[1:3]
ESC = ESCENARIOS['pruebas']
wb = openpyxl.load_workbook(XLSX, data_only=True)
pn, ob, pa, pr = wb['Patrimonio Neto'], wb['Objetivos'], wb['Panel'], wb['Proyección']
TIPOS = {'Único': 'unico', 'Renta': 'renta', 'Jubilación': 'jubilacion'}
carteras = []
for k, (cid, nom, rent, inv, extra, mens, _n) in enumerate(ESC['CARTERAS']):
    ya = float(ob.cell(19 + k, 3).value or 0)              # Objetivos C19.. = lo ya invertido que usa el libro
    carteras.append({'id': cid, 'nombre': nom, 'titular': 'luis' if cid == 'pp' else 'conjunto', 'rentabilidad': rent,
                     'volatilidad': None, 'inicial': ya, 'aportado': ya, 'extra': float(extra),
                     'mensual': float(pa.cell(9 + k, 3).value), 'editable': mens is not None, 'techo': None, 'destino': None})
objetivos = []
for i, (nom, car, tipo, anio, imp, renta, cons, _n) in enumerate(ESC['OBJ']):
    renta_tipo = tipo in ('Renta', 'Jubilación')
    objetivos.append({'id': f'o{i+1}', 'nombre': nom, 'carteraId': car, 'tipo': TIPOS.get(tipo), 'anio': anio,
                      'importe': ((renta or 0) if renta_tipo else imp) if tipo else None,
                      'duracion': cons or 0, 'estado': 'activo' if tipo else 'falta_info'})
entrada = {'anio0': pn['E1'].value.year, 'inflacion': ESC['INF'], 'incremento': ESC['INCR'],
           'impuestos': {'modo': 'plano', 'tipo': ESC['IMP']}, 'baseFiscalInicial': 'valor',
           'carteras': carteras, 'objetivos': objetivos}
filas = []
for r in range(6, 6 + 85):
    v = [pr.cell(r, c).value for c in range(1, 25)]
    filas.append({'anio': v[0], 'total': v[2], 'totalNeto': v[3], 'aportas': v[4], 'retiras': v[5],
                  'bolsas': [v[6:12], v[12:18], v[18:24]]})
assert all(f['anio'] for f in filas), 'faltan filas cacheadas: regenera el libro con generar.sh'
v3 = pa['A4'].value
esperado = {'veredicto': v3, 'primerAnio': int(v3.rsplit(' ', 1)[1]) if v3.startswith('⚠') else None,
            'enJubilacion': pa['B29'].value, 'necesitaExcel': [pa['D9'].value, pa['D10'].value, pa['D11'].value],
            'filas': filas}
json.dump({'fuente': 'plantilla-excel/pruebas.xlsx (escenario «pruebas», familia ficticia)', 'entrada': entrada,
           'esperado': esperado}, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('fixture ->', OUT, '| veredicto:', v3, '| en jubilación:', round(esperado['enJubilacion'], 2),
      '| ya invertido:', [c['inicial'] for c in carteras], '| mensual:', [c['mensual'] for c in carteras])
