# -*- coding: utf-8 -*-
"""Escenarios del libro de ejemplo. Misma familia ficticia (Ana, Luis y Leo) en los dos; cambia el plan.

- ejemplo: el que se enseña (plantilla Excel y demo de la app). Todo cubierto.
- pruebas: el que usan los tests. Reproduce a propósito los casos difíciles: una cartera que no llega
  (el coche de 2031), una jubilación de plan de pensiones sin repartir y un objetivo sin identificar.

CARTERAS: (id, nombre, rentabilidad, fila de «Patrimonio Neto» con lo ya invertido o None, aporta al empezar,
           aportación mensual o None = sale del plan de pensiones de «Ingresos - Gastos», nota)
OBJ: (nombre, id de cartera, tipo, año, importe hoy, renta mensual hoy, años de consumo, nota)
"""
N_CONS = 'EJEMPLO. Mezcla con poca renta variable, para objetivos a menos de ~10 años. La rentabilidad es un SUPUESTO para jugar, no una promesa: pon la de tu producto'
N_IDX = 'EJEMPLO. 100% renta variable global indexada, para objetivos a 15+ años. Puede caer un 20-30% en un mal año: por eso no se usa para lo cercano. La rentabilidad es un SUPUESTO'
N_PP = 'EJEMPLO. La aportación mensual sale sola de «Ingresos - Gastos» (fila del plan de pensiones). La rentabilidad es un SUPUESTO'

ESCENARIOS = {
  'ejemplo': {
    'INF': 0.025, 'IMP': 0.22, 'INCR': 0.02,
    'CARTERAS': [
      ('cons', 'Cartera conservadora', 0.035, 'Cartera conservadora', 0, 380, N_CONS),
      ('idx', 'Cartera indexada global', 0.06, 'Cartera indexada global', 0, 410, N_IDX),
      ('pp', 'Plan de pensiones', 0.05, 'Plan de pensiones', 0, None, N_PP),
    ],
    'OBJ': [
      ('Cambio de coche', 'cons', 'Único', 2032, 12000, None, None,
       'A 5 años no conviene tenerlo en 100% renta variable: una caída justo antes te obliga a vender en pérdidas'),
      ('Cambio de coche', 'cons', 'Único', 2042, 12000, None, None, ''),
      ('Cambio de coche', 'cons', 'Único', 2052, 12000, None, None, ''),
      ('Reforma de la cocina', 'cons', 'Único', 2035, 8000, None, None, ''),
      ('Universidad Leo — 1.º', 'idx', 'Único', 2041, 6000, None, None,
       'Faltan 15 años: puede ir en la indexada. Cuando falten ~5, conviene pasarlo a la conservadora'),
      ('Universidad Leo — 2.º', 'idx', 'Único', 2042, 6000, None, None, ''),
      ('Universidad Leo — 3.º', 'idx', 'Único', 2043, 6000, None, None, ''),
      ('Universidad Leo — 4.º', 'idx', 'Único', 2044, 6000, None, None, ''),
      ('Jubilación', 'idx', 'Jubilación', 2058, None, 700, 25,
       'COMPLEMENTO a la pensión pública, no el total. El tipo «Jubilación» marca además el año en que dejas de aportar'),
      ('Jubilación — parte del plan de pensiones', 'pp', 'Jubilación', 2058, None, 250, 25,
       'La otra parte del complemento, pagada desde el plan de pensiones'),
    ],
  },
  'pruebas': {
    'INF': 0.0275, 'IMP': 0.22, 'INCR': 0.01,
    'CARTERAS': [
      ('grey', 'Finanbest Grey', 0.0382, None, 0, 300, 'Robo 29% RV / 71% RF corta'),
      ('metal', 'Cartera Metal', 0.06, 'Cartera indexada global', 25000, 300, 'Robo 100% RV indexada global'),
      ('pp', 'Plan de pensiones', 0.05, None, 0, None, 'La aportación sale de «Ingresos - Gastos»'),
    ],
    'OBJ': [
      ('Coche', 'grey', 'Único', 2031, 30000, None, None, ''),
      ('Universidad', 'grey', 'Único', 2041, 8000, None, None, ''),
      ('Universidad', 'grey', 'Único', 2042, 8000, None, None, ''),
      ('Universidad', 'grey', 'Único', 2043, 8000, None, None, ''),
      ('Máster', 'grey', 'Único', 2044, 9000, None, None, ''),
      ('Máster', 'grey', 'Único', 2045, 9000, None, None, ''),
      ('Jubilación', 'metal', 'Jubilación', 2057, None, 400, 45, 'Complemento a la pensión pública'),
      ('Jubilación — parte del plan de pensiones', 'pp', 'Jubilación', 2057, None, None, 45, 'Pendiente de repartir'),
      ('⚠ POR IDENTIFICAR', None, None, 2042, None, None, None, 'Objetivo sin identificar'),
    ],
  },
}
