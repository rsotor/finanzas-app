(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.finanzas = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mensual(c) { return c.periodicidad === 'anual' ? c.importe / 12 : c.importe; }
  function anual(c)   { return c.periodicidad === 'anual' ? c.importe : c.importe * 12; }

  function suma(arr, f) { return arr.reduce((s, x) => s + (f(x) || 0), 0); }

  const MESES_MAX_SIMULACION = 600; // 50 años: tope de la simulación mes a mes del colchón

  // Simula mes a mes: mientras dura el paro de cada persona entra su importe; el déficit sale del colchón.
  // Devuelve meses enteros que aguanta el colchón, o Infinity si no se agota en MESES_MAX_SIMULACION.
  function mesesAguanteConParo(saldo, gasto, paro) {
    const personas = Object.values(paro || {});
    let s = saldo;
    for (let m = 1; m <= MESES_MAX_SIMULACION; m++) {
      const ingreso = suma(personas, p => (m <= (p.meses || 0) ? (p.importe || 0) : 0));
      const deficit = gasto - ingreso;
      if (deficit > 0) s -= deficit;
      if (s < 0) return m - 1;
    }
    return Infinity;
  }

  // 09-14: lo que va a una cuenta personal. Con regla = % de una base de conceptos, cada uno con su parte (p. ej. el plan
  // de pensiones al 50 % si la otra mitad la pone la empresa); sin regla, lo tecleado. Así, si cambia la nómina, cambia
  // sola la aportación. Un concepto de la base que ya no existe cuenta 0 y se devuelve en `faltan` para avisar.
  function aportacionPersonal(cuenta, conceptos) {
    const fila = { id: cuenta.id, nombre: cuenta.nombre };
    const regla = cuenta.aportacion_regla;
    if (!regla) return { ...fila, aporta: cuenta.aportacion_mensual || 0, regla: false, porcentaje: null, base: null, lineas: [], faltan: [] };
    const lineas = (regla.base || []).map(b => {
      const c = conceptos.find(x => x.id === b.concepto_id);
      const parte = b.parte == null ? 100 : b.parte;
      return { concepto_id: b.concepto_id, nombre: c ? c.nombre : null, mensual: c ? mensual(c) : 0, parte, importe: c ? mensual(c) * parte / 100 : 0 };
    });
    const base = suma(lineas, l => l.importe);
    const porcentaje = regla.porcentaje || 0;
    const faltan = lineas.filter(l => !conceptos.some(c => c.id === l.concepto_id)).map(l => l.concepto_id);
    return { ...fila, aporta: base * porcentaje / 100, regla: true, porcentaje, base, lineas, faltan };
  }

  function resumen(datos) {
    const cs = datos.conceptos || [], cu = datos.cuentas || [], ca = datos.carteras || [];
    const sup = datos.supuestos || {};
    const ingresos = cs.filter(c => c.tipo === 'ingreso'), gastos = cs.filter(c => c.tipo === 'gasto');
    const ingresosMes = suma(ingresos, mensual), gastosMes = suma(gastos, mensual);
    const porCategoria = {};
    gastos.forEach(c => { porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + mensual(c); });
    const ahorroMes = ingresosMes - gastosMes;
    const ingresosAnual = ingresosMes * 12, gastosAnual = gastosMes * 12, ahorroAnual = ahorroMes * 12;
    const liquidez = cu.filter(x => x.tipo === 'liquidez');
    const saldoColchon = suma(liquidez.filter(x => x.rol === 'colchon'), x => x.saldo);
    const gastoSupervivencia = suma(gastos.filter(c => c.esencial_en_paro), mensual);
    const meses = gastoSupervivencia > 0 ? saldoColchon / gastoSupervivencia : null;
    const mesesConParo = (sup.paro && gastoSupervivencia > 0) ? mesesAguanteConParo(saldoColchon, gastoSupervivencia, sup.paro) : null;
    const carterasTecleadas = suma(ca.filter(c => c.aportacion_origen !== 'enlazada'), c => c.aportacion_mensual);
    const aportacionesPersonales = liquidez.filter(x => x.rol === 'personal').map(x => aportacionPersonal(x, cs));
    const personales = suma(aportacionesPersonales, a => a.aporta);
    // El buffer es «el resto»: lo que no va a carteras ni a las personales se queda en la
    // cuenta buffer, no se teclea. Solo si NO hay ninguna cuenta con ese uso el resto queda «sin dueño» (aviso).
    const hayBuffer = liquidez.some(x => x.rol === 'buffer');
    const resto = ahorroMes - carterasTecleadas - personales;
    const buffer = hayBuffer ? resto : 0;
    return {
      ingresosMes, gastosMes, porCategoria, ahorroMes, ingresosAnual, gastosAnual, ahorroAnual,
      tasaAhorro: ingresosMes > 0 ? ahorroMes / ingresosMes : null,
      patrimonioNeto: suma(cu, x => x.saldo),
      interesesAnual: suma(liquidez.filter(x => x.tipo_interes), x => x.saldo * x.tipo_interes / 100),
      colchon: { saldo: saldoColchon, gastoSupervivencia, meses, mesesConParo, objetivoMeses: sup.meses_colchon || null },
      reparto: { ahorro: ahorroMes, carterasTecleadas, buffer, personales, sinDueno: hayBuffer ? 0 : resto, hayBuffer },
      aportacionesPersonales,
      liquidezSinRol: suma(liquidez.filter(x => !x.rol), x => x.saldo),
    };
  }

  return { mensual, anual, resumen, aportacionPersonal, mesesAguanteConParo, MESES_MAX_SIMULACION };
});
