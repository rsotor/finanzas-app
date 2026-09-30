// Día 1: revisar y corregir la foto real (lista + panel de edición), colchón por grupo, cerrar la revisión.
import { test, expect } from '@playwright/test';
import { sembrar } from './_datos.js';

test.beforeEach(async ({ request }) => { await sembrar(request); });

// Lo real está protegido (09-09): editar en Real crea el escenario automático; lo real solo cambia al aplicar.
test('edito el importe en el panel: va al escenario automático y el resumen cambia; al aplicar queda guardado; cierro la revisión', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await expect(page.getByLabel('Resumen')).toContainText('Ingresos / mes');
  const ahorroAntes = await page.locator('.resumen .dato').nth(2).locator('b').textContent();
  await page.getByRole('button', { name: 'concepto Luz' }).click();
  const importe = page.getByLabel('Edición').getByLabel('importe Luz');
  await importe.fill('80,00');
  await importe.press('Enter');
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('no se toca directamente');
  await expect.poll(async () => ((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.length).toBe(1);
  expect((await (await request.get('/api/conceptos')).json()).find(c => c.nombre === 'Luz').importe).not.toBe(80);   // lo real intacto
  await expect(page.locator('.resumen .dato').nth(2).locator('b')).not.toHaveText(ahorroAntes);   // la vista ya lo refleja
  // colchón por grupo: el grupo de Vivienda pasa a "ninguno" — también al escenario
  await page.getByLabel('colchón indispensable · Vivienda habitual').selectOption('ninguno');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBeGreaterThan(1);
  // aplicar: ahora sí queda guardado y se vuelve a Real
  await page.getByRole('button', { name: /Aplicar los marcados/ }).click();
  await expect(page.locator('header.barra-escenario')).toHaveCount(0);
  await expect.poll(async () => (await (await request.get('/api/conceptos')).json()).find(c => c.nombre === 'Luz').importe).toBe(80);
  expect((await (await request.get('/api/conceptos')).json()).find(c => c.nombre === 'Hipoteca / alquiler').esencial_en_paro).toBe(false);
  await page.getByRole('button', { name: /Cerrar revisión/ }).click();
  await expect(page.getByLabel('Revisiones')).toContainText('2026-09-01');
  expect((await (await request.get('/api/revisiones')).json()).length).toBe(1);
});

test('W3a: el campo Grupo confirma al perder el foco o con Enter, no en cada tecla', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.getByRole('button', { name: 'concepto Comunidad' }).click();
  const grupo = page.getByLabel('Edición').getByLabel('grupo');
  let puts = 0;
  page.on('request', req => { if (req.method() === 'PUT' && req.url().includes('/api/')) puts++; });   // ni a conceptos ni al escenario
  await grupo.fill('Casa');
  await page.waitForTimeout(300);   // margen para que un PUT inmediato (si lo hubiera) llegue a dispararse
  expect(puts).toBe(0);   // mientras se escribe no hay PUT
  await grupo.press('Enter');
  const idComunidad = (await (await request.get('/api/conceptos')).json()).find(c => c.nombre === 'Comunidad').id;
  await expect.poll(async () => (((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.find(d => d.id === idComunidad) || { campos: {} }).campos.grupo).toBe('Casa');
  await expect(page.getByRole('region', { name: 'Ingresos y gastos', exact: true })).toContainText('indispensable · Casa');
});

test('la casilla Colchón se abre, explica el cálculo con las cuentas reales y deja fijar el objetivo en meses', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.getByRole('button', { name: 'colchón: cómo se calcula' }).click();
  const modal = page.getByRole('dialog', { name: 'Colchón: cómo se calcula' });
  await expect(modal).toContainText('Cómo se calcula');
  await expect(modal).toContainText('colchón)');   // la cuenta «Cuenta de ahorro común (colchón)» aparece con su saldo
  const objetivo = modal.getByLabel('colchón: meses objetivo');
  await objetivo.fill('6');
  await objetivo.press('Enter');
  await expect.poll(async () => (((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.find(d => d.entidad === 'supuestos') || { campos: {} }).campos.meses_colchon).toBe(6);
  await expect(modal).toBeVisible();   // crear el escenario automático no remonta la vista ni cierra la ventana
  await expect(modal).toContainText(/cubierto|por debajo/);
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.getByRole('button', { name: 'colchón: cómo se calcula' })).toContainText('objetivo 6');
});

test('Escape cierra el panel de edición también desde un desplegable; en el modal del colchón Tab no se escapa al fondo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.getByRole('button', { name: 'concepto Luz' }).click();
  await page.getByLabel('Edición').locator('select').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Edición')).toContainText('Elige una fila');
  await page.getByRole('button', { name: 'colchón: cómo se calcula' }).click();
  const modal = page.getByRole('dialog', { name: 'Colchón: cómo se calcula' });
  await expect(modal).toBeFocused();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.closest('[role=dialog]') !== null)).toBe(true);
});
