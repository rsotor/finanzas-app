// I7 (filas navegables por teclado), I8 (sin scroll horizontal de página en móvil en Finanzas),
// I11(a) (concepto vinculado) e I11(b) (cartera enlazada, con el nombre del concepto).
import { test, expect } from '@playwright/test';
import { sembrar } from './_datos.js';

test.beforeEach(async ({ request }) => { await sembrar(request); });

test('I7: Enter en una fila con foco abre el panel de edición de esa fila', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.getByRole('button', { name: 'concepto Luz' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Edición')).toContainText('Luz');
});

test('I8: en Finanzas, a 390px de ancho no hay scroll horizontal de página', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBe(390);
});

test('I11a: editar el importe de un concepto vinculado avisa del otro extremo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  // ig-30 "Seguro de salud" está vinculado a ig-7 "Retribución flexible Ana..."
  await page.getByRole('button', { name: /concepto Seguro de salud/ }).click();
  await expect(page.getByLabel('Edición').getByLabel('vinculado a')).toBeVisible();
  const importe = page.getByLabel('Edición').getByLabel(/importe Seguro de salud/);
  await importe.fill('200');
  await importe.press('Enter');
  await expect(page.locator('.toast')).toContainText('va unido a');
  await expect(page.locator('.toast')).toContainText('Retribución flexible');
});

test('I11b: una cartera enlazada muestra el nombre del concepto del que sale la aportación', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Carteras', exact: true })).toContainText('enlazada a «Jubilación');
});

test('gráfico: la leyenda oculta y muestra líneas, y el tooltip dice el año absoluto', async ({ page }) => {
  await page.goto('/');
  const leyenda = page.locator('.grafico-leyenda');
  await expect(leyenda).toContainText('Aportado');
  await leyenda.getByRole('button', { name: 'ocultar Pesimista' }).click();
  await expect(leyenda.getByRole('button', { name: 'mostrar Pesimista' })).toHaveClass(/oculta/);
  const canvas = page.locator('canvas[aria-label="Proyección de carteras"]');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  const tooltip = page.locator('.grafico-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/Año 20\d\d/);
  await expect(tooltip).not.toContainText('Pesimista');
  await expect(tooltip).toContainText('Aportado');
});

test('PERSONAS: titulares y campos de paro salen de la configuración, no del código (aquí, 3 personas)', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary', { hasText: /^Supuestos/ }).click();
  for (const nombre of ['Ana', 'Luis', 'Leo']) await expect(page.getByText(`Paro ${nombre} €/mes · meses`)).toBeVisible();
  await page.getByLabel('detalle Finanbest Grey').click();
  const titular = page.getByRole('region', { name: 'Carteras', exact: true }).locator('select').filter({ has: page.locator('option[value="leo"]') }).first();
  await expect(titular.locator('option')).toHaveText(['conjunto', 'Ana', 'Luis', 'Leo']);
});
