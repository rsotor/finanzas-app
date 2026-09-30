// I3: aNumero interpreta "1.234" (sin coma) como miles, no como decimal — test unitario puro, sin navegador.
import { test, expect } from '@playwright/test';
import { aNumero } from '../src/formato.js';

test.describe('aNumero', () => {
  test('miles sin coma decimal: se quitan los puntos', () => {
    expect(aNumero('1.234')).toBe(1234);
    expect(aNumero('12.345.678')).toBe(12345678);
    expect(aNumero('-1.234')).toBe(-1234);
  });

  test('decimal con un solo dígito tras el punto: no es miles', () => {
    expect(aNumero('2.5')).toBe(2.5);
    expect(aNumero('12.34')).toBe(12.34);
  });

  test('coma decimal: se sigue admitiendo como antes', () => {
    expect(aNumero('1.234,56')).toBe(1234.56);
    expect(aNumero('2,75')).toBe(2.75);
  });

  test('vacío o nulo: null; no numérico: NaN', () => {
    expect(aNumero('')).toBe(null);
    expect(aNumero(null)).toBe(null);
    expect(Number.isNaN(aNumero('abc'))).toBe(true);
  });
});
