const { test } = require('node:test');
const assert = require('node:assert');

// m11: create() cuelga un listener de 'resize' en window — sin destroy() se acumula uno por cada gráfico
// creado (React lo crea de nuevo cada vez que se vuelve a montar la vista). Se prueba con un `window` falso:
// el módulo solo necesita addEventListener/removeEventListener para esta parte (no llega a dibujar).
function conVentanaFalsa(fn) {
  const listeners = {};
  const fakeWindow = {
    addEventListener: (ev, h) => { (listeners[ev] = listeners[ev] || []).push(h); },
    removeEventListener: (ev, h) => { listeners[ev] = (listeners[ev] || []).filter(x => x !== h); },
  };
  const antes = global.window;
  global.window = fakeWindow;
  try { fn(listeners); } finally { global.window = antes; }
}

test('destroy() quita el listener de resize (el gráfico deja de existir de verdad al desmontar)', () => {
  conVentanaFalsa(listeners => {
    const chart = require('../engine-chart.js');
    const g = chart.create({ canvas: { onmousemove: null, onmouseleave: null } });
    assert.strictEqual((listeners.resize || []).length, 1);
    g.destroy();
    assert.strictEqual((listeners.resize || []).length, 0);
  });
});

test('destroy() se puede llamar sin dibujar antes y no revienta', () => {
  conVentanaFalsa(() => {
    const chart = require('../engine-chart.js');
    const g = chart.create({ canvas: {} });
    assert.doesNotThrow(() => g.destroy());
  });
});

// Leyenda interactiva y año absoluto: se prueba con un canvas y un document falsos (el contexto 2D es un Proxy
// que acepta cualquier llamada), suficiente para recorrer render() sin navegador.
function conDomFalso(fn) {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const canvas = { getContext: () => ctx, style: {}, parentElement: { getBoundingClientRect: () => ({ width: 600 }) } };
  const nuevoElemento = () => ({ attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; }, innerHTML: '' });
  const legend = { innerHTML: '', hijos: [], appendChild(el) { this.hijos.push(el); } };
  const tooltip = { classList: { add() {}, remove() {} }, style: {}, innerHTML: '', offsetWidth: 0, offsetHeight: 0 };
  const antes = { window: global.window, document: global.document };
  global.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  global.document = { createElement: nuevoElemento };
  // legend.innerHTML = '' vacía la lista de hijos, como en el DOM real
  Object.defineProperty(legend, 'innerHTML', { set() { this.hijos = []; }, get() { return ''; } });
  try { fn({ canvas, legend, tooltip }); } finally { global.window = antes.window; global.document = antes.document; }
}

test('la leyenda oculta y muestra series al pulsar; las ocultas salen del tooltip', () => {
  conDomFalso(({ canvas, legend, tooltip }) => {
    const chart = require('../engine-chart.js');
    const g = chart.create({ canvas, legend, tooltip, anio0: 2026 });
    g.render([
      { label: 'Total', color: '#fff', points: [{ year: 0, value: 10 }, { year: 5, value: 20 }] },
      { label: 'Banda', color: '#888', dashed: true, points: [{ year: 0, value: 10 }, { year: 5, value: 30 }] },
    ], 5);
    assert.strictEqual(legend.hijos.length, 2);
    assert.strictEqual(legend.hijos[1].attrs['aria-label'], 'ocultar Banda');
    legend.hijos[1].onclick();
    assert.deepStrictEqual(g.ocultas(), ['Banda']);
    assert.strictEqual(legend.hijos[1].attrs['aria-pressed'], 'true');
    assert.strictEqual(legend.hijos[1].attrs['aria-label'], 'mostrar Banda');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 360 });
    canvas.onmousemove({ clientX: 70 + 510, clientY: 100 });   // extremo derecho = año 5
    assert.ok(tooltip.innerHTML.includes('Año 2031'), 'el tooltip dice el año absoluto: ' + tooltip.innerHTML);
    assert.ok(tooltip.innerHTML.includes('Total') && !tooltip.innerHTML.includes('Banda'), 'la serie oculta no sale');
    legend.hijos[1].onkeydown({ key: 'Enter', preventDefault() {} });
    assert.deepStrictEqual(g.ocultas(), []);
    g.destroy();
  });
});
