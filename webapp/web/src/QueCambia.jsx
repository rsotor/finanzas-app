// Panel «Qué cambia» del escenario activo (ronda 2): cada cambio con su casilla; aplicar los marcados; descartar.
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store.jsx';
import { Texto } from './Campo.jsx';
import { E, E2, P, N } from './formato.js';

// I4: etiqueta de cada campo — la lista completa, no solo los que ya salían en la práctica.
const NOMBRE_CAMPO = {
  aportacion_mensual: 'aportas', aportacion_inicial: 'al empezar', rentabilidad_forzada: 'rentabilidad',
  importe: 'importe', anio: 'año', saldo: 'saldo', inflacion: 'inflación', incremento_aportacion: 'sube aportación',
  tipo_plano: 'tipo plano', meses_colchon: 'colchón objetivo', techo: 'techo', esencial_en_paro: 'colchón',
  periodicidad: 'periodicidad', nombre: 'nombre', estado: 'estado', cartera_id: 'cartera',
  impuestos: 'impuestos', base_fiscal_inicial: 'base fiscal', grupo: 'grupo', categoria: 'prioridad',
  titular: 'titular', rol: 'rol', duracion_anios: 'duración (años)', preset_id: 'preset',
  rentabilidad_fuente: 'rentabilidad', cartera_destino: 'destino del techo', concepto_id: 'concepto enlazado',
  nota_origen: 'origen', notas: 'notas', texto: 'texto', tipo: 'tipo', tipo_interes: 'TAE',
  vinculado_a: 'vinculado a', aportacion_regla: 'aporta',
};
// «Nuevo»/«Nueva» + el nombre en singular, por columna — evitar el "accione" de un simple replace(/s$/, '').
const GENERO = { conceptos: ['Nuevo', 'concepto'], cuentas: ['Nueva', 'cuenta'], carteras: ['Nueva', 'cartera'], objetivos: ['Nuevo', 'objetivo'], acciones: ['Nueva', 'acción'] };
const singular = col => (GENERO[col] || [null, col])[1];
const nuevo = col => { const [articulo, nombre] = GENERO[col] || ['Nuevo', col]; return `${articulo} ${nombre}`; };

const ES_PORCENTAJE = k => /^(inflacion|incremento_aportacion|rentabilidad_forzada|tipo_plano|tipo_interes)$/.test(k);
const ES_EURO = k => /^(importe|saldo|aportacion_mensual|aportacion_inicial|techo|aportado)$/.test(k);
const ES_ENTERO = k => /^(anio|duracion_anios|meses_colchon|orden)$/.test(k);

// I4: 'paro' llega siempre completo ({<persona>:{importe,meses}, …}) — se describen todas.
function describirParo(v) {
  if (!v || typeof v !== 'object') return '—';
  return Object.entries(v).map(([quien, d]) => `${quien[0].toUpperCase()}${quien.slice(1)} ${E(d && d.importe)}/mes · ${d && d.meses != null ? d.meses : '—'} m`).join(' · ');
}
function describirLigadaA(v) { return v ? `${v.entidad} #${v.id}` : '—'; }
// «10 % de Nómina + Seguro de salud + Plan al 50 %»: con los nombres, para que un cambio de parte se vea en el antes → después.
function describirRegla(v, datos) {
  const nombre = id => { const c = ((datos && datos.conceptos) || []).find(x => x.id === id); return c ? c.nombre : '⚠ concepto borrado'; };
  const base = (v.base || []).map(b => nombre(b.concepto_id) + (b.parte != null && b.parte !== 100 ? ` al ${N(b.parte, 2)} %` : '')).join(' + ');
  return `${N(v.porcentaje, 2)} % de ${base || 'una base vacía'}`;
}

function fmt(k, v, datos) {
  if (v == null) return k === 'aportacion_regla' ? 'fija' : '—';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v === 'object') return k === 'paro' ? describirParo(v) : k === 'ligada_a' ? describirLigadaA(v) : k === 'aportacion_regla' ? describirRegla(v, datos) : String(v);
  if (typeof v === 'number' && ES_PORCENTAJE(k)) return P(v);
  if (typeof v === 'number' && ES_EURO(k)) return E2(v);
  if (ES_ENTERO(k)) return String(Math.trunc(v));
  return String(v);
}

// Describe un delta en palabras, con lo real al lado para los «modificar».
export function describirDelta(d, datosReales) {
  const col = d.entidad;
  const fila = col === 'supuestos' ? datosReales.supuestos : (datosReales[col] || []).find(x => x.id === d.id);
  const quien = col === 'supuestos' ? 'Supuestos' : (fila ? (fila.nombre || fila.texto) : (d.campos && d.campos.nombre) || d.id);
  if (d.operacion === 'crear') return `${nuevo(col)}: ${d.campos.nombre || d.campos.texto || ''}${d.campos.anio ? ', ' + d.campos.anio : ''}${d.campos.importe != null ? ', ' + E2(d.campos.importe) : ''}`;
  if (d.operacion === 'borrar') return `Borrar ${singular(col)}: ${quien}`;
  const partes = Object.entries(d.campos || {}).map(([k, v]) => `${NOMBRE_CAMPO[k] || k} ${fmt(k, d.valor_anterior && k in d.valor_anterior ? d.valor_anterior[k] : (fila ? fila[k] : null), datosReales)} → ${fmt(k, v, datosReales)}`);
  return `${quien}: ${partes.join(' · ')}`;
}

export default function QueCambia() {
  const s = useStore();
  const e = s.escenarioActivo;
  const [marcados, setMarcados] = useState(null);      // null = todos
  // W2a: la selección local es de ESTA lista de cambios. Si se cambia de escenario (otro e.id) o si el
  // número de cambios varía (se aplicó alguno y el escenario quedó con menos), la marca anterior ya no
  // significa nada — se reinicia a "todos marcados" en vez de arrastrar índices de otra lista.
  useEffect(() => { setMarcados(null); }, [e && e.id, e && e.cambios.length]);
  if (s.creando) return <section aria-label="Qué cambia" className="que-cambia"><p className="silencio">Creando el escenario…</p></section>;
  if (!e) return null;
  const set = marcados || new Set(e.cambios.map((_, i) => i));
  const toggle = i => { const n = new Set(set); n.has(i) ? n.delete(i) : n.add(i); setMarcados(n); };
  const indices = [...set].sort((a, b) => a - b);
  // Dos personas en la app: si el escenario abierto lo creó la otra, se dice antes de que nadie lo aplique o lo descarte.
  const deOtro = e.creado_por && s.yo && s.yo.nombre && e.creado_por !== s.yo.nombre;
  return (
    <section aria-label="Qué cambia" className="que-cambia">
      {deOtro && <p className="alerta" data-testid="escenario-de-otro">⚠ Este escenario lo creó <b>{e.creado_por}</b>. Aplicarlo o descartarlo afecta a sus cambios, no a los tuyos.</p>}
      <div className="fila-h"><h2>Qué cambia en «{e.nombre}»{e.creado_por && <span className="silencio"> · de {e.creado_por}</span>}</h2>
        <Texto key={e.id} valor={e.nombre} onCambio={v => v && s.renombrarEscenario(e.id, v)} ancho="10em" aria-label="Nombre del escenario" /></div>
      {e.cambios.length === 0 && <p className="silencio">Todavía nada: lo que toques en Finanzas o en Plan se apunta aquí. Lo real no cambia hasta que apliques.</p>}
      <ul className="cambios">
        {e.cambios.map((d, i) => (
          <li key={i}><label><input type="checkbox" checked={set.has(i)} onChange={() => toggle(i)} aria-label={`cambio ${i + 1}`} /> {describirDelta(d, s.datos)}</label></li>
        ))}
      </ul>
      <div className="botones">
        <button className="primario" disabled={!indices.length} onClick={() => s.aplicarEscenario(e.id, { indices: indices.length === e.cambios.length ? undefined : indices })}>
          Aplicar los marcados ({indices.length})</button>
        <button className="peligro" onClick={() => { if (window.confirm(`¿Descartar «${e.nombre}»? Lo real no se toca.`)) s.descartarEscenario(e.id); }}>Descartar escenario</button>
      </div>
      <p className="silencio">Lo no marcado se queda en el escenario. Si lo real cambió desde que se creó, se confirma cambio a cambio.</p>
      {s.conflictos && <Conflictos />}
    </section>
  );
}

// Lo real cambió desde que se creó el escenario: se confirma delta a delta (spec §4.1-6).
function Conflictos() {
  const s = useStore();
  const { id, avisos, indices } = s.conflictos;
  const conflictos = avisos.filter(a => a.tipo === 'conflicto');
  const [marcados, setMarcados] = useState(new Set(conflictos.map(a => a.indice)));
  // m7: es un diálogo modal de verdad — foco al abrir y Escape lo cierra (sin eso, el teclado se queda
  // navegando por detrás y no hay forma de cancelar sin ratón).
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  return (
    <div className="dialogo" role="dialog" aria-modal="true" aria-label="Conflictos al aplicar" ref={ref} tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') s.cerrarConflictos(); }}>
      <h3>Lo real cambió desde que se creó el escenario</h3>
      <ul>
        {conflictos.map((a, i) => (
          <li key={i}><label><input type="checkbox" checked={marcados.has(a.indice)} onChange={ev => { const n = new Set(marcados); ev.target.checked ? n.add(a.indice) : n.delete(a.indice); setMarcados(n); }} />
            {a.entidad} · {a.id ?? 'supuestos'} · <b>{a.campo}</b>: el escenario esperaba <code>{String(a.esperado)}</code> y ahora es <code>{String(a.real)}</code></label></li>
        ))}
      </ul>
      <button className="primario" onClick={() => s.aplicarEscenario(id, { indices, confirmar: [...marcados] })}>Imponer los marcados y aplicar</button>
      <button onClick={s.cerrarConflictos}>Cancelar</button>
    </div>
  );
}
