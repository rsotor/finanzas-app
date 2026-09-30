// Vista Finanzas (ronda 2, "B2"): lista de lectura agrupada con filtros, colchón por grupo y «+ añadir»;
// al elegir una fila, sus campos se editan en el panel de la derecha. Patrimonio con la misma mecánica.
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store.jsx';
import { Texto, Numero, Selector, Casilla, Area } from './Campo.jsx';
import QueCambia from './QueCambia.jsx';
import { E, E2, P, N } from './formato.js';

const CATEGORIAS = ['indispensable', 'necesario', 'revisable'];
const TIPOS_CUENTA = [['liquidez', 'Liquidez'], ['inversion', 'Inversión'], ['plan_pensiones', 'Plan de pensiones'], ['vivienda', 'Vivienda'], ['deuda', 'Deuda']];
// «Uso» en pantalla, `rol` en los datos. Toda cuenta de liquidez debe tener uno: la opción vacía solo existe mientras falta.
const USOS = [['colchon', 'colchón (emergencia, intocable)'], ['buffer', 'buffer (gastos irregulares, se queda el resto)'], ['personal', 'personal (libre disposición)']];
const usosPara = rol => rol ? USOS : [[null, '⚠ elige un uso'], ...USOS];
// Titulares posibles: las personas del hogar (PERSONAS en el servidor, vía /api/config) y «conjunto».
const titulares = personas => [[null, '—'], ...(personas || []).map(p => [p.id, p.nombre]), ['conjunto', 'conjunto']];
const mensual = c => c.periodicidad === 'anual' ? c.importe / 12 : c.importe;
// Icono ⓘ con la explicación al pasar el ratón (o al enfocarlo con teclado): la ayuda no ocupa sitio en el panel.
// Sin aria-label con el texto: colisionaría con getByLabel de los campos. El globo sale al pasar el ratón, al enfocar
// con teclado o al pulsar (táctil), y se cierra al pulsar otra vez o al perder el foco.
export function Ayuda({ texto }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <span className={'ayuda-wrap' + (abierta ? ' abierta' : '')} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setAbierta(false); }}>
      <button type="button" className="ayuda" aria-expanded={abierta} onClick={() => setAbierta(a => !a)}>ⓘ</button>
      <span className="ayuda-pop" role="tooltip">{texto}</span>
    </span>
  );
}
// I7: role="button" no activa con teclado por sí solo (no es un <button> real) — Enter/Espacio seleccionan la fila.
const teclaFila = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

export default function VistaFinanzas() {
  const s = useStore();
  const calc = s.calcVista;
  // C2(a): un escenario que rompe el motor (p. ej. inflación vacía) no deja la vista sin salida: se avisa
  // y, si hay escenario activo, «Qué cambia» sigue disponible para desmarcar o descartar el cambio.
  if (calc.error || !calc.resumen) return (
    <>
      <section><p className="alerta">El motor no puede calcular: {calc.error}</p></section>
      {s.viendo && <QueCambia />}
    </>
  );
  const r = calc.resumen;
  const cmp = s.viendo && s.calcComparar ? s.calcComparar.resumen : null;
  const Dato = ({ titulo, v, f = E, cv, sub }) => (
    <div className="dato"><small>{titulo}</small><b>{f(v)}</b>{cmp && <span className="comparado">vs {f(cv)}</span>}{sub && <small>{sub}</small>}</div>
  );
  const col = r.colchon;
  const [verColchon, setVerColchon] = useState(false);
  const semaforo = col.meses == null ? '' : (col.objetivoMeses == null ? 'ambar' : (col.meses >= col.objetivoMeses ? 'verde' : 'rojo'));
  // Medidor del colchón: qué parte del objetivo tenéis cubierta. Sin objetivo no hay contra qué medir,
  // así que la barra sale llena en ámbar (es lo mismo que dice el semáforo: «sin decidir»).
  const llenado = col.meses == null ? 0
    : col.objetivoMeses == null ? 1
      : Math.max(0, Math.min(1, (Number.isFinite(col.meses) ? col.meses : col.objetivoMeses) / col.objetivoMeses));
  return (
    <>
      <section aria-label="Resumen">
        {/* 09-14: dos columnas — a la izquierda la cuenta de la casa y el estado de hoy, a la derecha adónde va el ahorro.
            En una sola columna quedaba alto y con media pantalla vacía. En móvil se apila. */}
        <div className="resumen">
          <div className="resumen-cuenta">
          {/* La fila de arriba es la cuenta de la casa: ingresos − gastos = ahorro. El orden de los tres
              primeros .dato es el que asume dia1-finanzas.spec (el ahorro es el tercero). */}
          <div className="ecuacion">
            <Dato titulo="Ingresos / mes" v={r.ingresosMes} cv={cmp && cmp.ingresosMes} />
            <Dato titulo="Gastos / mes" v={r.gastosMes} cv={cmp && cmp.gastosMes} />
            <Dato titulo="Ahorro / mes" v={r.ahorroMes} cv={cmp && cmp.ahorroMes} sub={P(r.tasaAhorro == null ? null : r.tasaAhorro * 100, 1)} />
          </div>
          <div className="estado-hoy">
            <Dato titulo="Patrimonio neto" v={r.patrimonioNeto} cv={cmp && cmp.patrimonioNeto} />
            <div className="dato dato-boton" role="button" tabIndex={0} onClick={() => setVerColchon(true)} onKeyDown={teclaFila(() => setVerColchon(true))} aria-label="colchón: cómo se calcula" title="Cómo se calcula y qué tocar"><small>Colchón <span className="silencio">ⓘ</span></small><b className={semaforo}>{N(col.meses)} meses</b>
              <span className={'medidor ' + semaforo} aria-hidden="true" style={{ '--llenado': llenado }}><i /></span>
              <small>sin ingresos · objetivo {col.objetivoMeses ?? 'sin decidir'}</small></div>
            {r.liquidezSinRol > 0 && <Dato titulo="⚠ Liquidez sin uso" v={r.liquidezSinRol} cv={cmp && cmp.liquidezSinRol} sub="asigna un uso en Patrimonio" />}
          </div>
          </div>
          <Reparto r={r.reparto} rc={cmp && cmp.reparto} ap={r.aportacionesPersonales} apc={cmp && cmp.aportacionesPersonales} />
        </div>
      </section>
      {/* «Qué cambia» va a lo ancho y arriba, igual que en Plan: si estás en un escenario, es lo primero. */}
      {s.viendo && <QueCambia />}
      {verColchon && <ModalColchon col={col} cerrar={() => setVerColchon(false)} />}
      <div className="dos-fin">
        <div>
          <Conceptos />
          <Cuentas />
        </div>
        <div>
          <PanelEdicion />
          <Revisiones />
        </div>
      </div>
    </>
  );
}

// Adónde va el ahorro (09-14; antes vivía en Plan): justo debajo de ingresos − gastos = ahorro, que es de donde sale.
// En Plan queda la línea «Total a carteras» con el mismo desglose, para que las dos vistas cuadren a la vista.
function Reparto({ r, rc, ap, apc }) {
  const F = ({ t, v, cv, b }) => <tr><td>{b ? <b>{t}</b> : t}</td><td className="num">{b ? <b>{E2(v)}</b> : E2(v)}{rc && <span className="comparado">vs {E2(cv)}</span>}</td></tr>;
  // Una línea por cuenta personal (09-14): con regla se ve de dónde sale; en un escenario, el «vs» dice si van 100 o 400.
  const PorCuenta = ({ a }) => {
    const c = apc && apc.find(x => x.id === a.id);
    return (
      <tr className="sub" data-testid={`reparto-cuenta-${a.id}`}>
        <td>{a.nombre} <span className="silencio">{a.regla ? `(${N(a.porcentaje, 2)} % de ${E2(a.base)})` : '(fija)'}</span>{a.faltan.length > 0 && <span className="alerta"> ⚠ falta un concepto de la base</span>}</td>
        <td className="num">{E2(a.aporta)}{apc && <span className="comparado">vs {c ? E2(c.aporta) : '—'}</span>}</td>
      </tr>
    );
  };
  return (
    <div className="reparto" role="group" aria-label="Reparto del ahorro">
      {/* El ahorro no se repite aquí: está justo al lado, en la cuenta de la casa. Las explicaciones van al ⓘ. */}
      <h3>Reparto del ahorro <Ayuda texto="Adónde va el ahorro de cada mes. A carteras se teclea en Plan; a cada cuenta personal, en su «Aporta €/mes» (Patrimonio). El buffer no se teclea: es el resto. El plan de pensiones ya está dentro de los gastos y no se resta otra vez." /></h3>
      <table className="filas"><tbody>
        <F t="A carteras" v={r.carterasTecleadas} cv={rc && rc.carterasTecleadas} />
        <F t="A cuentas personales" v={r.personales} cv={rc && rc.personales} />
        {(ap || []).map(a => <PorCuenta key={a.id} a={a} />)}
        {r.hayBuffer
          ? <F t="Al buffer (el resto)" v={r.buffer} cv={rc && rc.buffer} b />
          : <F t="⚠ Sin dueño (ninguna cuenta con uso buffer)" v={r.sinDueno} cv={rc && rc.sinDueno} b />}
      </tbody></table>
    </div>
  );
}

// Explica el colchón con los datos reales y dice dónde se toca cada pieza: para entenderlo dentro de diez meses sin
// tener que releer el código. El objetivo en meses se edita aquí mismo (es el mismo dato de Plan › Supuestos).
function ModalColchon({ col, cerrar }) {
  const s = useStore();
  const datos = s.calcVista.datos, sp = datos.supuestos || {};
  const cuentasColchon = datos.cuentas.filter(k => k.tipo === 'liquidez' && k.rol === 'colchon');
  const esenciales = datos.conceptos.filter(c => c.tipo === 'gasto' && c.esencial_en_paro);
  const caja = useRef(null);
  // Diálogo modal de verdad (mismo patrón que Conflictos en QueCambia.jsx): foco al abrir, Escape cierra y Tab no se
  // escapa al fondo — sin esto el teclado sigue navegando por la lista que hay detrás del overlay.
  useEffect(() => { if (caja.current) caja.current.focus(); }, []);
  // Escape cierra aunque el foco haya vuelto al body (p. ej. tras Enter en el campo, que suelta el foco).
  useEffect(() => {
    const alPulsar = e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('keydown', alPulsar, true);
    return () => document.removeEventListener('keydown', alPulsar, true);
  }, [cerrar]);
  const alTeclear = e => {
    if (e.key !== 'Tab' || !caja.current) return;
    const focables = [...caja.current.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled);
    if (!focables.length) return;
    const primero = focables[0], ultimo = focables[focables.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === caja.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };
  const paro = quien => sp.paro && sp.paro[quien] ? `${E(sp.paro[quien].importe)}/mes durante ${sp.paro[quien].meses ?? '—'} meses` : 'sin dato';
  return (
    <div className="modal-fondo" onClick={cerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Colchón: cómo se calcula" ref={caja} tabIndex={-1} onKeyDown={alTeclear} onClick={e => e.stopPropagation()}>
        <div className="panel-cab"><h2>Colchón · {N(col.meses)} meses</h2><button className="suave" onClick={cerrar} aria-label="cerrar" title="Cerrar (Esc)">×</button></div>
        <h3>Cómo se calcula</h3>
        <p><b>{E(col.saldo)}</b> de saldo en las cuentas con rol <i>colchón</i> ÷ <b>{E(col.gastoSupervivencia)}/mes</b> de gastos marcados como esenciales en paro = <b>{N(col.meses)} meses</b> sin ningún ingreso.</p>
        <ul className="modal-lista">
          {cuentasColchon.map(k => <li key={k.id}>{k.nombre}: {E(k.saldo)}</li>)}
          {cuentasColchon.length === 0 && <li className="alerta">Ninguna cuenta tiene el rol colchón: el saldo es 0.</li>}
          <li>{esenciales.length} gastos marcados ☑ como esenciales (de {datos.conceptos.filter(c => c.tipo === 'gasto').length}).</li>
        </ul>
        {col.mesesConParo != null && <p><b>Otro escenario, aparte: con paro aguantaríais {Number.isFinite(col.mesesConParo) ? `${col.mesesConParo} meses` : 'más de 50 años'}.</b> Es si {s.personas.length === 1 ? 'te quedas' : `os quedáis ${s.personas.length === 2 ? 'los dos' : 'todos'}`} sin trabajo pero cobrando la prestación: {s.personas.map(p => `${p.nombre} ${paro(p.id)}`).join(' · ')}. No entra en el semáforo.</p>}
        <h3>Objetivo</h3>
        <p><label>Meses <b>sin ningún ingreso</b> que queréis tener cubiertos: <Numero valor={sp.meses_colchon} onCambio={v => s.editar('supuestos', null, { meses_colchon: v })} ancho="4em" decimales={0} aria-label="colchón: meses objetivo" /></label> <span className="silencio">{sp.meses_colchon == null ? 'sin decidir: el semáforo sale ámbar hasta que lo pongas' : (col.meses >= sp.meses_colchon ? `cubierto (verde): tenéis ${N(col.meses)}` : `por debajo (rojo): tenéis ${N(col.meses)}, harían falta ${E(sp.meses_colchon * col.gastoSupervivencia)}`)}</span></p>
        <p className="silencio">El semáforo compara el objetivo con los meses <b>sin ingresos</b> ({N(col.meses)}), no con los de con paro{col.mesesConParo != null ? ` (${Number.isFinite(col.mesesConParo) ? col.mesesConParo : '> 50 años'})` : ''}: el colchón cubre el desfase hasta cobrar el paro y el imprevisto gordo, no la pérdida de ingresos.</p>
        <h3>Qué tocar para cambiarlo</h3>
        <ul className="modal-lista">
          <li><b>El saldo</b> → en Patrimonio, la cuenta con rol colchón (edita su saldo o cambia qué cuenta tiene ese rol).</li>
          <li><b>Qué gastos cuentan</b> → la casilla ☑ de cada gasto en el panel de edición, o el selector «colchón» de cada grupo.</li>
          <li><b>El paro</b> → Plan › Supuestos (importe y meses de cada uno).</li>
          <li><b>El objetivo en meses</b> → aquí arriba, o en Plan › Supuestos.</li>
        </ul>
      </div>
    </div>
  );
}

function agrupar(conceptos) {
  const orden = ['ingreso', ...CATEGORIAS];
  const mapa = new Map();
  for (const c of conceptos) {
    const cat = c.tipo === 'ingreso' ? 'ingreso' : (c.categoria || 'sin categoría');
    const clave = cat + '|' + (c.grupo || '');
    if (!mapa.has(clave)) mapa.set(clave, { clave, tipo: c.tipo, categoria: c.tipo === 'ingreso' ? c.categoria : cat, grupo: c.grupo || null, titulo: (c.tipo === 'ingreso' ? 'Ingresos' : cat) + (c.grupo ? ' · ' + c.grupo : ''), filas: [] });
    mapa.get(clave).filas.push(c);
  }
  // m8: una categoría que no está en `orden` (legado sin categoría) va al final, no al principio —
  // indexOf da -1 para "no encontrado", y -1 ordena ANTES de 0 si no se corrige.
  const posicion = g => { const i = orden.indexOf(g.tipo === 'ingreso' ? 'ingreso' : g.categoria); return i < 0 ? Infinity : i; };
  return [...mapa.values()].sort((a, b) => posicion(a) - posicion(b));
}

// Grupos plegados: preferencia de cada navegador, no un dato de la app. Sin almacenamiento dura lo que la pestaña.
const CLAVE_PLEGADOS = 'finanzas.grupos-plegados';
function leerPlegados() {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_PLEGADOS) || '[]')); } catch { return new Set(); }
}

function Conceptos() {
  const s = useStore();
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [plegados, setPlegados] = useState(leerPlegados);
  const datos = s.calcVista.datos;
  const visibles = datos.conceptos.filter(c => (filtro === 'todos' || (filtro === 'ingresos' ? c.tipo === 'ingreso' : c.tipo === 'gasto' && c.categoria === filtro)) && (!busca || c.nombre.toLowerCase().includes(busca.toLowerCase())));
  const grupos = agrupar(visibles);
  const sel = s.seleccion;
  const guardarPlegados = set => { setPlegados(set); try { localStorage.setItem(CLAVE_PLEGADOS, JSON.stringify([...set])); } catch { /* sin almacenamiento */ } };
  const alternar = clave => { const n = new Set(plegados); if (n.has(clave)) n.delete(clave); else n.add(clave); guardarPlegados(n); };
  // Buscando se abre todo (lo que buscas tiene que verse), y el grupo de la fila elegida no se pliega bajo el panel.
  const abierto = g => !!busca || !plegados.has(g.clave) || (!!sel && sel.col === 'conceptos' && g.filas.some(c => c.id === sel.id));
  const hayAbiertos = grupos.some(abierto);
  const colchonGrupo = g => { const n = g.filas.filter(c => c.esencial_en_paro).length; return n === 0 ? 'ninguno' : n === g.filas.length ? 'todos' : 'mixto'; };
  const ponerColchon = (g, v) => g.filas.filter(c => !!c.esencial_en_paro !== v).forEach(c => s.editar('conceptos', c.id, { esencial_en_paro: v }));
  const nuevoEn = g => s.crear('conceptos', { nombre: 'Nuevo', tipo: g.tipo, categoria: g.categoria, grupo: g.grupo, importe: 0, periodicidad: 'mensual', esencial_en_paro: g.tipo === 'gasto' && g.categoria !== 'revisable', nota_origen: '' }).then(f => f && s.seleccionar({ col: 'conceptos', id: f.id }));
  return (
    <section aria-label="Ingresos y gastos">
      <div className="filtros"><h2 style={{ marginRight: 'auto' }}>Ingresos y gastos</h2>
        {['todos', 'ingresos', ...CATEGORIAS].map(f => <button key={f} className={'pildora' + (filtro === f ? ' activa' : '')} onClick={() => setFiltro(f)}>{f}</button>)}
        <input className="campo" placeholder="buscar…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="buscar concepto" style={{ width: '10em' }} />
        <button className="suave" onClick={() => guardarPlegados(hayAbiertos ? new Set(agrupar(datos.conceptos).map(g => g.clave)) : new Set())}>{hayAbiertos ? 'plegar todo' : 'desplegar todo'}</button>
      </div>
      <ul className="lista">
        {grupos.map(g => (
          <React.Fragment key={g.clave}>
            {/* El total del grupo lleva el `margin-right:auto` (en la hoja de estilos): así los controles se
                pegan a la derecha en la MISMA línea, sin que un margen automático los tire a una segunda. */}
            <li className={'grupo-h' + (abierto(g) ? '' : ' plegado')}><button type="button" className="plegar" aria-expanded={abierto(g)} onClick={() => alternar(g.clave)}><span aria-hidden="true">{abierto(g) ? '▾' : '▸'}</span><span className="h">{g.titulo}</span></button><span className="silencio">· {E(g.filas.reduce((t, c) => t + mensual(c), 0))}/mes</span>
              {g.tipo === 'gasto' && <label className="silencio">colchón: <Selector valor={colchonGrupo(g)} opciones={[['todos', 'todos ☑'], ['ninguno', 'ninguno ☐'], ['mixto', 'mixto ◐']]} onCambio={v => { if (v === 'todos') ponerColchon(g, true); if (v === 'ninguno') ponerColchon(g, false); }} aria-label={`colchón ${g.titulo}`} /></label>}
              <button className="suave" onClick={() => nuevoEn(g)}>+ añadir</button></li>
            {abierto(g) && g.filas.map(c => (
              <li key={c.id} className={'fila' + (sel && sel.col === 'conceptos' && sel.id === c.id ? ' sel' : '')} data-id={c.id} onClick={() => s.seleccionar({ col: 'conceptos', id: c.id })} onKeyDown={teclaFila(() => s.seleccionar({ col: 'conceptos', id: c.id }))} role="button" tabIndex={0} aria-label={`concepto ${c.nombre}`}>
                <span>{c.nombre}</span><span className="num">{E2(c.importe)}</span><span className="silencio">/{c.periodicidad === 'anual' ? 'año' : 'mes'}</span><span className="num silencio">{E2(mensual(c))}/mes</span><span className="silencio">{c.tipo === 'gasto' ? (c.esencial_en_paro ? '☑' : '☐') : ''}</span><span className="origen">{c.nota_origen || ''}</span>
              </li>
            ))}
          </React.Fragment>
        ))}
      </ul>
      <p><button className="suave" onClick={() => s.crear('conceptos', { nombre: 'Nuevo', tipo: 'gasto', categoria: 'necesario', grupo: 'Nuevo grupo', importe: 0, periodicidad: 'mensual', esencial_en_paro: true, nota_origen: '' }).then(f => f && s.seleccionar({ col: 'conceptos', id: f.id }))}>+ nuevo grupo</button> <span className="silencio">(crea un concepto y en el panel escribes el nombre del grupo)</span></p>
    </section>
  );
}

function Cuentas() {
  const s = useStore();
  const datos = s.calcVista.datos;
  const sel = s.seleccion;
  const tipos = [...new Set(datos.cuentas.map(k => k.tipo))];
  const nombreTipo = t => (TIPOS_CUENTA.find(x => x[0] === t) || [t, t])[1];
  const cartera = id => { const c = datos.carteras.find(x => x.id === id); return c ? '→ ' + c.nombre : ''; };
  return (
    <section aria-label="Patrimonio">
      <div className="filtros"><h2 style={{ marginRight: 'auto' }}>Patrimonio · {datos.cuentas.length} cuentas</h2>
        <button className="suave" onClick={() => s.crear('cuentas', { nombre: 'Nueva cuenta', tipo: 'liquidez', titular: 'conjunto', saldo: 0, nota_origen: '' }).then(f => f && s.seleccionar({ col: 'cuentas', id: f.id }))}>+ añadir cuenta</button></div>
      <ul className="lista lista-cuentas">
        {tipos.map(t => (
          <React.Fragment key={t}>
            <li className="grupo-h"><span className="h">{nombreTipo(t)}</span></li>
            {datos.cuentas.filter(k => k.tipo === t).map(k => (
              <li key={k.id} className={'fila' + (sel && sel.col === 'cuentas' && sel.id === k.id ? ' sel' : '')} data-id={k.id} onClick={() => s.seleccionar({ col: 'cuentas', id: k.id })} onKeyDown={teclaFila(() => s.seleccionar({ col: 'cuentas', id: k.id }))} role="button" tabIndex={0} aria-label={`cuenta ${k.nombre}`}>
                <span>{k.nombre}</span><span className="silencio">{k.tipo === 'liquidez' ? (k.rol || '⚠ sin uso') : cartera(k.cartera_id)}</span><span /><span className="num">{E(k.saldo)}</span><span /><span className="origen">{[k.tipo_interes != null && `${P(k.tipo_interes)} TAE`, k.aportado != null && `aportado ${E(k.aportado)}`, k.titular].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </React.Fragment>
        ))}
      </ul>
      <p className="silencio">Fecha de los datos: {datos.fecha}. Al editar un saldo se fecha hoy.</p>
    </section>
  );
}

function PanelEdicion() {
  const s = useStore();
  const sel = s.seleccion;
  const datos = s.calcVista.datos;
  const fila = sel && (datos[sel.col] || []).find(x => x.id === sel.id);
  // Escape cierra el panel cuando no hay un campo con el foco (dentro de un campo, Escape deshace y suelta el foco:
  // el segundo Escape ya cierra). El evento del campo no llega aquí porque su target es el input.
  useEffect(() => {
    if (!fila) return undefined;
    // Solo los campos de texto (Texto/Numero/Area) tienen Escape propio (deshacer + soltar foco); un select o una casilla
    // no tienen nada que deshacer, así que ahí Escape cierra directamente.
    const esTexto = t => t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'range');
    const alPulsar = e => { if (e.key === 'Escape' && !esTexto(e.target)) { e.target.blur && e.target.blur(); s.seleccionar(null); } };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [fila, s]);
  if (!fila) return <section className="panel-edicion" aria-label="Edición"><p className="silencio">Elige una fila de la lista para editarla aquí.</p></section>;
  const ed = campos => s.editar(sel.col, fila.id, campos);
  const F = ({ t, children }) => <div className="campo-fila"><span className="silencio">{t}</span><div>{children}</div></div>;
  const Cabecera = ({ sub }) => (
    <div className="panel-cab"><h2>{fila.nombre} <span className="silencio">· {sub}</span></h2>
      <button className="suave" onClick={() => s.seleccionar(null)} aria-label="cerrar panel" title="Cerrar (Esc)">×</button></div>
  );
  if (sel.col === 'conceptos') {
    const grupos = [...new Set(datos.conceptos.filter(c => c.tipo === fila.tipo && c.grupo).map(c => c.grupo))];
    // I11(a): "enlazado" es en cualquier dirección — el propio vinculado_a, o ser el destino del de otro
    // (p. ej. retribución flexible ↔ seguro de salud: solo uno de los dos lleva vinculado_a).
    const otrosConceptos = datos.conceptos.filter(c => c.id !== fila.id);
    const enlazadoCon = (fila.vinculado_a && otrosConceptos.find(c => c.id === fila.vinculado_a))
      || otrosConceptos.find(c => c.vinculado_a === fila.id) || null;
    const edImporte = v => {
      const r = ed({ importe: v ?? 0 });
      if (enlazadoCon) Promise.resolve(r).then(() => s.mostrarAviso(`Este concepto va unido a «${enlazadoCon.nombre}»: revisa también su importe`));
      return r;
    };
    return (
      <section className="panel-edicion" aria-label="Edición">
        <Cabecera sub={(fila.tipo === 'ingreso' ? 'ingreso' : fila.categoria) + (fila.grupo ? ' · ' + fila.grupo : '')} />
        <F t="Nombre"><Texto valor={fila.nombre} onCambio={v => ed({ nombre: v || fila.nombre })} ancho="100%" aria-label="nombre" /></F>
        <F t="Importe"><Numero moneda valor={fila.importe} onCambio={edImporte} aria-label={`importe ${fila.nombre}`} /> <Selector valor={fila.periodicidad} opciones={[['mensual', 'al mes'], ['anual', 'al año']]} onCambio={v => ed({ periodicidad: v })} /></F>
        {fila.tipo === 'gasto' && <F t={<>Prioridad <Ayuda texto="Indispensable, necesario o revisable. Es la prioridad del gasto; el grupo (Vivienda, Seguros…) es el tema." /></>}><Selector valor={fila.categoria} opciones={CATEGORIAS} onCambio={v => ed({ categoria: v })} /></F>}
        <F t="Grupo"><Texto valor={fila.grupo} onCambio={v => ed({ grupo: v || null })} list="grupos" placeholder="elige o escribe uno nuevo" ancho="100%" aria-label="grupo" /><datalist id="grupos">{grupos.map(g => <option key={g} value={g} />)}</datalist></F>
        {fila.tipo === 'gasto' && <F t="Colchón"><label><Casilla valor={fila.esencial_en_paro} onCambio={v => ed({ esencial_en_paro: v })} aria-label={`colchón ${fila.nombre}`} /> lo cubre si nos quedamos sin ingresos</label></F>}
        <F t="Titular"><Selector valor={fila.titular} opciones={titulares(s.personas)} onCambio={v => ed({ titular: v })} /></F>
        <F t={<>Vinculado a <Ayuda texto="Va unido a otro concepto (p. ej. retribución flexible ↔ seguro de salud): al cambiar el importe de uno, la app avisa de revisar el otro." /></>}><Selector valor={fila.vinculado_a} opciones={[[null, '— ninguno'], ...otrosConceptos.map(c => [c.id, c.nombre])]} onCambio={v => ed({ vinculado_a: v })} aria-label="vinculado a" /></F>
        <F t="Origen"><Area valor={fila.nota_origen} onCambio={v => ed({ nota_origen: v })} rows={2} placeholder="de dónde sale" ancho="100%" aria-label="origen" /></F>
        <div className="botones"><span className="silencio">Se guarda al salir del campo</span><button className="peligro" style={{ marginLeft: 'auto' }} onClick={() => { if (window.confirm(`¿Borrar «${fila.nombre}»?`)) { s.borrar('conceptos', fila.id); s.seleccionar(null); } }}>Borrar</button></div>
      </section>
    );
  }
  const carteras = [[null, '—'], ...datos.carteras.map(c => [c.id, c.nombre])];
  return (
    <section className="panel-edicion" aria-label="Edición">
      <Cabecera sub="cuenta" />
      <F t="Nombre"><Texto valor={fila.nombre} onCambio={v => ed({ nombre: v || fila.nombre })} ancho="100%" aria-label="nombre" /></F>
      <F t="Tipo"><Selector valor={fila.tipo} opciones={TIPOS_CUENTA} onCambio={v => ed({ tipo: v })} /></F>
      {fila.tipo === 'liquidez' && <F t="Uso"><Selector valor={fila.rol} opciones={usosPara(fila.rol)} onCambio={v => ed({ rol: v })} aria-label={`uso ${fila.nombre}`} /></F>}
      <F t="Titular"><Selector valor={fila.titular} opciones={titulares(s.personas)} onCambio={v => ed({ titular: v })} /></F>
      <F t="Saldo"><Numero moneda valor={fila.saldo} onCambio={v => ed({ saldo: v ?? 0, fecha_saldo: new Date().toISOString().slice(0, 10) })} aria-label={`saldo ${fila.nombre}`} /> <span className="silencio">a fecha {fila.fecha_saldo || '—'}</span></F>
      {fila.tipo === 'liquidez' && fila.rol === 'personal' && <AportaPersonal fila={fila} ed={ed} />}
      {fila.tipo === 'liquidez' && fila.rol === 'buffer' && <F t="Aporta €/mes"><span className="silencio">el resto del ahorro, no se teclea (ver Plan › Reparto)</span></F>}
      {fila.tipo === 'liquidez' && <F t="TAE %"><Numero valor={fila.tipo_interes} onCambio={v => ed({ tipo_interes: v })} ancho="5em" /></F>}
      {(fila.tipo === 'inversion' || fila.tipo === 'plan_pensiones') && <><F t="Cartera"><Selector valor={fila.cartera_id} opciones={carteras} onCambio={v => ed({ cartera_id: v })} /></F><F t="Aportado"><Numero moneda valor={fila.aportado} onCambio={v => ed({ aportado: v })} /> <span className="silencio">coste de adquisición</span></F></>}
      <F t="Origen"><Area valor={fila.nota_origen} onCambio={v => ed({ nota_origen: v })} rows={2} ancho="100%" aria-label="origen" /></F>
      <F t="Detalles"><Area valor={fila.detalles} onCambio={v => ed({ detalles: v })} rows={3} ancho="100%" placeholder="entidad, IBAN, acceso, contacto… (solo se ve aquí)" aria-label={`detalles ${fila.nombre}`} /></F>
      <div className="botones"><span className="silencio">Se guarda al salir del campo</span><button className="peligro" style={{ marginLeft: 'auto' }} onClick={() => { if (window.confirm(`¿Borrar «${fila.nombre}»?`)) { s.borrar('cuentas', fila.id); s.seleccionar(null); } }}>Borrar</button></div>
    </section>
  );
}

// Fuera de los componentes: un componente definido dentro del render se vuelve a montar en cada repintado.
const CampoFila = ({ t, children }) => <div className="campo-fila"><span className="silencio">{t}</span><div>{children}</div></div>;

// 09-14: «Aporta €/mes» de una cuenta personal. Fija (tecleada) o un % de una base de conceptos, cada uno con su parte
// (el plan al 50 % si la otra mitad la pone la empresa). La operación sale escrita con números para comprobarla a ojo.
function AportaPersonal({ fila, ed }) {
  const s = useStore();
  const datos = s.calcVista.datos;
  const ap = ((s.calcVista.resumen && s.calcVista.resumen.aportacionesPersonales) || []).find(a => a.id === fila.id);
  const regla = fila.aportacion_regla;
  const edRegla = cambios => ed({ aportacion_regla: { ...regla, ...cambios } });
  const edLinea = (i, cambios) => edRegla({ base: regla.base.map((b, j) => (j === i ? { ...b, ...cambios } : b)) });
  // Al añadir, se propone el primer ingreso del mismo titular (su nómina); se cambia en el selector.
  const propuesto = (datos.conceptos.find(c => c.tipo === 'ingreso' && c.titular === fila.titular) || datos.conceptos[0] || {}).id;
  const opciones = b => {
    const lista = datos.conceptos.map(c => [c.id, `${c.nombre} · ${E2(mensual(c))}/mes`]);
    return datos.conceptos.some(c => c.id === b.concepto_id) ? lista : [[b.concepto_id, '⚠ concepto borrado'], ...lista];
  };
  return (
    <>
      <CampoFila t="Aporta €/mes">
        <Selector valor={regla ? 'regla' : 'fija'} opciones={[['fija', 'fija'], ['regla', '% de una base']]} aria-label={`modo aportación ${fila.nombre}`}
          onCambio={m => ed({ aportacion_regla: m === 'regla' ? { porcentaje: 10, base: propuesto ? [{ concepto_id: propuesto, parte: 100 }] : [] } : null })} />
        {!regla && <Numero moneda valor={fila.aportacion_mensual} onCambio={v => ed({ aportacion_mensual: v })} aria-label={`aporta ${fila.nombre}`} />}
      </CampoFila>
      {regla && <>
        <CampoFila t="Porcentaje"><Numero valor={regla.porcentaje} onCambio={v => edRegla({ porcentaje: v ?? 0 })} ancho="5em" aria-label={`porcentaje ${fila.nombre}`} /><span className="silencio">% de la base</span></CampoFila>
        <CampoFila t={<>Base <Ayuda texto="Los conceptos que suman la base, cada uno con la parte que cuenta (100 % entero; 50 % si solo cuenta la mitad)." /></>}>
          <ul className="base-regla">
            {regla.base.map((b, i) => (
              <li key={i}>
                <Selector valor={b.concepto_id} opciones={opciones(b)} onCambio={v => v && edLinea(i, { concepto_id: v })} aria-label={`base ${i + 1} ${fila.nombre}`} />
                <Numero valor={b.parte ?? 100} onCambio={v => edLinea(i, { parte: v ?? 100 })} ancho="4.5em" aria-label={`parte ${i + 1} ${fila.nombre}`} /><span className="silencio">%</span>
                <button className="suave" title="Quitar de la base" aria-label={`quitar base ${i + 1} ${fila.nombre}`} onClick={() => edRegla({ base: regla.base.filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ul>
          <button className="suave" onClick={() => edRegla({ base: [...regla.base, { concepto_id: propuesto, parte: 100 }] })} disabled={!propuesto}>+ concepto</button>
        </CampoFila>
        {ap && ap.regla && (
          <p className="silencio regla-cuenta" data-testid={`regla-${fila.id}`}>
            ({ap.lineas.map(l => (l.parte === 100 ? E2(l.mensual) : `${N(l.parte, 2)} % de ${E2(l.mensual)}`)).join(' + ') || '0'}) × {N(ap.porcentaje, 2)} % = <b>{E2(ap.aporta)}/mes</b>
            {ap.faltan.length > 0 && <span className="alerta"> · ⚠ un concepto de la base ya no existe: cuenta 0</span>}
          </p>
        )}
      </>}
    </>
  );
}

function Revisiones() {
  const s = useStore();
  const [nota, setNota] = useState('');
  return (
    <section aria-label="Revisiones">
      <h2>Revisiones</h2>
      {s.viendo ? <p className="silencio">Las revisiones se cierran sobre lo real, no sobre un escenario.</p> : (
        <p className="botones"><input className="campo" placeholder="nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} style={{ flex: 1 }} />
          <button className="primario" onClick={() => { s.cerrarRevision(nota || null); setNota(''); }}>Cerrar revisión {new Date().getFullYear()}</button></p>
      )}
      <ul className="acciones">{s.revisiones.map(r => <li key={r.id}>{r.fecha} {r.nota && <span className="silencio">· {r.nota}</span>}</li>)}</ul>
      {s.revisiones.length === 0 && <p className="silencio">Historial vacío. «Real contra plan» llega en la fase 2, con la revisión del año que viene.</p>}
    </section>
  );
}
