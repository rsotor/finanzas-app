// Vista Plan (ronda 2, "B2"): veredicto, carteras en filas con slider y detalle desplegable, objetivos,
// gráfico, reparto y acciones a la derecha; supuestos y detalle año a año plegados abajo.
import React, { useState } from 'react';
import { useStore } from './store.jsx';
import { Texto, Numero, Selector, Casilla, Rango, Area } from './Campo.jsx';
import Grafico from './Grafico.jsx';
import QueCambia from './QueCambia.jsx';
import { E, E2, P, N } from './formato.js';

// m5: url_taskapp solo se enlaza si de verdad parece una URL — un texto suelto no debe verse como link.
const esUrl = v => typeof v === 'string' && /^https?:\/\//.test(v);
const TIPOS_OBJ = [[null, '—'], ['unico', 'único'], ['renta', 'renta'], ['jubilacion', 'jubilación']];
const FUENTES = [['forward_neta', 'forward neta'], ['historica', 'histórica'], ['forzada', '⚠ forzada']];
// Titulares posibles: «conjunto» y las personas del hogar (PERSONAS en el servidor, vía /api/config).
const titulares = personas => [['conjunto', 'conjunto'], ...(personas || []).map(p => [p.id, p.nombre])];

export default function VistaPlan() {
  const s = useStore();
  const calc = s.calcVista, cmp = s.viendo ? s.calcComparar : null;
  // C2(b): igual que en Finanzas — el aviso no oculta «Qué cambia» ni «Supuestos», que es donde se corrige.
  if (calc.error || !calc.resumen) return (
    <>
      <section><p className="alerta">El motor no puede calcular: {calc.error}</p></section>
      {s.viendo && <QueCambia />}
      <Supuestos />
    </>
  );
  const v = calc.panel.proyeccion.veredicto, vc = cmp && cmp.panel && cmp.panel.proyeccion.veredicto;
  const r = calc.resumen.reparto, sm = calc.panel.proyeccion.sinModelar;
  return (
    <>
      <section aria-label="Veredicto">
        <div className="veredicto-fila">
          <div className={'veredicto ' + (v.ok ? 'ok' : 'no')} data-testid="veredicto" style={{ flex: 1 }}>{v.texto}{vc && <div className="comparado">comparado: {vc.texto}</div>}</div>
          <div className="lado">ahorro {E(r.ahorro)}/mes · {r.hayBuffer ? <>al buffer <b>{E(r.buffer)}</b></> : <b className="alerta">⚠ sin dueño {E(r.sinDueno)}</b>}{sm.length > 0 && <><br /><span className="alerta">⚠ {sm.length} objetivo(s) sin modelar</span></>}</div>
        </div>
        {sm.length > 0 && <p className="alerta silencio">Sin modelar: {sm.map(o => `${o.nombre} (${o.anio}${o.importe != null ? ', ' + E(o.importe) : ''}) — ${o.motivo}`).join(' · ')}</p>}
        {/* m12: la fecha de los datos también aquí — en Finanzas ya sale junto al colchón, pero Plan no la tenía */}
        <p className="silencio">Fecha de los datos: {calc.datos.fecha}.</p>
      </section>
      {/* Un escenario activo va a lo ancho y justo bajo el veredicto: es el contexto de todo lo demás. */}
      {s.viendo && <QueCambia />}
      <Carteras calc={calc} cmp={cmp} />
      {/* Objetivos y gráfico a lo ancho: la tabla tiene ocho columnas y en media página se estrujaba
          (nombres y notas cortados). El Reparto del ahorro vive en Finanzas, junto al ahorro (09-14). */}
      <Objetivos />
      <section aria-label="Gráfico"><h2>Proyección</h2><Grafico calc={calc} calcComparar={cmp} /></section>
      <Acciones />
      <Supuestos />
      <Detalle calc={calc} />
    </>
  );
}

function Carteras({ calc, cmp }) {
  const s = useStore();
  const [abierta, setAbierta] = useState(null);
  const datos = calc.datos;
  const otras = id => [[null, '—'], ...datos.carteras.filter(c => c.id !== id).map(c => [c.id, c.nombre])];
  return (
    <section aria-label="Carteras">
      <div className="fila-h">
        <h2>Carteras · cuánto aportas a cada una</h2>
        <button className="suave" onClick={() => s.crear('carteras', { nombre: 'Nueva cartera', tipo: 'normal', titular: 'conjunto', rentabilidad_fuente: 'forward_neta', aportacion_origen: 'tecleada', aportacion_mensual: 0, aportacion_inicial: 0 })}>+ añadir cartera</button>
      </div>
      {/* Seis columnas, no ocho: el punto va pegado al nombre y el slider comparte celda con su importe
          (son el mismo dato). Por debajo de 900px cada cartera se apila y sigue leyéndose entera. */}
      <div className="carteras-grid cab"><span /><span>Cartera</span><span>Rentabilidad</span><span>Aportas €/mes</span><span>Necesita</span><span className="estado">Estado</span></div>
      {datos.carteras.map((c, k) => {
        const pc = calc.panel.carteras[k], cc = cmp && cmp.panel && cmp.panel.carteras.find(x => x.id === c.id);
        // Con techo, aportar más puede cubrir peor (la cartera cruza el techo antes y su aportación se desvía): el motor
        // puede decir «no cubre» con una aportación MAYOR que la mínima que sí cubre. Decirlo, no imprimir «faltan 0,00».
        const noCubrePeroSobra = pc.estado === 'faltan' && pc.faltan < 0.005 && pc.necesita != null && Number.isFinite(pc.necesita);
        const estado = noCubrePeroSobra ? `⚠ no cubre con ${E2(pc.aportas)}${c.techo != null ? ' (techo)' : ''}: con ${E2(pc.necesita)}/mes sí`
          : pc.estado === 'faltan' ? `⚠ faltan ${E2(pc.faltan)}/mes` : pc.estado === 'cubierta' ? '✓ cubierta' : pc.estado === 'sin_objetivos' ? '— sin objetivos' : pc.estado === 'sin_dato' ? '⚠ sin dato' : pc.estado;
        const clase = pc.estado === 'faltan' ? 'rojo' : pc.estado === 'cubierta' ? 'verde' : 'ambar';
        // I11(b): una cartera enlazada saca su aportación de un concepto (p. ej. plan de pensiones de empleo) —
        // decir de cuál, no solo el importe, para no tener que ir a Finanzas a averiguarlo.
        const conceptoEnlazado = !pc.editable && c.concepto_id ? datos.conceptos.find(x => x.id === c.concepto_id) : null;
        return (
          <React.Fragment key={c.id}>
            <div className="carteras-grid" data-id={c.id}>
              <button className="suave abrir" aria-label={`detalle ${c.nombre}`} aria-expanded={abierta === c.id} onClick={() => setAbierta(abierta === c.id ? null : c.id)}>{abierta === c.id ? '▾' : '▸'}</button>
              <span className="cartera-nombre"><span className={'punto ' + clase} aria-hidden="true">●</span><b>{c.nombre}</b></span>
              <span className={'silencio' + (pc.faltaInfo ? ' alerta' : '')} title={pc.fuente ? pc.fuente.detalle : ''}>{pc.fuente && pc.fuente.rentabilidad != null ? P(pc.fuente.rentabilidad) : '—'} {c.rentabilidad_fuente === 'forzada' ? '⚠ forzada' : c.rentabilidad_fuente === 'historica' ? 'histórica' : 'forward'}{pc.faltaInfo && ' ⚠ falta info'}</span>
              <span className="aporta">
                {pc.editable ? (
                  <Rango valor={c.aportacion_mensual || 0} min="0" max="2000" step="10" aria-label={`aportación ${c.nombre}`} onCambio={n => s.editarDiferido('carteras', c.id, { aportacion_mensual: n })} />
                ) : <span className="silencio">enlazada</span>}
                {pc.editable ? <Numero moneda valor={c.aportacion_mensual} onCambio={v => s.editar('carteras', c.id, { aportacion_mensual: v ?? 0 })} aria-label={`aportación mensual ${c.nombre}`} /> : <span className="importe-enlazado"><b>{E2(pc.aportas)}</b>{conceptoEnlazado && <small className="silencio"> (enlazada a «{conceptoEnlazado.nombre}»)</small>}</span>}
              </span>
              <span className="silencio necesita">necesita <b>{pc.necesita === Infinity ? '∞' : pc.necesita == null ? '—' : E2(pc.necesita)}</b>{cc && <span className="comparado">vs {E2(cc.necesita)}</span>}</span>
              <span className={'estado ' + clase} data-testid={`estado-${c.id}`} title={noCubrePeroSobra ? 'Con techo, aportar más no siempre cubre más: la cartera cruza el techo antes y su aportación se desvía a la cartera destino.' : undefined}>{estado}</span>
            </div>
            {/* Cada etiqueta va pegada a su campo dentro de un `.par`: antes eran hermanos sueltos en un
                flex y al envolver quedaban etiquetas huérfanas al final de una línea. */}
            {abierta === c.id && (
              <div className="detalle-cartera">
                <span className="par"><span className="silencio">preset</span><Selector valor={c.preset_id} opciones={[[null, '— sin preset'], ...s.presets.lista.map(p => [p.id, p.label])]} onCambio={v => s.editar('carteras', c.id, { preset_id: v })} /></span>
                <span className="par"><span className="silencio">titular</span><Selector valor={c.titular} opciones={titulares(s.personas)} onCambio={v => s.editar('carteras', c.id, { titular: v })} /></span>
                <span className="par"><span className="silencio">rentabilidad</span><Selector valor={c.rentabilidad_fuente} opciones={FUENTES} onCambio={v => s.editar('carteras', c.id, { rentabilidad_fuente: v })} aria-label={`rentabilidad fuente ${c.nombre}`} />
                  {c.rentabilidad_fuente === 'forzada' && <><Numero valor={c.rentabilidad_forzada} onCambio={v => s.editar('carteras', c.id, { rentabilidad_forzada: v })} ancho="5em" /><span>%</span></>}</span>
                <span className="par"><span className="silencio">al empezar</span><Numero moneda valor={c.aportacion_inicial} onCambio={v => s.editar('carteras', c.id, { aportacion_inicial: v })} ancho="7.5em" /></span>
                <span className="par"><span className="silencio">techo</span><Numero moneda valor={c.techo} onCambio={v => s.editar('carteras', c.id, { techo: v })} ancho="7.5em" />
                  {c.techo != null && <><span className="silencio">→</span><Selector valor={c.cartera_destino} opciones={otras(c.id)} onCambio={v => s.editar('carteras', c.id, { cartera_destino: v })} /></>}</span>
                <span className="par"><span className="silencio">nombre</span><Texto valor={c.nombre} onCambio={v => s.editar('carteras', c.id, { nombre: v || c.nombre })} ancho="12em" /></span>
                <Area valor={c.nota_origen} onCambio={v => s.editar('carteras', c.id, { nota_origen: v })} rows={2} placeholder={c.rentabilidad_fuente === 'forzada' ? 'nota de origen (obligatoria)' : 'nota de origen'} ancho="100%" />
                <div className={'silencio' + (pc.faltaInfo ? ' alerta' : '')} style={{ flexBasis: '100%' }}>{pc.fuente ? pc.fuente.detalle : ''}{pc.faltaInfo && pc.fuente && pc.fuente.motivos.length ? ' ⚠ ' + pc.fuente.motivos.join('; ') : ''}</div>
                <button className="peligro" onClick={() => window.confirm(`¿Borrar «${c.nombre}»?`) && s.borrar('carteras', c.id)}>Borrar cartera</button>
              </div>
            )}
          </React.Fragment>
        );
      })}
      <TotalCarteras calc={calc} />
    </section>
  );
}

// La cuenta que cuadra con Finanzas: lo tecleado a carteras sale del ahorro; lo enlazado (plan de pensiones) ya está
// dentro de los gastos y no se resta otra vez. Lo que queda es el buffer (o «sin dueño» si no hay cuenta buffer).
function TotalCarteras({ calc }) {
  const r = calc.resumen.reparto;
  const enlazadas = calc.panel.carteras.filter(pc => !pc.editable).reduce((t, pc) => t + (pc.aportas || 0), 0);
  return (
    <div className="carteras-total" data-testid="total-carteras">
      <span>Total a carteras <b>{E2(r.carterasTecleadas)}/mes</b></span>
      {enlazadas > 0 && <span className="silencio">+ {E2(enlazadas)}/mes enlazadas (plan de pensiones: ya dentro de los gastos de Finanzas)</span>}
      <span className="silencio">De un ahorro de {E(r.ahorro)}/mes: {E(r.carterasTecleadas)} a carteras · {E(r.personales)} a cuentas personales · {r.hayBuffer ? `${E(r.buffer)} se quedan en el buffer` : `${E(r.sinDueno)} sin dueño`}</span>
    </div>
  );
}

function Objetivos() {
  const s = useStore();
  const datos = s.calcVista.datos;
  const carteras = [[null, '— sin cartera'], ...datos.carteras.map(c => [c.id, c.nombre])];
  return (
    <section aria-label="Objetivos">
      <h2>Objetivos · qué quieres pagar y cuándo</h2>
      <table className="filas tabla-obj">
        <thead><tr><th>Objetivo</th><th>Cartera</th><th>Tipo</th><th>Año</th><th>Importe hoy</th><th>Notas</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {datos.objetivos.map(o => (
            <tr key={o.id} data-id={o.id}>
              <td><Texto valor={o.nombre} onCambio={v => s.editar('objetivos', o.id, { nombre: v || o.nombre })} /></td>
              <td><Selector valor={o.cartera_id} opciones={carteras} onCambio={v => s.editar('objetivos', o.id, { cartera_id: v })} /></td>
              <td><Selector valor={o.tipo} opciones={TIPOS_OBJ} onCambio={v => s.editar('objetivos', o.id, { tipo: v })} /></td>
              <td><Numero valor={o.anio} onCambio={v => s.editar('objetivos', o.id, { anio: v })} decimales={0} aria-label={`año ${o.nombre}`} /></td>
              <td className="importe"><Numero moneda valor={o.importe} onCambio={v => s.editar('objetivos', o.id, { importe: v })} aria-label={`importe ${o.nombre}`} />
                {(o.tipo === 'renta' || o.tipo === 'jubilacion') && <> <span className="silencio">/mes durante</span> <Numero valor={o.duracion_anios} onCambio={v => s.editar('objetivos', o.id, { duracion_anios: v })} decimales={0} aria-label={`años ${o.nombre}`} /> <span className="silencio">años</span></>}
              </td>
              <td><Area valor={o.notas} onCambio={v => s.editar('objetivos', o.id, { notas: v })} rows={1} placeholder="de dónde sale" aria-label={`notas ${o.nombre}`} /></td>
              <td><Selector valor={o.estado} opciones={[['activo', 'activo'], ['falta_info', '⚠ falta info']]} onCambio={v => s.editar('objetivos', o.id, { estado: v })} /></td>
              <td><button className="suave" title="borrar" onClick={() => window.confirm(`¿Borrar «${o.nombre}»?`) && s.borrar('objetivos', o.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><button className="suave" onClick={() => s.crear('objetivos', { nombre: 'Nuevo objetivo', cartera_id: datos.carteras[0] ? datos.carteras[0].id : null, tipo: 'unico', anio: new Date().getFullYear() + 5, importe: 0, estado: 'activo' })}>+ objetivo</button></p>
    </section>
  );
}

function Supuestos() {
  const s = useStore();
  const sp = s.calcVista.datos.supuestos;
  const ed = campos => s.editar('supuestos', null, campos);
  const paro = (quien, campo, v) => ed({ paro: { ...(sp.paro || {}), [quien]: { ...((sp.paro || {})[quien] || {}), [campo]: v } } });
  return (
    <section aria-label="Supuestos">
      <details>
        {/* I11(d): el ⚠ es «sin nota de origen», no un aviso genérico — desaparece en cuanto sp.notas tiene algo */}
        <summary>Supuestos {!sp.notas && <span title="sin nota de origen">⚠</span>} · inflación {P(sp.inflacion)} · impuestos {sp.impuestos === 'plano' ? `${P(sp.tipo_plano)} plano` : 'tramos reales'} · paro {(s.personas[0] && sp.paro?.[s.personas[0].id]?.meses) ?? '—'} m</summary>
        <div className="rejilla-supuestos">
          <div className="dato"><small>Inflación % anual</small><Numero valor={sp.inflacion} onCambio={v => ed({ inflacion: v })} ancho="5em" aria-label="inflación" /></div>
          <div className="dato"><small>Sube la aportación % / año</small><Numero valor={sp.incremento_aportacion} onCambio={v => ed({ incremento_aportacion: v })} ancho="5em" /></div>
          <div className="dato"><small>Impuestos</small><Selector valor={sp.impuestos} opciones={[['tramos_reales', 'tramos reales IRPF'], ['plano', 'tipo plano']]} onCambio={v => ed({ impuestos: v })} />
            {sp.impuestos === 'plano' && <span> <Numero valor={sp.tipo_plano} onCambio={v => ed({ tipo_plano: v })} ancho="4em" /> %</span>}</div>
          <div className="dato"><small>Base fiscal inicial</small><Selector valor={sp.base_fiscal_inicial} opciones={[['aportado', 'aportado real'], ['valor', 'valor (Excel)']]} onCambio={v => ed({ base_fiscal_inicial: v })} /></div>
          <div className="dato"><small>Colchón: meses objetivo</small><Numero valor={sp.meses_colchon} onCambio={v => ed({ meses_colchon: v })} ancho="4em" /></div>
          {s.personas.map(p => (
            <div className="dato" key={p.id}><small>Paro {p.nombre} €/mes · meses</small><Numero moneda valor={sp.paro?.[p.id]?.importe} onCambio={v => paro(p.id, 'importe', v)} ancho="7.5em" /> <Numero valor={sp.paro?.[p.id]?.meses} onCambio={v => paro(p.id, 'meses', v)} ancho="3.5em" /></div>
          ))}
        </div>
        {/* I11(d): con impuestos a tipo plano, el % es un supuesto del Excel — la nota pasa a ser obligatoria */}
        <p><Area valor={sp.notas} onCambio={v => ed({ notas: v })} rows={2} required={sp.impuestos === 'plano'}
          placeholder={sp.impuestos === 'plano' ? `obligatorio: el ${P(sp.tipo_plano)} es un supuesto del Excel: anota de dónde sale` : 'notas de origen de los supuestos'}
          ancho="100%" aria-label="notas de los supuestos" /></p>
      </details>
    </section>
  );
}

function Acciones() {
  const s = useStore();
  const [texto, setTexto] = useState('');
  const datos = s.calcVista.datos;
  const abiertas = datos.acciones.filter(a => a.estado !== 'hecha').length;
  const nombre = l => { if (!l) return ''; const f = (datos[l.entidad] || []).find(x => x.id === l.id); return f ? ` · ${f.nombre || f.texto}` : ''; };
  return (
    <section aria-label="Acciones pendientes">
      <h2>Acciones pendientes ({abiertas})</h2>
      <ul className="acciones">
        {datos.acciones.map(a => (
          <li key={a.id} className={a.estado === 'hecha' ? 'hecha' : ''}>
            <Casilla valor={a.estado === 'hecha'} onCambio={v => s.editar('acciones', a.id, { estado: v ? 'hecha' : 'abierta' })} aria-label={a.texto} />
            <span>{a.texto}<small className="silencio">{nombre(a.ligada_a)}</small>{/* m5: un texto suelto en url_taskapp (no una URL) no debe ser un link roto */}{esUrl(a.url_taskapp) && <> · <a href={a.url_taskapp} target="_blank" rel="noreferrer">TaskApp</a></>}</span>
          </li>
        ))}
      </ul>
      <p><input className="campo" placeholder="nueva acción (Enter)" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && texto.trim()) { s.crear('acciones', { texto: texto.trim(), estado: 'abierta' }); setTexto(''); } }} style={{ width: '100%' }} /></p>
    </section>
  );
}

function Detalle({ calc }) {
  const p = calc.panel.proyeccion;
  return (
    <section aria-label="Detalle año a año">
      <details>
        <summary>Detalle año a año ({p.filas.length} años; aquí vive la tabla del Excel)</summary>
        <table className="filas">
          <thead><tr><th>Año</th><th className="num">Aportas</th><th className="num">Retiras</th><th className="num">Total</th><th className="num">Neto</th><th className="num">Sin cubrir</th></tr></thead>
          <tbody>{p.filas.map(f => <tr key={f.anio} className={f.sinCubrir > 0.01 ? 'rojo' : ''}><td>{f.anio}</td><td className="num">{E(f.aportas)}</td><td className="num">{E(f.retiras)}</td><td className="num">{E(f.total)}</td><td className="num">{E(f.totalNeto)}</td><td className="num">{f.sinCubrir > 0.01 ? E(f.sinCubrir) : ''}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
