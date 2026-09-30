// useGrouping 'always': en es-ES el punto de miles por defecto solo sale desde 5 cifras («5705 €»); se lee mal.
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
export const E = v => (v == null || !Number.isFinite(v)) ? '—' : eur.format(v);
export const E2 = v => (v == null || !Number.isFinite(v)) ? '—' : eur2.format(v);
export const P = (v, d = 2) => (v == null || !Number.isFinite(v)) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
export const N = (v, d = 1) => (v == null || !Number.isFinite(v)) ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: d });
// Entrada de usuario → número (admite coma decimal). Vacío → null.
// I3: "1.234" sin coma decimal son miles (grupos de EXACTAMENTE 3 dígitos tras cada punto) — se quitan los
// puntos antes de convertir. "2.5" no cuadra (1 dígito tras el punto) y se deja como decimal.
export function aNumero(texto) {
  if (texto === '' || texto == null) return null;
  let t = String(texto).trim();
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
}
