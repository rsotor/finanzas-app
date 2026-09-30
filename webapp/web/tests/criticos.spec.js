// Hallazgos críticos de la revisión de rama (C1-C3): la creación de un escenario no deja ventana de
// escritura sobre lo real; un escenario que rompe el motor no deja la app sin salida; el slider funciona.
import { test, expect } from '@playwright/test';
import { sembrar } from './_datos.js';

test.beforeEach(async ({ request }) => { await sembrar(request); });

test('C1: mientras se crea un escenario (POST en vuelo), ninguna edición cae en lo real', async ({ page, request }) => {
  await page.route('**/api/escenarios', async route => {
    if (route.request().method() === 'POST') await new Promise(r => setTimeout(r, 400));
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
  // sin esperar a que el POST resuelva: marcar una acción en Plan. pointer-events:none bloquea el hit-test
  // real del navegador incluso con force:true — dispatchEvent lo evita, disparando el click igualmente.
  await page.getByLabel(/Revisar las rentabilidades/).dispatchEvent('click');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json()).length).toBe(1);
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBe(1);   // el cambio fue al escenario nuevo, no a lo real
  const accion = (await (await request.get('/api/acciones')).json()).find(a => /Revisar las rentabilidades/.test(a.texto));
  expect(accion.estado).toBe('abierta');          // lo real intacto
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
});

test('C2: un escenario que rompe el motor no deja la app sin salida', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await page.locator('summary', { hasText: 'Supuestos' }).click();
  const inflacion = page.getByLabel('inflación', { exact: true });
  await inflacion.fill('');
  await inflacion.press('Enter');
  await expect(page.locator('.alerta').first()).toContainText('El motor no puede calcular');
  await expect(page.getByLabel('Qué cambia')).toBeVisible();
  const descartar = page.getByRole('button', { name: 'Descartar escenario' });
  await expect(descartar).toBeVisible();
  await page.once('dialog', d => d.accept());
  await descartar.click();
  await expect(page.locator('header.barra-escenario')).toHaveCount(0);
  await expect(page.getByTestId('veredicto')).toContainText('NO LLEGAS');
});

test('C3a: el slider funciona con teclado y escribe el valor final', async ({ page, request }) => {
  await page.goto('/');
  const slider = page.getByLabel('aportación Finanbest Grey');
  await slider.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  const numero = page.getByLabel('aportación mensual Finanbest Grey');
  await expect(numero).toHaveValue('400 €');   // sin foco se lee con «€» (09-14)
  // lo real está protegido: el valor final va al escenario automático
  await expect.poll(async () => (((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.find(d => d.id === 'grey') || { campos: {} }).campos.aportacion_mensual).toBe(400);
  expect((await (await request.get('/api/carteras/grey')).json()).aportacion_mensual).toBe(300);
});

test('C3b: arrastrar el slider mueve el valor en vivo y la API recibe el valor final al soltar', async ({ page, request }) => {
  await page.goto('/');
  const slider = page.getByLabel('aportación Finanbest Grey');
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 10 });
  const valorMedio = Number(await slider.inputValue());
  expect(valorMedio).toBeGreaterThan(300);
  await page.mouse.up();
  const valorFinal = Number(await slider.inputValue());
  await expect.poll(async () => (((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.find(d => d.id === 'grey') || { campos: {} }).campos.aportacion_mensual).toBe(valorFinal);
});
