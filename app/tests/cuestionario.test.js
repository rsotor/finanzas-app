const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const cuestionario = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'cuestionario-perfil.json'), 'utf8')
);

test('tiene exactamente las 7 dimensiones', () => {
  assert.strictEqual(cuestionario.dimensiones.length, 7);
});

test('cada dimensión tiene los campos requeridos', () => {
  for (const d of cuestionario.dimensiones) {
    assert.ok(typeof d.id === 'string' && d.id.length > 0, 'id');
    assert.ok(typeof d.nombre === 'string' && d.nombre.length > 0, 'nombre');
    assert.ok(typeof d.pregunta === 'string' && d.pregunta.length > 0, 'pregunta');
    assert.ok(typeof d.mapeoSituation === 'string', 'mapeoSituation');
    assert.ok(['estable', 'volatil', 'semi-estable', 'calculada'].includes(d.volatilidad), 'volatilidad válida');
  }
});

test('los ids de dimensión son únicos', () => {
  const ids = cuestionario.dimensiones.map(d => d.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('incluye las dimensiones clave (horizonte, tolerancia, capacidad de pérdida)', () => {
  const ids = cuestionario.dimensiones.map(d => d.id);
  ['horizonte', 'tolerancia', 'capacidad_perdida'].forEach(k => assert.ok(ids.includes(k), k));
});
