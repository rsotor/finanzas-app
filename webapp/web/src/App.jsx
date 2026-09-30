import React from 'react';
import { Proveedor, useStore } from './store.jsx';
import BarraViendo from './BarraViendo.jsx';
import VistaFinanzas from './VistaFinanzas.jsx';
import VistaPlan from './VistaPlan.jsx';

// C2(c): red de seguridad si una vista lanza una excepción al renderizar (un dato que rompe el motor ya
// se cubre con calc.error dentro de cada vista; esto es el último recurso). La barra queda FUERA del
// boundary a propósito: aunque la vista reviente, «Real»/escenarios y las pestañas siguen usables.
// Se remonta (key) al cambiar de vista. Al cambiar de escenario NO se remonta: solo se limpia el error si lo
// había (resetKey). Remontar borraba lo que se estuviera escribiendo y cerraba modales en cuanto la primera
// edición creaba el escenario automático (y hacía inestable el recorrido I4).
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) {
      return (
        <section>
          <p className="alerta">Algo falló al mostrar esta vista: {this.state.error.message}</p>
          <button className="primario" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>Volver a Real</button>
        </section>
      );
    }
    return this.props.children;
  }
}

function Cuerpo() {
  const s = useStore();
  if (s.cargando) return <main className="contenedor"><p className="silencio">Cargando…</p></main>;
  if (!s.datos || !s.datos.supuestos) return <main className="contenedor"><p className="alerta">No hay datos todavía: importa el Excel (README del servidor).</p></main>;
  return (
    <>
      <BarraViendo />
      {s.aviso && <div className="toast" role="status">{s.aviso}</div>}
      <main className="contenedor" aria-busy={s.creando || undefined} style={s.creando ? { pointerEvents: 'none' } : undefined}>
        <ErrorBoundary key={s.vista} resetKey={s.viendo || 'real'} onReset={() => { s.setViendo(null); s.recargar(); }}>
          {s.vista === 'finanzas' ? <VistaFinanzas /> : <VistaPlan />}
        </ErrorBoundary>
      </main>
    </>
  );
}

export default function App() { return <Proveedor><Cuerpo /></Proveedor>; }
