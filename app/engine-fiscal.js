(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.fiscal = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Tramos del IRPF de la base del ahorro (gravamen total: estatal + autonómico).
  // Fuente: AEAT — Manual práctico IRPF 2025, Capítulo 15, Gravamen estatal de la base liquidable del ahorro.
  // URL: https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-ahorro/gravamen-estatal.html
  // Modificación Ley 7/2024, de 20 de diciembre (BOE 21/12/2024): el tramo >300.000 € sube del 28 % al 30 %.
  // Consultado: 2026-06-16.
  //
  // hasta = límite superior del tramo en € (null = sin límite); tipo = % total aplicado al tramo.
  const SAVINGS_TAX_BRACKETS = [
    { hasta: 6000,   tipo: 19 },
    { hasta: 50000,  tipo: 21 },
    { hasta: 200000, tipo: 23 },
    { hasta: 300000, tipo: 27 },
    { hasta: null,   tipo: 30 },
  ];

  /**
   * Calcula el impuesto progresivo sobre una base imponible del ahorro.
   * @param {number} base - Base imponible en €.
   * @param {Array}  [brackets] - Tabla de tramos (por defecto SAVINGS_TAX_BRACKETS).
   * @returns {number} Cuota tributaria en €.
   */
  function impuestoAhorro(base, brackets) {
    brackets = brackets || SAVINGS_TAX_BRACKETS;
    if (base <= 0) return 0;
    let impuesto = 0, prev = 0;
    for (const { hasta, tipo } of brackets) {
      const tope = hasta == null ? Infinity : hasta;
      const tramo = Math.min(base, tope) - prev;
      if (tramo <= 0) continue;
      impuesto += tramo * (tipo / 100);
      prev = tope;
      if (base <= tope) break;
    }
    return impuesto;
  }

  /**
   * Estima el coste fiscal de mover una posición entre vehículos.
   * @param {Object} pos
   * @param {string} pos.origen          - 'fondo' | 'etf' | 'accion' | 'cash' | …
   * @param {string} pos.destino         - ídem
   * @param {number} pos.valorActual     - Valor de mercado actual en €.
   * @param {number|null} pos.costeAdquisicion - Precio de compra total en €. null si desconocido.
   * @param {Array}  [brackets]          - Tabla de tramos opcional (para tests o simulaciones).
   * @returns {{ coste: number|null, plusvalia: number|null, faltaInfo: boolean, motivo: string }}
   */
  function costeDeMover(pos, brackets) {
    // Traspaso entre fondos de inversión: diferimiento fiscal total (art. 94 Ley IRPF).
    if (pos.origen === 'fondo' && pos.destino === 'fondo') {
      return { coste: 0, plusvalia: null, faltaInfo: false, motivo: 'traspaso fondo→fondo sin peaje fiscal' };
    }

    // Sin coste de adquisición no se puede calcular la plusvalía — no inventar.
    if (pos.costeAdquisicion == null) {
      return { coste: null, plusvalia: null, faltaInfo: true, motivo: 'FALTA INFO: coste de adquisición desconocido' };
    }

    const plusvalia = pos.valorActual - pos.costeAdquisicion;
    const coste = plusvalia > 0 ? impuestoAhorro(plusvalia, brackets) : 0;
    return {
      coste,
      plusvalia,
      faltaInfo: false,
      motivo: plusvalia > 0 ? 'reembolso con plusvalía' : 'sin plusvalía',
    };
  }

  return { SAVINGS_TAX_BRACKETS, impuestoAhorro, costeDeMover };
});
