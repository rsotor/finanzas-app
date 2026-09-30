# -*- coding: utf-8 -*-
"""Inyecta en el XML los valores cacheados calculados en Python (JSON hoja||celda -> valor)."""
import re, sys, os, zipfile, shutil, json
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

SRC, VALJSON, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
raw = json.load(open(VALJSON))
VAL = {}
for k, v in raw.items():
    sh, ref = k.split('||')
    if v == '' or v is None:
        continue
    VAL.setdefault(sh, {})[ref] = v
print('a inyectar:', {k: len(v) for k, v in VAL.items()})

WORK = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'wk3')
if os.path.exists(WORK):
    shutil.rmtree(WORK)
with zipfile.ZipFile(SRC) as z:
    names = z.namelist()
    z.extractall(WORK)

wbxml = open(os.path.join(WORK, 'xl/workbook.xml'), encoding='utf-8').read()
rid = {}
for m in re.finditer(r'<sheet\b([^>]*)/>', wbxml):
    nm = re.search(r'name="([^"]*)"', m.group(1))
    ri = re.search(r'r:id="([^"]*)"', m.group(1))
    if nm and ri:
        rid[nm.group(1)] = ri.group(1)
rt = ET.parse(os.path.join(WORK, 'xl/_rels/workbook.xml.rels')).getroot()
tgt = {e.get('Id'): e.get('Target') for e in rt}

total = 0
for sh, celdas in VAL.items():
    t = tgt[rid[sh]].lstrip('/')
    path = os.path.join(WORK, t) if t.startswith('xl/') else os.path.join(WORK, 'xl', t)
    x = open(path, encoding='utf-8').read()

    def rep(m):
        global total
        ref, attrs, body = m.group(1), m.group(2), m.group(3)
        if ref not in celdas:
            return m.group(0)
        total += 1
        v = celdas[ref]
        attrs = re.sub(r'\s+t="[^"]*"', '', attrs)
        if isinstance(v, str):
            return f'<c r="{ref}"{attrs} t="str">{body}<v>{escape(v)}</v></c>'
        return f'<c r="{ref}"{attrs}>{body}<v>{v!r}</v></c>'

    x = re.sub(r'<c r="([A-Z]+\d+)"([^>]*)>(<f>.*?</f>)(?:<v\s*/>|<v>.*?</v>)?</c>', rep, x, flags=re.S)
    open(path, 'w', encoding='utf-8').write(x)
print('valores inyectados:', total)

w = open(os.path.join(WORK, 'xl/workbook.xml'), encoding='utf-8').read()
if 'fullCalcOnLoad' not in w:
    w = re.sub(r'<calcPr([^/]*)/>', r'<calcPr\1 fullCalcOnLoad="1"/>', w)
    if 'calcPr' not in w:
        w = w.replace('</workbook>', '<calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>')
open(os.path.join(WORK, 'xl/workbook.xml'), 'w', encoding='utf-8').write(w)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.write(os.path.join(WORK, n), n)
print('OK ->', OUT)
