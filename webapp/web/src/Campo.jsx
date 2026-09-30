// Controles de edición en la fila: confirman al perder el foco o con Enter; Escape deshace.
import React, { useEffect, useState } from 'react';
import { aNumero } from './formato.js';

// I1: onCambio (store.editar) puede devolver una promesa de éxito. Si resuelve `false` o rechaza, el
// campo revierte a `valor` — si no, quedaría en pantalla un cambio que el servidor no llegó a guardar.
function revertirSiFalla(resultado, revertir) {
  if (resultado && typeof resultado.then === 'function') resultado.then(ok => { if (ok === false) revertir(); }, revertir);
}

export function Texto({ valor, onCambio, placeholder, ancho, ...resto }) {
  const [v, setV] = useState(valor ?? '');
  useEffect(() => { setV(valor ?? ''); }, [valor]);
  const confirmar = () => { if ((v ?? '') !== (valor ?? '')) revertirSiFalla(onCambio(v === '' ? null : v), () => setV(valor ?? '')); };
  return <input className="campo" style={ancho ? { width: ancho } : undefined} value={v} placeholder={placeholder}
    onChange={e => setV(e.target.value)} onBlur={confirmar}
    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setV(valor ?? ''); e.target.blur(); } }} {...resto} />;
}

// m3: en España el decimal se escribe con coma; se redondea a `decimales` al mostrar (nunca al guardar,
// eso ya lo hace el motor) para no enseñar el ruido de coma flotante (300.0000000004 → "300").
function mostrarNumero(valor, decimales) {
  if (valor == null) return '';
  const factor = 10 ** decimales;
  return String(Math.round(Number(valor) * factor) / factor).replace('.', ',');
}

// Importe legible mientras no se edita: «1.234,56 €» (miles siempre, también con 4 cifras; sin «,00» si es entero).
// Se formatea el texto del campo, no `valor`: así, al soltar, se ve ya lo tecleado y no parpadea el valor viejo.
function mostrarMoneda(texto) {
  const n = aNumero(texto);
  if (n == null || Number.isNaN(n)) return texto;
  const [ent, dec] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec === '00' ? '' : ',' + dec) + ' €';
}

// No es type="number" a propósito: ese control no entiende la coma decimal en todos los navegadores y la rueda
// del ratón cambia el importe sin querer. `moneda` solo para euros (un año o un % no llevan miles ni «€»).
export function Numero({ valor, onCambio, ancho, decimales = 2, moneda = false, ...resto }) {
  const [v, setV] = useState(mostrarNumero(valor, decimales));
  const [editando, setEditando] = useState(false);
  useEffect(() => { setV(mostrarNumero(valor, decimales)); }, [valor, decimales]);
  const confirmar = () => {
    setEditando(false);
    const n = aNumero(v);
    if (Number.isNaN(n)) { setV(mostrarNumero(valor, decimales)); return; }
    if (n !== (valor ?? null)) revertirSiFalla(onCambio(n), () => setV(mostrarNumero(valor, decimales)));
  };
  return <input className="campo num" inputMode="decimal" style={ancho ? { width: ancho } : undefined} value={moneda && !editando ? mostrarMoneda(v) : v}
    onChange={e => setV(e.target.value)} onBlur={confirmar}
    // El cambio «1.234,56 €» → «1234,56» se escribe en el DOM ya, dentro del foco: si esperara al render, lo que se
    // teclea justo después se pegaría al final del texto viejo (300 € + 700 = 300700). Queda todo seleccionado:
    // escribir sustituye la cifra.
    onFocus={e => { if (moneda) { e.target.value = v; e.target.select(); } setEditando(true); }}
    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setV(mostrarNumero(valor, decimales)); e.target.blur(); } }} {...resto} />;
}

// Texto largo (detalles de una cuenta): confirma al perder el foco; Enter mete salto de línea, Escape deshace.
export function Area({ valor, onCambio, placeholder, ancho, ...resto }) {
  const [v, setV] = useState(valor ?? '');
  useEffect(() => { setV(valor ?? ''); }, [valor]);
  const confirmar = () => { if ((v ?? '') !== (valor ?? '')) revertirSiFalla(onCambio(v === '' ? null : v), () => setV(valor ?? '')); };
  return <textarea className="campo" style={ancho ? { width: ancho } : undefined} value={v} placeholder={placeholder}
    onChange={e => setV(e.target.value)} onBlur={confirmar}
    onKeyDown={e => { if (e.key === 'Escape') { setV(valor ?? ''); e.target.blur(); } }} {...resto} />;
}

export function Selector({ valor, opciones, onCambio, ...resto }) {
  return <select className="campo" value={valor ?? ''} onChange={e => onCambio(e.target.value === '' ? null : e.target.value)} {...resto}>
    {opciones.map(o => Array.isArray(o) ? <option key={o[0] ?? ''} value={o[0] ?? ''}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
  </select>;
}

export function Casilla({ valor, onCambio, ...resto }) {
  return <input type="checkbox" checked={!!valor} onChange={e => onCambio(e.target.checked)} {...resto} />;
}

// C3: slider con estado local (misma resincronización que Numero) para que el arrastre se vea fluido aunque
// la escritura vaya diferida; onCambio se llama en cada paso, no solo al soltar.
export function Rango({ valor, onCambio, ...resto }) {
  const [v, setV] = useState(valor ?? 0);
  useEffect(() => { setV(valor ?? 0); }, [valor]);
  return <input type="range" value={v} onChange={e => { const n = Number(e.target.value); setV(n); revertirSiFalla(onCambio(n), () => setV(valor ?? 0)); }} {...resto} />;
}
