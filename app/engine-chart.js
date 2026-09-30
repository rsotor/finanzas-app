(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SimEngine = window.SimEngine || {}; window.SimEngine.chart = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Gráfico de proyección (Canvas 2D), compartido por el comparador
  // y el simulador. La página construye el array de `series` y llama
  // a render(); el módulo se encarga de ejes, grid, banda opcional,
  // hover/tooltip y redibujado responsive.
  //
  //   series = [{
  //     label,            // texto de la leyenda / tooltip
  //     color,            // color de la línea (hex)
  //     dashed,           // true → línea punteada (p.ej. "aportado")
  //     width,            // grosor opcional (px); por defecto 2.5 (o 1.5 si dashed)
  //     points: [{year, value}],
  //   }]
  //
  // opts.anio0 (opcional): año del punto 0. Con él, el eje X y el tooltip dicen «2031» en vez de «5a» / «Año 5».
  // La leyenda es interactiva: pulsar una entrada oculta/muestra su serie (y el eje Y se reescala a lo visible).
  //
  // El abanico optimista/pesimista se modela como series independientes
  // (una línea por escenario), no como un área rellena.
  // ─────────────────────────────────────────────────────────────

  function hexToRgba(hex, a) {
    const h = (hex || '#888888').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  const DEFAULT_FMT = v => String(Math.round(v));
  const DEFAULT_ESC = s => String(s == null ? '' : s);

  function create(opts) {
    opts = opts || {};
    const canvas  = opts.canvas;
    const tooltip = opts.tooltip || null;
    const legend  = opts.legend  || null;
    const fmt     = opts.fmt     || DEFAULT_FMT;
    const escHtml = opts.escHtml || DEFAULT_ESC;
    const H       = opts.height  || 360;
    const anio0   = Number.isFinite(opts.anio0) ? opts.anio0 : null;

    if (!canvas) throw new Error('SimEngine.chart.create: falta opts.canvas');

    let chartData = [];
    let chartHorizon = 1;
    const ocultas = new Set();          // etiquetas de series ocultas desde la leyenda
    const visibles = () => chartData.filter(s => !ocultas.has(s.label));
    const etiquetaAnio = y => anio0 != null ? String(anio0 + y) : (y + 'a');

    function render(series, horizon) {
      chartData = series || [];
      chartHorizon = Math.max(1, horizon || 1);

      pintarLeyenda();
      draw();

      if (tooltip) {
        canvas.onmousemove = onMouseMove;
        canvas.onmouseleave = function () { tooltip.classList.remove('visible'); draw(); };
      }
    }

    function pintarLeyenda() {
      if (!legend) return;
      legend.innerHTML = '';
      chartData.forEach(s => {
        const item = document.createElement('div');
        const oculta = ocultas.has(s.label);
        item.className = 'legend-item' + (oculta ? ' oculta' : '');
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-pressed', oculta ? 'true' : 'false');
        item.setAttribute('aria-label', (oculta ? 'mostrar ' : 'ocultar ') + s.label);
        item.title = oculta ? 'Pulsa para mostrar esta línea' : 'Pulsa para ocultar esta línea';
        if (oculta) item.style.opacity = '0.45';
        if (s.dashed) {
          item.innerHTML = '<span class="legend-dashed" style="border-top-color:' + s.color + '"></span>' + escHtml(s.label);
        } else {
          item.innerHTML = '<span class="legend-line" style="background:' + s.color + '"></span>' + escHtml(s.label);
        }
        const alternar = () => { if (ocultas.has(s.label)) ocultas.delete(s.label); else ocultas.add(s.label); pintarLeyenda(); draw(); };
        item.onclick = alternar;
        item.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } };
        legend.appendChild(item);
      });
    }

    function draw(hoverYear) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      const W = rect.width;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const pad = { top: 20, right: 20, bottom: 40, left: 70 };
      const cw = W - pad.left - pad.right;
      const ch = H - pad.top - pad.bottom;

      // Rango de valores (solo de lo visible: ocultar la banda reescala el eje)
      const series = visibles();
      let maxVal = 0;
      series.forEach(s => {
        (s.points || []).forEach(p => { if (p.value > maxVal) maxVal = p.value; });
      });
      maxVal = maxVal * 1.08 || 1000;

      function xPos(year) { return pad.left + (year / chartHorizon) * cw; }
      function yPos(val)  { return pad.top + ch - (val / maxVal) * ch; }

      ctx.clearRect(0, 0, W, H);

      // Grid horizontal + etiquetas Y
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      const gridLines = 5;
      for (let i = 0; i <= gridLines; i++) {
        const val = (maxVal / gridLines) * i;
        const y = yPos(val);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = '#666';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmt(Math.round(val)), pad.left - 8, y);
      }

      // Etiquetas X
      ctx.fillStyle = '#666';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xStep = chartHorizon <= 10 ? 1 : chartHorizon <= 20 ? 2 : 5;
      for (let y = 0; y <= chartHorizon; y += xStep) {
        ctx.fillText(etiquetaAnio(y), xPos(y), H - pad.bottom + 10);
      }

      // Líneas
      series.forEach(s => {
        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width || (s.dashed ? 1.5 : 2.5);
        if (s.dashed) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);
        (s.points || []).forEach((p, i) => {
          const x = xPos(p.year), y = yPos(p.value);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Línea vertical de hover + puntos
      if (hoverYear != null && hoverYear >= 0 && hoverYear <= chartHorizon) {
        const hx = xPos(hoverYear);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, H - pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        series.forEach(s => {
          const pt = (s.points || []).find(p => p.year === hoverYear);
          if (!pt) return;
          ctx.beginPath();
          ctx.arc(hx, yPos(pt.value), 4, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
        });
      }
    }

    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      const pad = { left: 70, right: 20 };
      const cw = rect.width - pad.left - pad.right;
      const mx = e.clientX - rect.left - pad.left;
      if (mx < 0 || mx > cw) { tooltip.classList.remove('visible'); draw(); return; }

      const year = Math.round((mx / cw) * chartHorizon);
      if (year < 0 || year > chartHorizon) { tooltip.classList.remove('visible'); draw(); return; }

      draw(year);

      let html = '<div class="tt-year">' + (anio0 != null ? 'Año ' + (anio0 + year) : 'Año ' + year) + '</div>';
      visibles().forEach(s => {
        const pt = (s.points || []).find(p => p.year === year);
        if (!pt) return;
        const dot = s.dashed
          ? '<span class="tt-dot" style="border:1px dashed ' + s.color + ';background:transparent"></span>'
          : '<span class="tt-dot" style="background:' + s.color + '"></span>';
        html += '<div class="tt-row">' + dot + escHtml(s.label) + '<span class="tt-val">' + fmt(Math.round(pt.value)) + '</span></div>';
      });
      tooltip.innerHTML = html;
      tooltip.classList.add('visible');

      const ttW = tooltip.offsetWidth;
      const ttH = tooltip.offsetHeight;
      let tx = e.clientX - rect.left + 14;
      let ty = e.clientY - rect.top - ttH / 2;
      if (tx + ttW > rect.width - 4) tx = e.clientX - rect.left - ttW - 14;
      if (ty < 4) ty = 4;
      if (ty + ttH > rect.height - 4) ty = rect.height - ttH - 4;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
    }

    // Redibujado responsive (solo si el canvas está visible)
    let resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (canvas.offsetParent !== null) draw();
      }, 150);
    }
    window.addEventListener('resize', onResize);

    // m11: sin esto, cada gráfico creado (p. ej. al cambiar de vista y volver) deja un listener de
    // `resize` colgado para siempre en `window`, aunque su canvas ya no exista.
    function destroy() {
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      canvas.onmousemove = null;
      canvas.onmouseleave = null;
    }

    return { render, draw, destroy, ocultas: () => [...ocultas] };
  }

  return { create, hexToRgba };
});
