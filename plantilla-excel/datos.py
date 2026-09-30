# -*- coding: utf-8 -*-
"""Libro de ejemplo -> `datos` en la forma de la app (lo que importa POST /api/import).
Lee por ETIQUETAS, no por número de fila, así que sobrevive a cambios de la plantilla.
Uso: python3 plantilla-excel/datos.py <libro.xlsx> <escenario> <salida.json>"""
import sys, json, os
import openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from escenarios import ESCENARIOS

XLSX, NOMBRE_ESC, OUT = sys.argv[1:4]
ESC = ESCENARIOS[NOMBRE_ESC]
wb = openpyxl.load_workbook(XLSX, data_only=True)
ig, pn, fe = wb['Ingresos - Gastos'], wb['Patrimonio Neto'], wb['Fondo de emergencia']
fecha = pn['E1'].value.strftime('%Y-%m-%d')

def fila(ws, texto, col=1):
    for r in range(1, ws.max_row + 1):
        v = ws.cell(r, col).value
        if isinstance(v, str) and v.strip() == texto: return r
    raise KeyError(f'{ws.title}: no encuentro «{texto}»')

# ---------- conceptos ----------
TITULAR = {'Nómina neta Ana': 'ana', 'Nómina neta Luis': 'luis', 'Retribución flexible (seguro médico de empresa)': 'ana'}
NO_ESENCIAL = {'Jubilación (plan de pensiones)'}          # se suspende en una emergencia
VINCULO = {'Seguro de salud': 'Retribución flexible (seguro médico de empresa)'}
BLOQUES = {'INDISPENSABLES': 'indispensable', 'NECESARIOS': 'necesario', 'REVISABLES': 'revisable'}
conceptos, categoria, grupo, tipo = [], None, None, 'ingreso'
r_tot_gas = fila(ig, 'TOTAL GASTOS')
for r in range(5, r_tot_gas):
    a = ig.cell(r, 1).value
    if not a or not str(a).strip(): continue
    a = str(a)
    if a.strip() == 'TOTAL INGRESOS': tipo = 'gasto'; continue
    if a.strip() == 'GASTOS': continue
    if a.strip() in BLOQUES: categoria = BLOQUES[a.strip()]; continue
    b, c = ig.cell(r, 2).value, ig.cell(r, 3).value
    es_grupo = isinstance(b, str) and b.startswith('=') or ig.cell(r, 1).font.bold
    if es_grupo: grupo = a.strip(); continue
    if not b and not c: continue
    conceptos.append({'id': f'ig-{r}', 'nombre': a.strip(), 'tipo': tipo,
                      'categoria': grupo.lower() if tipo == 'ingreso' else categoria, 'grupo': grupo,
                      'importe': float(b if b else c), 'periodicidad': 'mensual' if b else 'anual',
                      'titular': TITULAR.get(a.strip(), 'conjunto'),
                      'esencial_en_paro': tipo == 'gasto' and categoria != 'revisable' and a.strip() not in NO_ESENCIAL,
                      'vinculado_a': None, 'nota_origen': ig.cell(r, 7).value or '', 'orden': len(conceptos)})
por_nombre = {c['nombre']: c['id'] for c in conceptos}
for c in conceptos: c['vinculado_a'] = por_nombre.get(VINCULO.get(c['nombre']))

# ---------- cuentas ----------
invertido_en = {inv: cid for (cid, _n, _r, inv, _e, _m, _t) in ESC['CARTERAS'] if inv}
def cuenta(nombre, id_, tipo, titular, **extra):
    r = fila(pn, nombre)
    return {'id': id_, 'nombre': nombre, 'tipo': tipo, 'titular': titular,
            'saldo': float(pn.cell(r, 5).value) * (-1 if tipo == 'deuda' else 1), 'fecha_saldo': fecha,
            'nota_origen': pn.cell(r, 7).value or '', **extra}
def inversion(nombre, id_, titular):
    return cuenta(nombre, id_, 'inversion', titular, aportado=float(pn.cell(fila(pn, nombre), 5).value),
                  cartera_id=invertido_en.get(nombre))
cuentas = [
    cuenta('Vivienda habitual', 'pn-vivienda', 'vivienda', 'conjunto'),
    cuenta('Cuenta corriente común', 'pn-corriente', 'liquidez', 'conjunto', rol=None, aportacion_mensual=None, tipo_interes=None),
    # el interés del colchón ya viaja como concepto («Intereses cuentas y depósitos»): aquí va a None para no contarlo dos veces
    cuenta('Cuenta remunerada (colchón)', 'pn-colchon', 'liquidez', 'conjunto', rol='colchon', aportacion_mensual=0, tipo_interes=None),
    cuenta('Cuenta personal Ana', 'pn-ana', 'liquidez', 'ana', rol='personal', aportacion_mensual=150.0, tipo_interes=None),
    cuenta('Cuenta personal Luis', 'pn-luis', 'liquidez', 'luis', rol='personal', aportacion_mensual=100.0, tipo_interes=None),
    inversion('Cartera conservadora', 'pn-conservadora', 'conjunto'),
    inversion('Cartera indexada global', 'pn-indexada', 'conjunto'),
    inversion('Plan de pensiones', 'pn-pp', 'luis'),
    cuenta('Hipoteca de la vivienda', 'pn-hipoteca', 'deuda', 'conjunto'),
]
if NOMBRE_ESC == 'ejemplo':
    # La demo, redonda: la cuenta corriente recoge el resto del ahorro (buffer) y las personales aportan poco,
    # para que carteras + personales no superen lo que se ahorra. El escenario de pruebas conserva los avisos
    # («liquidez sin uso», «sin dueño») porque los tests los comprueban.
    cuentas[1]['rol'] = 'buffer'
    cuentas[3]['aportacion_mensual'], cuentas[4]['aportacion_mensual'] = 80.0, 60.0
for i, c in enumerate(cuentas): c['orden'] = i

# ---------- carteras ----------
PRESET = {'grey': 'grey-finanbest.json', 'metal': 'metal-myinvestor.json'}
TITULAR_CARTERA = {'pp': 'luis'}
carteras = []
for i, (cid, nom, rent, inv, extra, mens, nota) in enumerate(ESC['CARTERAS']):
    pp = mens is None
    carteras.append({'id': cid, 'nombre': nom, 'preset_id': PRESET.get(cid), 'tipo': 'plan_pensiones' if pp else 'normal',
                     'titular': TITULAR_CARTERA.get(cid, 'conjunto'), 'rentabilidad_fuente': 'forzada',
                     'rentabilidad_forzada': round(rent * 100, 4), 'nota_origen': 'Supuesto del libro de ejemplo',
                     'aportacion_origen': 'enlazada' if pp else 'tecleada', 'aportacion_mensual': None if pp else float(mens),
                     **({'concepto_id': por_nombre['Jubilación (plan de pensiones)']} if pp else {}),
                     'aportacion_inicial': float(extra), 'techo': None, 'cartera_destino': None, 'notas': nota, 'orden': i})

# ---------- objetivos ----------
TIPOS = {'Único': 'unico', 'Renta': 'renta', 'Jubilación': 'jubilacion'}
objetivos = []
for i, (nom, car, tipo, anio, imp, renta, cons, nota) in enumerate(ESC['OBJ']):
    sin_repartir = tipo in ('Renta', 'Jubilación') and renta is None
    objetivos.append({'id': f'obj-{i+1}', 'nombre': nom, 'cartera_id': car, 'tipo': TIPOS.get(tipo), 'anio': anio,
                      'importe': (0 if sin_repartir else renta) if tipo in ('Renta', 'Jubilación') else imp,
                      'duracion_anios': cons, 'notas': nota,
                      'estado': 'falta_info' if (tipo is None or sin_repartir) else 'activo', 'orden': i})

# ---------- supuestos ----------
meses = int(fe.cell(59, 3).value)   # bloque G, «Meses que dura la prestación»
assert str(fe.cell(59, 1).value).strip() == 'Meses que dura la prestación'
paro = lambda texto: round(float(fe.cell([r for r in range(1, fe.max_row + 1) if str(fe.cell(r, 1).value or '').strip() == texto][0], 3).value), 2)
supuestos = {'fecha': fecha, 'inflacion': round(ESC['INF'] * 100, 4), 'incremento_aportacion': round(ESC['INCR'] * 100, 4),
             'meses_colchon': None, 'impuestos': 'plano', 'tipo_plano': round(ESC['IMP'] * 100, 4), 'base_fiscal_inicial': 'valor',
             'paro': {'ana': {'importe': paro('Paro neto estimado Ana'), 'meses': meses},
                      'luis': {'importe': paro('Paro neto estimado Luis'), 'meses': meses}},
             'notas': 'Supuestos del libro de ejemplo (familia ficticia). Paro: pestaña «Fondo de emergencia»'}

# ---------- acciones pendientes (ejemplos genéricos) ----------
A = [('Revisar las rentabilidades supuestas de cada cartera con los datos reales del producto', None),
     ('Decidir cuántos meses de gasto de supervivencia queremos en el colchón', {'entidad': 'cuentas', 'id': 'pn-colchon'}),
     ('Actualizar saldos y gastos una vez al año', None)]
if NOMBRE_ESC == 'pruebas':
    A.append(('Repartir la jubilación entre la cartera y el plan de pensiones', {'entidad': 'objetivos', 'id': 'obj-8'}))
acciones = [{'id': f'acc-{i+1}', 'texto': t, 'estado': 'abierta', 'ligada_a': l, 'fecha': None, 'url_taskapp': None, 'orden': i}
            for i, (t, l) in enumerate(A)]

datos = {'fecha': fecha, 'supuestos': supuestos, 'conceptos': conceptos, 'cuentas': cuentas, 'carteras': carteras,
         'objetivos': objetivos, 'acciones': acciones}
json.dump(datos, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(f'{OUT}: {len(conceptos)} conceptos, {len(cuentas)} cuentas, {len(carteras)} carteras, {len(objetivos)} objetivos, {len(acciones)} acciones')
