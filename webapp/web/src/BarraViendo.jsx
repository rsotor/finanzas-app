// Las dos pestañas y los escenarios como pestañas siempre visibles (ronda 2): Real | escenario… | + nuevo.
import React, { useEffect, useRef } from 'react';
import { useStore } from './store.jsx';

export default function BarraViendo() {
  const s = useStore();
  const e = s.escenarioActivo;
  // La barra cambia de alto (envuelve en móvil, crece con el selector de comparar): lo publica en --barra-alto para
  // que las cabeceras de grupo y el panel de edición se peguen justo debajo, no a una cifra fija.
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const publicar = () => document.documentElement.style.setProperty('--barra-alto', `${el.offsetHeight}px`);
    publicar();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publicar) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, []);
  return (
    <header ref={ref} className={'barra' + (e ? ' barra-escenario' : '')}>
      <nav className="pestanas" aria-label="Vistas">
        <button className={s.vista === 'finanzas' ? 'activa' : ''} onClick={() => s.setVista('finanzas')}>Finanzas</button>
        <button className={s.vista === 'plan' ? 'activa' : ''} onClick={() => s.setVista('plan')}>Plan</button>
      </nav>
      <nav className="escenarios" aria-label="Escenarios">
        <span className="silencio">Escenarios:</span>
        <button className={'pildora' + (!s.viendo ? ' activa' : '')} onClick={() => s.setViendo(null)}>● Real</button>
        {s.escenarios.map(x => (
          <button key={x.id} className={'pildora' + (s.viendo === x.id ? ' activa' : '')} onClick={() => s.setViendo(x.id)}>{x.nombre}{x.cambios.length ? ` (${x.cambios.length})` : ''}</button>
        ))}
        <button className="pildora" onClick={() => s.nuevoEscenario()}>+ nuevo</button>
        {e && <label className="silencio">comparar con
          <select aria-label="Comparar con" value={s.comparar || 'real'} onChange={ev => s.setComparar(ev.target.value)}>
            <option value="real">Real</option>
            {s.escenarios.filter(x => x.id !== e.id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select></label>}
      </nav>
    </header>
  );
}
