// Enchufe con el motor cargado por index.html (window.SimEngine): mismo código que usa el servidor.
const SE = () => window.SimEngine;

export async function cargarPresets() {
  const indice = await (await fetch('/motor/presets/index.json')).json();
  const porId = {};
  await Promise.all(indice.map(async e => {
    try { porId[e.file] = await (await fetch('/motor/presets/' + e.file)).json(); } catch { /* preset roto: no aparece */ }
  }));
  return { porId, lista: indice.map(e => ({ id: e.file, label: e.label, dataAsOf: porId[e.file] && porId[e.file].dataAsOf })) };
}

// Aplica los cambios de un escenario (si los hay) y calcula resumen + panel. Nunca lanza: devuelve {error}.
export function calcular(datos, presets, cambios) {
  const { plan, finanzas, escenario } = SE();
  let datosVista = datos, avisos = [];
  if (cambios && cambios.length) ({ datos: datosVista, avisos } = escenario.aplicar(datos, cambios));
  try {
    const entrada = plan.prepararEntrada(datosVista, presets.porId);
    return { datos: datosVista, resumen: finanzas.resumen(datosVista), panel: plan.panel(entrada), avisos, error: null };
  } catch (e) {
    return { datos: datosVista, resumen: null, panel: null, avisos, error: e.message };
  }
}

export const nuevoDelta = (...a) => SE().escenario.nuevoDelta(...a);
export const nuevoIdTemporal = cambios => SE().escenario.nuevoIdTemporal(cambios);
export const esTemporal = id => SE().escenario.esTemporal(id);
export const crearGrafico = opts => SE().chart.create(opts);
