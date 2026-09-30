// Proyección de carteras con banda, dibujada por engine-chart.js (canvas, hover y tooltip del motor).
import React, { useEffect, useRef } from 'react';
import { crearGrafico } from './motor.js';
import { E } from './formato.js';

// Orden FIJO de colores por cartera, no cíclico mientras quepan: es una paleta categórica validada
// (separación bajo daltonismo, banda de luminosidad y contraste contra el fondo oscuro de la app).
// Deliberadamente distinta de los colores del semáforo: una serie nunca debe parecer un estado.
// A partir de la novena cartera se repite el ciclo — con tantas series el gráfico ya no se lee y
// tocaría agrupar, pero eso cambiaría qué información se muestra y no es cosa del diseño.
const COLORES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
// Base, banda y comparación no son carteras: van en tinta neutra (y en violeta lo que no es real).
// Pesimista y optimista con dos tintas distintas (antes iban iguales y no se distinguían en el gráfico).
const TOTAL = '#f0e7da', PESIMISTA = '#8a7460', OPTIMISTA = '#d8c7a8', APORTADO = '#b0a08c', COMPARADO = '#b9a0f0';
const ANIOS_VISIBLES = 40;

export default function Grafico({ calc, calcComparar }) {
  const canvas = useRef(null), tooltip = useRef(null), leyenda = useRef(null), chart = useRef(null);
  useEffect(() => {
    if (!canvas.current || !calc || !calc.panel) return;
    const { proyeccion, banda } = calc.panel;
    if (!chart.current) chart.current = crearGrafico({ canvas: canvas.current, tooltip: tooltip.current, legend: leyenda.current, fmt: E, height: 320, anio0: proyeccion.anio0 });
    const punto = (f, v) => ({ year: f.a, value: v });
    const filas = proyeccion.filas.slice(0, ANIOS_VISIBLES);
    // Lo que has puesto: aportaciones acumuladas (el primer año ya incluye lo que había al empezar). La distancia
    // entre esta línea y el total es la rentabilidad.
    let acumulado = 0;
    const aportado = filas.map(f => { acumulado += f.aportas; return punto(f, acumulado); });
    const series = [
      { label: 'Total (base)', color: TOTAL, points: filas.map(f => punto(f, f.total)) },
      { label: 'Aportado (lo que has puesto)', color: APORTADO, dashed: true, points: aportado },
      { label: 'Pesimista', color: PESIMISTA, dashed: true, points: banda.pesimista.filas.slice(0, ANIOS_VISIBLES).map(f => punto(f, f.total)) },
      { label: 'Optimista', color: OPTIMISTA, dashed: true, points: banda.optimista.filas.slice(0, ANIOS_VISIBLES).map(f => punto(f, f.total)) },
      ...calc.panel.carteras.map((c, k) => ({ label: c.nombre, color: COLORES[k % COLORES.length], points: filas.map(f => punto(f, f.bolsas[k].val)) })),
    ];
    if (calcComparar && calcComparar.panel) {
      series.push({ label: 'Total (comparado)', color: COMPARADO, dashed: true, points: calcComparar.panel.proyeccion.filas.slice(0, ANIOS_VISIBLES).map(f => punto(f, f.total)) });
    }
    chart.current.render(series, ANIOS_VISIBLES);
  }, [calc, calcComparar]);
  // m11: al desmontar (cambio de vista) hay que quitar el listener de resize del motor — si no, se
  // acumulan uno por cada vez que se vuelve a la vista Plan.
  useEffect(() => () => { if (chart.current) chart.current.destroy(); }, []);
  return (
    <div className="grafico">
      <div className="grafico-lienzo"><canvas ref={canvas} aria-label="Proyección de carteras" /></div>
      <div ref={tooltip} className="grafico-tooltip" />
      <div ref={leyenda} className="grafico-leyenda" />
      <p className="silencio">Solo carteras, no patrimonio total. Banda = rentabilidad base ∓ volatilidad/√años hasta el primer objetivo (no es Monte Carlo). Pulsa una entrada de la leyenda para ocultar o mostrar su línea.</p>
    </div>
  );
}
