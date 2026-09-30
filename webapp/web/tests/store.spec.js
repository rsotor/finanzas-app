// store.jsx: I1 (revertir un campo si el servidor rechaza), I6 (memo estable del escenario, sin recalcular
// plan.panel de más), I9 (nuevoEscenario/descartarEscenario avisan en vez de reventar) e I10 (crearEscenario
// no finge una fila creada si la escritura falló).
import { test, expect } from '@playwright/test';
import { sembrar } from './_datos.js';

test.beforeEach(async ({ request }) => { await sembrar(request); });

// 09-09: lo real está protegido — vaciar un campo va al escenario automático; es al aplicar cuando el servidor lo
// rechaza, se avisa, y lo real sigue intacto.
test('I1: vaciar un campo obligatorio se apunta en el escenario; al aplicar se rechaza y lo real queda intacto', async ({ page, request }) => {
  await page.goto('/');
  const anio = page.getByLabel('año Coche');
  await anio.fill('');
  await anio.press('Enter');
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await expect.poll(async () => ((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.length).toBe(1);
  await page.getByRole('button', { name: /Aplicar los marcados/ }).click();
  await expect(page.locator('.toast')).toContainText(/no válidos: .+/);   // con el motivo del servidor, no solo el genérico
  expect((await (await request.get('/api/objetivos')).json()).find(o => o.nombre === 'Coche').anio).toBe(2031);
});

test('I6: en Real, seleccionar una fila no vuelve a calcular plan.panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('veredicto')).toBeVisible();   // datos cargados: el cálculo inicial ya pasó
  await page.evaluate(() => {
    const orig = window.SimEngine.plan.panel;
    window.__panelCalls = 0;
    window.SimEngine.plan.panel = (...a) => { window.__panelCalls++; return orig(...a); };
  });
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.getByRole('button', { name: 'concepto Luz' }).click();
  await page.getByRole('button', { name: 'concepto Comunidad' }).click();
  expect(await page.evaluate(() => window.__panelCalls)).toBe(0);
});

test('I9a: si el servidor rechaza crear el escenario, se avisa y no queda a medias', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/escenarios', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'fallo simulado al crear' }) });
    await route.continue();
  });
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('.toast')).toContainText('fallo simulado al crear');
  await expect(page.locator('header.barra-escenario')).toHaveCount(0);   // sigue en Real
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);   // creando se apagó también al fallar
});

test('I9b: si el servidor rechaza descartar el escenario, se avisa y el escenario sigue visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await page.route('**/api/escenarios/*', async route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'fallo simulado al borrar' }) });
    await route.continue();
  });
  await page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Descartar escenario' }).click();
  await expect(page.locator('.toast')).toContainText('fallo simulado al borrar');
  await expect(page.locator('header.barra-escenario')).toBeVisible();
});

test('I10: si crear en un escenario falla, no se selecciona una fila fantasma', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.route('**/api/escenarios/*', async route => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'fallo simulado al guardar el delta' }) });
    await route.continue();
  });
  await page.getByRole('button', { name: '+ añadir cuenta' }).click();
  await expect(page.locator('.toast')).toContainText('fallo simulado al guardar el delta');
  // no se abre el panel de edición con una fila que en realidad no se creó
  await expect(page.locator('.panel-edicion')).toContainText('Elige una fila');
});
