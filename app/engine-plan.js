(function (root, factory) {
  const esNode = (typeof module !== 'undefined' && module.exports);
  const deps = esNode
    ? { fiscal: require('./engine-fiscal.js'), fuente: require('./engine-fuente-rentabilidad.js'), fin: require('./engine-finanzas.js') }
    : { get fiscal() { return (root.SimEngine || {}).fiscal; },
        get fuente() { return (root.SimEngine || {}).fuenteRentabilidad; },
        get fin()    { return (root.SimEngine || {}).finanzas; } };
  const api = factory(deps);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.plan = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  const ANIOS = 85;      // build-objetivos.py: ANIOS = 85
  const SIGMA = 1;       // engine-proyeccion.js: SIGMA = 1
  const EPS = 0.01;
  const clonar = x => JSON.parse(JSON.stringify(x));

  // Clona la entrada, aplica una mutación sobre la copia y la devuelve — patrón repetido en necesitaAlMes, banda y conRentabilidadSegura.
  function variante(e, mutar) { const e2 = clonar(e); mutar(e2); return e2; }

  const TIPOS_CON_DURACION = ['renta', 'jubilacion'];

  // Único sitio que decide si un objetivo entra en la proyección. Nunca se duplica el criterio:
  // proyectar, necesitaAlMes y bandaDe usan siempre .modelables; sinModelar sale siempre de .excluidos.
  function objetivosModelables(e) {
    const idsCarteras = new Set(e.carteras.map(c => c.id));
    const modelables = [], excluidos = [];
    e.objetivos.forEach(o => {
      let motivo = null;
      if (o.estado === 'falta_info') motivo = 'falta_info';
      else if (o.carteraId == null) motivo = 'sin_cartera';
      else if (!idsCarteras.has(o.carteraId)) motivo = 'cartera_desconocida';
      else if (!o.tipo) motivo = 'sin_tipo';
      else if (typeof o.importe !== 'number') motivo = 'sin_importe';
      else if (TIPOS_CON_DURACION.includes(o.tipo) && (typeof o.duracion !== 'number' || o.duracion <= 0)) motivo = 'sin_duracion';
      if (motivo) excluidos.push({ id: o.id, nombre: o.nombre, anio: o.anio, importe: o.importe == null ? null : o.importe, motivo });
      else modelables.push(o);
    });
    return { modelables, excluidos };
  }

  // Reparte un impuesto calculado sobre la suma de plusvalías de un titular entre sus bolsas, proporcional a cada plusvalía.
  function impuestosPorTitular(items, cfg) {
    if (cfg.modo === 'plano') return items.map(it => it.plusvalia * cfg.tipo);
    const porTitular = {};
    items.forEach((it, k) => { const t = it.titular || 'conjunto'; (porTitular[t] = porTitular[t] || []).push(k); });
    const out = items.map(() => 0);
    Object.values(porTitular).forEach(ks => {
      const total = ks.reduce((s, k) => s + items[k].plusvalia, 0);
      if (total <= 0) return;
      const imp = deps.fiscal.impuestoAhorro(total);
      ks.forEach(k => { out[k] = imp * items[k].plusvalia / total; });
    });
    return out;
  }

  function proyectar(e) {
    const anio0 = e.anio0, INF = e.inflacion, INCR = e.incremento, cfg = e.impuestos;
    const cars = e.carteras;
    const { modelables: objs, excluidos: sinModelar } = objetivosModelables(e);
    const jub = objs.filter(o => o.tipo === 'jubilacion').map(o => o.anio - anio0);
    const AFIN = jub.length ? Math.min(...jub) : 999;                       // AFIN = min(...) or 999
    const idx = {}; cars.forEach((c, k) => { idx[c.id] = k; });
    const bolsas = cars.map(() => ({ val: 0, base: 0, re: 0, coste: 0 }));
    const filas = [];
    for (let a = 1; a <= ANIOS; a++) {
      const ap = cars.map(c => {                                             // aportación del año
        if (a >= AFIN) return 0;
        if (a === 1) return c.mensual * 12 + c.inicial + c.extra;           // ap = mens*12 + ini (ini = invertido + extra)
        return c.mensual * 12 * Math.pow(1 + INCR, a - 1);
      });
      // desviación declarada: techo → destino. Se compara con el valor TRAS el rescate del año anterior
      // (val - coste), no con el bruto: si un rescate ya vació la bolsa, vuelve a aportar a sí misma.
      // Se itera hasta punto fijo (encadena A→B→C aunque el array no venga en ese orden).
      let cambio = true, pasos = 0;
      while (cambio && pasos < cars.length) {
        cambio = false; pasos++;
        cars.forEach((c, k) => {
          if (c.techo != null && c.destino != null && a > 1 && ap[k] > EPS &&
              (bolsas[k].val - bolsas[k].coste) >= c.techo && idx[c.destino] != null) {
            ap[idx[c.destino]] += ap[k]; ap[k] = 0; cambio = true;
          }
        });
      }
      const est = cars.map((c, k) => {
        const b = bolsas[k];
        let val, base;
        if (a === 1) {
          val = ap[k];
          base = e.baseFiscalInicial === 'aportado' ? Math.max(0, ap[k] - c.inicial + c.aportado) : ap[k];   // Excel: base = ap
        } else {
          val = Math.max(0, (b.val - b.coste) * (1 + c.rentabilidad) + ap[k]);
          base = Math.max(0, b.base - (b.val ? b.re * b.base / b.val : 0) + ap[k]);
        }
        let pedido = 0; const pedidoPor = [];
        objs.filter(o => o.carteraId === c.id).forEach(o => {
          const d = o.anio - anio0; let x = 0;
          if (o.tipo === 'unico') { if (d === a) x = o.importe * Math.pow(1 + INF, d); }
          else if (d <= a && a < d + o.duracion) x = o.importe * 12 * Math.pow(1 + INF, a);
          if (x > 0) { pedido += x; pedidoPor.push({ id: o.id, nombre: o.nombre, importe: x }); }
        });
        const re = Math.min(val, pedido);
        const sc = Math.max(0, pedido - val);
        const plusvalia = val ? re * Math.max(0, val - base) / val : 0;
        const latente = Math.max(0, val - base);
        return { ap: ap[k], val, base, re, sc, pedido, plusvalia, latente, titular: c.titular, pedidoPor };
      });
      const imp = impuestosPorTitular(est, cfg);                             // coste = re + plusvalía·IMP
      const impLatente = impuestosPorTitular(est.map(s => ({ plusvalia: s.latente, titular: s.titular })), cfg);
      const fila = { a, anio: anio0 + a, total: 0, totalNeto: 0, aportas: 0, retiras: 0, sinCubrir: 0, bolsas: [] };
      est.forEach((s, k) => {
        const coste = s.re + imp[k];
        bolsas[k] = { val: s.val, base: s.base, re: s.re, coste };
        fila.bolsas.push({ carteraId: cars[k].id, ap: s.ap, val: s.val, base: s.base, re: s.re, coste, sc: s.sc, pedido: s.pedido, impuesto: imp[k], pedidoPor: s.pedidoPor });
        fila.total += s.val; fila.totalNeto += s.val - impLatente[k];
        fila.aportas += s.ap; fila.retiras += s.re; fila.sinCubrir += s.sc;
      });
      filas.push(fila);
    }
    const agot = filas.filter(f => f.sinCubrir > EPS);
    let primerObjetivo = null, objetivosSinCubrir = [];
    if (agot.length) {
      const b = agot[0].bolsas.find(x => x.sc > EPS);
      if (b && b.pedidoPor.length) {
        objetivosSinCubrir = b.pedidoPor.map(p => ({ id: p.id, nombre: p.nombre, importe: p.importe }));
        primerObjetivo = objetivosSinCubrir.reduce((m, o) => (o.importe > m.importe ? o : m)).nombre;
      }
    }
    const anioJubilacion = AFIN === 999 ? null : anio0 + AFIN;
    const filaJub = filas.find(f => f.anio === anioJubilacion);
    return {
      anio0, afin: AFIN === 999 ? null : AFIN, anioJubilacion, filas,
      veredicto: {
        ok: agot.length === 0, primerAnio: agot.length ? agot[0].anio : null, primerObjetivo, objetivosSinCubrir,
        conSinModelar: sinModelar.length > 0,
        texto: agot.length ? `⚠ NO LLEGAS: el primer objetivo que se queda sin pagar es ${primerObjetivo ? primerObjetivo + ', ' : ''}en ${agot[0].anio}`
                           : '✓ Todos los objetivos se pagan',
      },
      sinModelar,
      enJubilacion: filaJub ? filaJub.totalNeto : null,
    };
  }

  function sinCubrirDe(e, k) { return proyectar(e).filas.reduce((s, f) => s + f.bolsas[k].sc, 0); }

  // Aportación mensual mínima con la que la bolsa k no deja nada sin cubrir. NO es monótono con
  // techo+destino: subir la aportación puede hacer que la bolsa cruce el techo antes y le corten la
  // aportación entera hacia otra cartera, empeorando su cobertura. Por eso, en vez de una bisección
  // directa, primero se hace un barrido grueso para encontrar un tramo [lo, hi] donde el primer punto
  // ya cubre, y solo ahí se biseca (dentro de ese tramo sí es razonable asumir monotonía local).
  function necesitaAlMes(e, carteraId) {
    const k = e.carteras.findIndex(c => c.id === carteraId);
    if (k < 0) throw new Error('cartera desconocida: ' + carteraId);
    const aportas = e.carteras[k].mensual;
    const tiene = objetivosModelables(e).modelables.some(o => o.carteraId === carteraId);
    if (!tiene) return { necesita: null, aportas, faltan: 0, estado: 'sin_objetivos' };
    const con = m => sinCubrirDe(variante(e, e2 => { e2.carteras[k].mensual = m; }), k);
    // estado y faltan se derivan siempre de con(aportas), nunca de comparar aportas con necesita:
    // con techo puede haber más aportación y peor cobertura.
    const conNecesita = necesita => (con(aportas) <= EPS)
      ? { necesita, aportas, faltan: 0, estado: 'cubierta' }
      : { necesita, aportas, faltan: Math.max(0, necesita - aportas), estado: 'faltan' };
    if (con(0) <= EPS) return conNecesita(0);
    let hi = 100;
    while (con(hi) > EPS) { hi *= 2; if (hi > 1e6) return { necesita: Infinity, aportas, faltan: Infinity, estado: 'inalcanzable' }; }
    const N = 256;
    let lo = 0;
    for (let i = 1; i <= N; i++) {
      const mi = hi * i / N;
      if (con(mi) <= EPS) { hi = mi; break; }
      lo = mi;
    }
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (con(mid) > EPS) lo = mid; else hi = mid; }
    const necesita = Math.ceil(hi * 100) / 100;
    return conNecesita(necesita);
  }

  function bandaDe(e, c) {
    const objs = objetivosModelables(e).modelables.filter(o => o.carteraId === c.id);
    if (!objs.length) return { h: null, banda: 0 };            // sin objetivos modelables: no hay horizonte del que calcular banda
    const h = Math.max(1, Math.min(...objs.map(o => o.anio)) - e.anio0);
    if (c.volatilidad == null) return { h, banda: 0 };
    return { h, banda: SIGMA * c.volatilidad / Math.sqrt(h) };
  }

  function banda(e, proyeccionBase) {
    const bandas = e.carteras.map(c => { const b = bandaDe(e, c); return { carteraId: c.id, h: b.h, banda: b.banda, sinBanda: b.banda === 0 }; });
    const con = signo => proyectar(variante(e, e2 => {
      e2.carteras.forEach((c, k) => { c.rentabilidad = Math.max(-0.999, c.rentabilidad + signo * bandas[k].banda); });
    }));
    return { pesimista: con(-1), base: proyeccionBase || proyectar(e), optimista: con(+1), bandas };
  }

  function prepararEntrada(datos, presets) {
    presets = presets || {};
    const anio0 = new Date(datos.fecha).getFullYear();
    if (Number.isNaN(anio0)) throw new Error('prepararEntrada: datos.fecha no es una fecha válida: ' + datos.fecha);
    if (!datos.supuestos) throw new Error('prepararEntrada: faltan datos.supuestos');
    const s = datos.supuestos;
    if (typeof s.inflacion !== 'number') throw new Error('prepararEntrada: supuestos.inflacion no es un número');
    if (typeof s.incremento_aportacion !== 'number') throw new Error('prepararEntrada: supuestos.incremento_aportacion no es un número');
    const carteras = (datos.carteras || []).map(c => {
      const cuentas = (datos.cuentas || []).filter(x => x.cartera_id === c.id);
      const r = deps.fuente.resolver(c, c.preset_id ? presets[c.preset_id] : null);
      let mensual = c.aportacion_mensual || 0;
      if (c.aportacion_origen === 'enlazada') {
        const con = (datos.conceptos || []).find(x => x.id === c.concepto_id);
        mensual = con ? deps.fin.mensual(con) : 0;
      }
      return {
        id: c.id, nombre: c.nombre, titular: c.titular || 'conjunto', tipo: c.tipo || 'normal',
        rentabilidad: r.rentabilidad == null ? null : r.rentabilidad / 100,
        volatilidad: r.volatilidad == null ? null : r.volatilidad / 100,
        fuente: r,
        inicial: cuentas.reduce((t, x) => t + (x.saldo || 0), 0),
        aportado: cuentas.reduce((t, x) => t + (x.aportado || 0), 0),
        extra: c.aportacion_inicial || 0, mensual,
        editable: c.aportacion_origen !== 'enlazada',
        techo: c.techo == null ? null : c.techo, destino: c.cartera_destino || null,
      };
    });
    const objetivos = (datos.objetivos || []).map(o => ({
      id: o.id, nombre: o.nombre, carteraId: o.cartera_id == null ? null : o.cartera_id, tipo: o.tipo || null,
      anio: o.anio, importe: o.importe == null ? null : o.importe, duracion: o.duracion_anios || 0, estado: o.estado || 'activo',
    }));
    return {
      anio0, inflacion: (s.inflacion || 0) / 100, incremento: (s.incremento_aportacion || 0) / 100,
      impuestos: s.impuestos === 'plano' ? { modo: 'plano', tipo: (s.tipo_plano == null ? 22 : s.tipo_plano) / 100 } : { modo: 'tramos' },
      baseFiscalInicial: s.base_fiscal_inicial || 'aportado',
      carteras, objetivos,
    };
  }

  // Una cartera sin rentabilidad resoluble se proyecta al 0 % y se marca: nunca con un valor inventado.
  function conRentabilidadSegura(e) {
    return variante(e, e2 => { e2.carteras.forEach(c => { if (c.rentabilidad == null) c.rentabilidad = 0; }); });
  }

  function panel(e) {
    const es = conRentabilidadSegura(e);
    const proyeccion = proyectar(es);
    // sin rentabilidad ORIGINAL (antes de forzarla a 0 %): no hay necesita ni banda que valga, solo el aviso.
    const sinDato = new Set(e.carteras.filter(c => c.rentabilidad == null).map(c => c.id));
    const carteras = es.carteras.map(c => {
      const base = { id: c.id, nombre: c.nombre, editable: c.editable !== false, fuente: c.fuente || null,
        faltaInfo: !!(c.fuente && c.fuente.faltaInfo) || sinDato.has(c.id) };
      if (sinDato.has(c.id)) return Object.assign(base, { necesita: null, aportas: c.mensual, faltan: null, estado: 'sin_dato' });
      return Object.assign(base, necesitaAlMes(es, c.id));
    });
    const b = banda(es, proyeccion);
    b.bandas.forEach(bd => { if (sinDato.has(bd.carteraId)) { bd.sinBanda = true; bd.banda = 0; } });
    return { proyeccion, carteras, banda: b };
  }

  return { ANIOS, SIGMA, EPS, clonar, proyectar, impuestosPorTitular, objetivosModelables, necesitaAlMes, bandaDe, banda, prepararEntrada, panel };
});
