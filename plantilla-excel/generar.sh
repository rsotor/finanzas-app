#!/usr/bin/env bash
# Regenera los dos libros de ejemplo y sus valores cacheados (necesita python3 + openpyxl y LibreOffice).
#   ejemplo -> plantilla-excel/Finanzas familiares - plantilla de ejemplo.xlsx  (el que se comparte)
#   pruebas -> plantilla-excel/pruebas.xlsx                                     (lo leen los generadores de fixtures)
# Uso: bash plantilla-excel/generar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
conv() { HOME="$TMP/lohome" soffice --headless --norestore --convert-to xlsx:"Calc MS Excel 2007 XML" --outdir "$2" "$1" >/dev/null 2>&1; }
python3 "$AQUI/finanzas.py" "$TMP" >/dev/null
conv "$TMP/nuevo.xlsx" "$TMP/calc"
for esc in ejemplo pruebas; do
  python3 "$AQUI/objetivos.py" "$TMP/nuevo.xlsx" "$TMP/obj-$esc.xlsx" "$TMP/vals-$esc.json" "$TMP/calc/nuevo.xlsx" "$TMP/refs.json" "$esc" | grep -E 'DIAGN|chequeo'
  python3 "$AQUI/leeme.py" "$TMP/obj-$esc.xlsx" "$TMP/leeme-$esc.xlsx" >/dev/null
  mkdir -p "$TMP/calc-$esc"; conv "$TMP/leeme-$esc.xlsx" "$TMP/calc-$esc"
  python3 "$AQUI/cachear.py" "$TMP/leeme-$esc.xlsx" "$TMP/calc-$esc/leeme-$esc.xlsx" "$TMP/vals-$esc.json" "$TMP/cache-$esc.json"
done
python3 "$AQUI/inyectar-valores.py" "$TMP/leeme-ejemplo.xlsx" "$TMP/cache-ejemplo.json" "$AQUI/Finanzas familiares - plantilla de ejemplo.xlsx" >/dev/null
python3 "$AQUI/inyectar-valores.py" "$TMP/leeme-pruebas.xlsx" "$TMP/cache-pruebas.json" "$AQUI/pruebas.xlsx" >/dev/null
rm -rf "$AQUI/wk3" "$TMP"
echo "ok: libros regenerados"
