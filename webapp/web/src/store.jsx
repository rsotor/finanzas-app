// Estado de la app: datos reales, presets, escenarios, y el interruptor "Viendo".
// Regla de diseño: LO REAL ESTÁ PROTEGIDO. Ninguna edición de datos cae directamente en la API:
// sin escenario activo, la primera edición crea (o reutiliza) el escenario automático «Cambios <fecha>» y el cambio
// se apunta ahí; lo real solo cambia al «Aplicar». Excepción: las acciones pendientes (una lista de tareas, no un
// dato firme) se escriben en lo real cuando no hay escenario activo.
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback } from 'react';
import { api } from './api.js';
import { calcular, cargarPresets, nuevoDelta, nuevoIdTemporal, esTemporal } from './motor.js';

const Ctx = createContext(null);
const COLECCIONES = ['conceptos', 'cuentas', 'carteras', 'objetivos', 'acciones'];
const RETARDO_SLIDER = 150;           // C3: el slider dispara más rápido que el resto de campos diferidos
const SIN_CAMBIOS = [];               // I6: referencia estable — ver su uso más abajo

function reducer(s, a) {
  switch (a.tipo) {
    case 'cargado': return { ...s, ...a.estado, cargando: false };
    case 'datos': return { ...s, datos: a.datos };
    case 'escenarios': return { ...s, escenarios: a.escenarios };
    case 'escenario': return { ...s, escenarios: s.escenarios.some(x => x.id === a.escenario.id) ? s.escenarios.map(x => x.id === a.escenario.id ? a.escenario : x) : [...s.escenarios, a.escenario] };
    case 'fila': return { ...s, datos: a.col === 'supuestos' ? { ...s.datos, supuestos: a.fila } : { ...s.datos, [a.col]: s.datos[a.col].some(x => x.id === a.fila.id) ? s.datos[a.col].map(x => x.id === a.fila.id ? a.fila : x) : [...s.datos[a.col], a.fila] } };
    case 'sin-fila': return { ...s, datos: { ...s.datos, [a.col]: s.datos[a.col].filter(x => x.id !== a.id) } };
    case 'viendo': return { ...s, viendo: a.id, comparar: a.id ? (s.comparar === a.id ? 'real' : s.comparar) : null };
    case 'comparar': return { ...s, comparar: a.con };
    case 'vista': return { ...s, vista: a.vista };
    case 'aviso': return { ...s, aviso: a.texto };
    case 'conflictos': return { ...s, conflictos: a.conflictos };
    case 'seleccion': return { ...s, seleccion: a.seleccion };
    case 'creando': return { ...s, creando: a.creando };
    default: return s;
  }
}

const inicial = { cargando: true, datos: null, presets: null, yo: null, personas: [], escenarios: [], revisiones: [], viendo: null, comparar: null, vista: 'plan', aviso: null, conflictos: null, seleccion: null, creando: false };

export function Proveedor({ children }) {
  const [s, dispatch] = useReducer(reducer, inicial);
  const pendientes = useRef(new Map());   // PUT diferidos (sliders) por entidad/id
  const creandoRef = useRef(null);        // promesa del POST /api/escenarios en curso (C1)
  // Espejo del estado y cola de escrituras: dos ediciones seguidas sobre la misma fila o el mismo escenario
  // deben usar el updated_at MÁS RECIENTE, no el del render en que se pulsó. Sin esto, el segundo PUT da 409.
  const ref = useRef(s); ref.current = s;
  const cola = useRef(Promise.resolve());
  const encolar = fn => { const p = cola.current.then(fn); cola.current = p.catch(() => {}); return p; };
  // El espejo se actualiza en el momento de escribir, no al renderizar: la siguiente tarea de la cola puede
  // arrancar antes de que React vuelva a pintar, y leería un updated_at viejo (409 y pérdida del cambio).
  const espejoEscenario = e => { const l = ref.current.escenarios; ref.current = { ...ref.current, escenarios: l.some(x => x.id === e.id) ? l.map(x => x.id === e.id ? e : x) : [...l, e] }; dispatch({ tipo: 'escenario', escenario: e }); };
  const espejoFila = (col, fila) => {
    const d = ref.current.datos;
    ref.current = { ...ref.current, datos: col === 'supuestos' ? { ...d, supuestos: fila } : { ...d, [col]: d[col].some(x => x.id === fila.id) ? d[col].map(x => x.id === fila.id ? fila : x) : [...d[col], fila] } };
    dispatch({ tipo: 'fila', col, fila });
  };
  const espejoSinFila = (col, id) => { const d = ref.current.datos; ref.current = { ...ref.current, datos: { ...d, [col]: d[col].filter(x => x.id !== id) } }; dispatch({ tipo: 'sin-fila', col, id }); };

  const recargar = useCallback(async () => {
    const [datos, escenarios, revisiones] = await Promise.all([api.get('/api/datos'), api.get('/api/escenarios'), api.get('/api/revisiones')]);
    ref.current = { ...ref.current, datos, escenarios, revisiones }; dispatch({ tipo: 'cargado', estado: { datos, escenarios, revisiones } });
  }, []);

  useEffect(() => {
    (async () => {
      // /api/yo puede fallar sin tumbar la app: sin identidad, el escenario automático no lleva autor y no se avisa.
      // /api/config trae las personas del hogar (PERSONAS en el servidor); sin ella solo queda el titular «conjunto».
      const [presets, datos, escenarios, revisiones, yo, config] = await Promise.all([cargarPresets(), api.get('/api/datos'), api.get('/api/escenarios'), api.get('/api/revisiones'), api.get('/api/yo').catch(() => null), api.get('/api/config').catch(() => null)]);
      dispatch({ tipo: 'cargado', estado: { presets, datos, escenarios, revisiones, yo, personas: (config && config.personas) || [] } });
    })().catch(e => dispatch({ tipo: 'aviso', texto: 'No se pudo cargar: ' + e.message }));
  }, []);

  const escenarioActivo = s.escenarios.find(e => e.id === s.viendo) || null;
  // I6: SIN_CAMBIOS es la MISMA referencia siempre — un [] nuevo en cada render invalidaría el memo de abajo
  // aunque no hubiera escenario activo, recalculando plan.panel (caro) en cada clic de fila en Real.
  const cambios = escenarioActivo ? escenarioActivo.cambios : SIN_CAMBIOS;

  // Cálculos (motor en el navegador). Real siempre; vista = real + cambios del escenario; comparar = otro escenario.
  // I6: un solo useMemo para el escenario — sin escenario activo, calcVista es directamente calcReal (ya
  // memoizado en [datos, presets]), sin volver a llamar a calcular() en cada render ajeno al escenario.
  const calcReal = useMemo(() => (s.datos && s.presets) ? calcular(s.datos, s.presets, SIN_CAMBIOS) : null, [s.datos, s.presets]);
  const calcEscenario = useMemo(() => (escenarioActivo && s.datos && s.presets) ? calcular(s.datos, s.presets, cambios) : null, [escenarioActivo, s.datos, s.presets, cambios]);
  const calcVista = escenarioActivo ? calcEscenario : calcReal;
  const escComparar = s.comparar && s.comparar !== 'real' ? s.escenarios.find(e => e.id === s.comparar) : null;
  const calcComparar = useMemo(() => {
    if (!s.viendo || !s.datos || !s.presets) return null;
    if (escComparar) return calcular(s.datos, s.presets, escComparar.cambios);
    return calcReal;
  }, [s.viendo, s.datos, s.presets, escComparar, calcReal]);

  const aviso = useCallback(texto => { dispatch({ tipo: 'aviso', texto }); if (texto) setTimeout(() => dispatch({ tipo: 'aviso', texto: null }), 6000); }, []);

  // ---- escritura en lo real ----
  // I1: resuelve true/false (éxito), para que Numero/Texto/Rango puedan revertir el campo si el servidor rechazó.
  const editarReal = (col, id, campos) => encolar(async () => {
    const d = ref.current.datos;
    const actual = col === 'supuestos' ? d.supuestos : d[col].find(x => x.id === id);
    if (!actual) return false;
    try {
      const fila = col === 'supuestos'
        ? await api.put('/api/supuestos', { ...campos, updated_at: actual.updated_at })
        : await api.put(`/api/${col}/${id}`, { ...campos, updated_at: actual.updated_at });
      espejoFila(col, fila);
      return true;
    } catch (e) {
      if (e.status === 409) { aviso('Alguien lo cambió antes: recargo los datos'); await recargar(); }
      else aviso(e.message);
      return false;
    }
  });
  const crearReal = (col, campos) => encolar(async () => {
    try { const fila = await api.post(`/api/${col}`, campos); espejoFila(col, fila); return fila; }
    catch (e) { aviso(e.message); return null; }
  });
  const borrarReal = (col, id) => encolar(async () => {
    try { await api.del(`/api/${col}/${id}`); espejoSinFila(col, id); }
    catch (e) { aviso(e.message); }
  });

  // ---- escritura en un escenario: deltas coalescidos por entidad/id, siempre sobre la última versión ----
  const mutarEscenario = (id, fn) => encolar(async () => {
    const e = ref.current.escenarios.find(x => x.id === id);
    if (!e) return;
    const cambiosNuevos = fn(e.cambios, ref.current.datos);
    try {
      const guardado = await api.put(`/api/escenarios/${e.id}`, { cambios: cambiosNuevos, updated_at: e.updated_at });
      espejoEscenario(guardado);
      return guardado;
    } catch (err) {
      if (err.status === 409) { aviso('El escenario cambió en otro sitio: recargo'); await recargar(); } else aviso(err.message);
      return null;
    }
  });
  const editarEscenario = (idEscenario, col, id, campos) => mutarEscenario(idEscenario, (lista0, datosReales) => {
    const lista = [...lista0];
    const filaReal = col === 'supuestos' ? datosReales.supuestos : datosReales[col].find(x => x.id === id);
    const i = lista.findIndex(d => d.entidad === col && (col === 'supuestos' || d.id === id) && (d.operacion === 'modificar' || d.operacion === 'crear'));
    if (i >= 0) {
      const d = lista[i];
      const va = d.operacion === 'modificar' ? { ...(d.valor_anterior || {}) } : null;
      if (va) for (const k of Object.keys(campos)) if (!(k in va)) va[k] = filaReal ? filaReal[k] : null;
      lista[i] = { ...d, campos: { ...d.campos, ...campos }, valor_anterior: va };
    } else {
      lista.push(nuevoDelta(col, 'modificar', col === 'supuestos' ? null : id, campos, filaReal));
    }
    return lista;
  });
  const crearEscenario = (idEscenario, col, campos) => {
    let id;
    // I10: si mutarEscenario falló (escenario no encontrado, 409...) no se puede fingir que la fila se
    // creó — quien llama (p. ej. seleccionar la fila nueva) se quedaría apuntando a un id que no existe.
    return mutarEscenario(idEscenario, lista => { id = nuevoIdTemporal(lista); return [...lista, nuevoDelta(col, 'crear', id, campos)]; }).then(g => (g ? { id, ...campos } : null));
  };
  const borrarEscenario = (idEscenario, col, id) => mutarEscenario(idEscenario, (lista0, datosReales) => {
    const lista = lista0.filter(d => !(d.entidad === col && d.id === id));           // quita sus modificar/crear
    if (!esTemporal(id)) lista.push(nuevoDelta(col, 'borrar', id, null, datosReales[col].find(x => x.id === id)));
    return lista;
  });

  // Cancela el PUT diferido pendiente de una clave (col/id): una escritura inmediata sobre esa misma
  // fila gana siempre a un slider que quedó a medio disparar (W1a).
  const cancelarDiferido = (col, id) => {
    const k = col + '/' + id;
    const t = pendientes.current.get(k);
    if (t !== undefined) { clearTimeout(t); pendientes.current.delete(k); }
  };

  // ---- API pública del store ----
  // Escenario automático: si no hay escenario activo, la edición crea «Cambios <fecha>» (o vuelve al de hoy si ya
  // existe) y se apunta ahí. Resuelve el id del escenario, o null si no se pudo crear (I9: se avisa; la edición
  // se rechaza y el campo revierte — lo real nunca recibe el cambio por la puerta de atrás).
  // C1: mientras un escenario se está creando (POST en vuelo) se espera a que resuelva y se usa ese.
  const fechaCorta = () => new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const quien = () => (ref.current.yo && ref.current.yo.nombre) || null;
  // En modo local sin AUTH_LOCAL_NOMBRE la identidad es «yo»: «Mis cambios», no «Cambios de yo».
  const nombreAuto = () => (quien() === 'yo' ? 'Mis cambios' : 'Cambios' + (quien() ? ' de ' + quien() : '')) + ' ' + fechaCorta();
  // Un escenario es «mío» si lo creé yo; los sin autor (anteriores a la columna) cuentan como míos solo si no sé quién soy.
  const esMio = e => (quien() ? e.creado_por === quien() : true);
  const asegurarEscenario = () => {
    if (ref.current.creando) return creandoRef.current.then(() => ref.current.viendo || null);
    if (ref.current.viendo) return Promise.resolve(ref.current.viendo);
    const nombre = nombreAuto();
    // «El de hoy» = el escenario creado hoy con la última actividad, se llame como se llame (si se renombró a
    // «Compra casa» sigue siendo el de hoy: buscar por nombre creaba un segundo escenario, revisión del 09-09).
    const esDeHoy = e => e.creado && new Date(e.creado).toDateString() === new Date().toDateString();
    const hoy = ref.current.escenarios.filter(e => esDeHoy(e) && esMio(e)).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    if (hoy) {
      ref.current = { ...ref.current, viendo: hoy.id }; dispatch({ tipo: 'viendo', id: hoy.id });
      aviso(`Lo real no se toca directamente: el cambio se apunta en «${hoy.nombre}». Aplícalo en «Qué cambia».`);
      return Promise.resolve(hoy.id);
    }
    return nuevoEscenario(nombre).then(e => {
      if (e) aviso(`Lo real no se toca directamente: el cambio se apunta en «${e.nombre}». Aplícalo en «Qué cambia».`);
      return e ? e.id : null;
    });
  };
  const directoEnReal = col => col === 'acciones' && !ref.current.viendo && !ref.current.creando;
  // I1: siempre resuelve true/false (éxito), nunca rechaza — así Numero/Texto/Rango pueden revertir el campo
  // sin necesidad de un .catch propio.
  const editar = (col, id, campos) => {
    cancelarDiferido(col, id);
    const p = directoEnReal(col) ? editarReal(col, id, campos) : asegurarEscenario().then(v => (v ? editarEscenario(v, col, id, campos) : false));
    return p.then(r => !!r, () => false);
  };
  const crear = (col, campos) => directoEnReal(col) ? crearReal(col, campos) : asegurarEscenario().then(v => (v ? crearEscenario(v, col, campos) : null));
  const borrar = (col, id) => {
    cancelarDiferido(col, id);
    return directoEnReal(col) ? borrarReal(col, id) : asegurarEscenario().then(v => (v ? borrarEscenario(v, col, id) : null));
  };
  // Para sliders: aplica ya en pantalla (optimista) y escribe al soltar. El interruptor "viendo" se
  // congela AQUÍ (al programar, vía ref.current — no s.viendo del render, que puede quedar stale si el
  // usuario dispara varias veces sin repintar) y viaja explícito al callback: si el usuario cambia de
  // pestaña antes de que salte el timeout, la escritura sigue yendo a donde se iba cuando se soltó el
  // slider, no a donde esté mirando cuando el timer por fin dispara.
  const editarDiferido = (col, id, campos) => {
    const k = col + '/' + id;
    clearTimeout(pendientes.current.get(k));
    const viendoActual = ref.current.viendo;
    pendientes.current.set(k, setTimeout(() => {
      pendientes.current.delete(k);
      // Si se soltó en un escenario, va a ese. Si se soltó en Real, el escenario automático se crea al disparar
      // (no en cada paso del arrastre): C1 ya cubre la creación en vuelo dentro de asegurarEscenario.
      if (viendoActual) editarEscenario(viendoActual, col, id, campos);
      else asegurarEscenario().then(v => { if (v) editarEscenario(v, col, id, campos); });
    }, RETARDO_SLIDER));
  };

  // `creando` se marca en el momento del clic (no al resolver): mientras el POST vuela, el panel del escenario
  // anterior se retira para que una edición rápida no caiga sobre el escenario equivocado.
  const nuevoEscenario = nombre => {
    ref.current = { ...ref.current, creando: true };
    dispatch({ tipo: 'creando', creando: true });
    const p = encolar(async () => {
      try {
        const e = await api.post('/api/escenarios', { nombre: nombre || ('Escenario' + (quien() ? ' de ' + quien() : '') + ' ' + fechaCorta()), cambios: [] });
        espejoEscenario(e);
        ref.current = { ...ref.current, viendo: e.id };
        dispatch({ tipo: 'viendo', id: e.id });
        return e;
      } catch (e) { aviso(e.message); return null; }   // I9: si falla la creación, se avisa y se sigue en Real
      finally {
        ref.current = { ...ref.current, creando: false };
        dispatch({ tipo: 'creando', creando: false });
      }
    });
    creandoRef.current = p;
    return p;
  };
  const renombrarEscenario = (id, nombre) => encolar(async () => {
    const e = ref.current.escenarios.find(x => x.id === id);
    if (!e) return;
    try { espejoEscenario(await api.put(`/api/escenarios/${id}`, { nombre, updated_at: e.updated_at })); }
    catch (err) { if (err.status === 409) { aviso('El escenario cambió en otro sitio: recargo'); await recargar(); } else aviso(err.message); }
  });
  const descartarEscenario = id => encolar(async () => {
    try {
      await api.del(`/api/escenarios/${id}`);
      ref.current = { ...ref.current, escenarios: ref.current.escenarios.filter(x => x.id !== id) };
      dispatch({ tipo: 'viendo', id: null });
      dispatch({ tipo: 'escenarios', escenarios: ref.current.escenarios.filter(x => x.id !== id) });
    } catch (e) { aviso(e.message); }   // I9: si el borrado falla, se avisa y el escenario sigue visible
  });
  // opts: { indices?: [índices de cambios a aplicar], confirmar?: true | [índices] }. Sin indices aplica todo.
  const aplicarEscenario = (id, opts) => encolar(async () => {
    const o = opts || {};
    const cuerpo = {};
    if (o.indices !== undefined) cuerpo.indices = o.indices;
    if (o.confirmar !== undefined) cuerpo.confirmar = o.confirmar;
    try {
      const r = await api.post(`/api/escenarios/${id}/aplicar`, cuerpo);
      dispatch({ tipo: 'conflictos', conflictos: null });
      if (!r.restantes) dispatch({ tipo: 'viendo', id: null });
      await recargar();
      // I5: un elegido que no se llegó a escribir (conflicto/huérfano) no desaparece en silencio — se dice cuántos y por qué.
      const nApl = (r.no_aplicados || []).length;
      const tipos = nApl ? [...new Set((r.avisos || []).filter(a => r.no_aplicados.includes(a.indice)).map(a => a.tipo))] : [];
      aviso(nApl ? `${nApl} cambio(s) no aplicados (${tipos.join(', ')}): siguen en el escenario`
        : (r.restantes ? `Aplicados; quedan ${r.restantes} cambio(s) en el escenario` : (r.avisos && r.avisos.length ? `Aplicado con ${r.avisos.length} aviso(s)` : 'Escenario aplicado a lo real')));
      return r;
    } catch (e) {
      if (e.status === 409 && e.cuerpo && e.cuerpo.confirmable) { dispatch({ tipo: 'conflictos', conflictos: { id, avisos: e.cuerpo.avisos, indices: o.indices } }); return null; }
      // El servidor manda el motivo en `detalle` (p. ej. «objetivos: el año es obligatorio»): sin él, «datos no válidos»
      // no dice qué cambio arreglar.
      aviso(e.message + (e.cuerpo && e.cuerpo.detalle ? ': ' + e.cuerpo.detalle : '') + (e.cuerpo && e.cuerpo.avisos ? ': ' + e.cuerpo.avisos.map(a => a.tipo + ' ' + a.entidad + ' ' + (a.id ?? '')).join(', ') : ''));
      return null;
    }
  });
  async function cerrarRevision(nota) {
    try { await api.post('/api/revisiones', { nota }); dispatch({ tipo: 'cargado', estado: { revisiones: await api.get('/api/revisiones') } }); aviso('Revisión cerrada'); }
    catch (e) { aviso(e.message); }
  }

  const valor = {
    // ...s va PRIMERO a propósito: expone s.aviso (el TEXTO del toast, leído por App.jsx). Antes `aviso`
    // (la función de más abajo) iba después y lo pisaba — el toast nunca mostraba nada (bug preexistente,
    // encontrado al escribir los tests de I1/I9: pasaban en falso porque nadie comprobaba el texto).
    ...s, escenarioActivo, cambios, calcReal, calcVista, calcComparar, escComparar,
    editar, editarDiferido, crear, borrar, recargar,
    mostrarAviso: aviso,   // I11(a): un componente puede lanzar un toast propio (p. ej. «concepto enlazado»)
    nuevoEscenario, renombrarEscenario, descartarEscenario, aplicarEscenario, cerrarRevision,
    setViendo: id => dispatch({ tipo: 'viendo', id }), setComparar: con => dispatch({ tipo: 'comparar', con }),
    setVista: vista => dispatch({ tipo: 'vista', vista }), cerrarConflictos: () => dispatch({ tipo: 'conflictos', conflictos: null }),
    seleccionar: seleccion => dispatch({ tipo: 'seleccion', seleccion }),
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
