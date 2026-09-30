// Día 2: el Panel da el veredicto del Excel; toco una aportación y el semáforo reacciona; un objetivo nuevo rompe el plan.
import { test, expect } from '@playwright/test';
import { sembrar } from './_datos.js';

test.beforeEach(async ({ request }) => { await sembrar(request); });

test('veredicto del Excel, semáforos, detalle de cartera, y un objetivo nuevo se refleja en la proyección', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByTestId('veredicto')).toContainText('NO LLEGAS');
  await expect(page.getByTestId('veredicto')).toContainText('Coche, en 2031');
  await expect(page.getByTestId('estado-grey')).toContainText('faltan');
  await expect(page.getByTestId('estado-metal')).toContainText('cubierta');
  await expect(page.getByTestId('estado-pp')).toContainText('sin objetivos');
  await expect(page.getByLabel('Veredicto')).toContainText('sin modelar');
  const ap = page.getByLabel('aportación mensual Finanbest Grey');
  await ap.fill('700');
  await ap.press('Enter');
  await expect(page.getByTestId('estado-grey')).toContainText('cubierta');
  // lo real está protegido: la aportación va al escenario automático, no a la API de carteras
  await expect.poll(async () => (((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.find(d => d.id === 'grey') || { campos: {} }).campos.aportacion_mensual).toBe(700);
  expect((await (await request.get('/api/carteras/grey')).json()).aportacion_mensual).toBe(300);
  // el detalle de la cartera se despliega y muestra la fuente de la rentabilidad
  await page.getByLabel('detalle Finanbest Grey').click();
  await expect(page.getByRole('region', { name: 'Carteras', exact: true })).toContainText('Supuesto del libro de ejemplo');
  // un objetivo nuevo caro en Grey vuelve a romper el plan
  await page.getByRole('button', { name: '+ objetivo' }).click();
  const importe = page.getByLabel('importe Nuevo objetivo');
  await importe.fill('90000');
  await importe.press('Enter');
  await expect(page.getByTestId('estado-grey')).toContainText('faltan');
  // añadir una cartera: aparece como fila sin objetivos
  await page.getByRole('button', { name: '+ añadir cartera' }).click();
  await expect(page.getByRole('region', { name: 'Carteras', exact: true })).toContainText('Nueva cartera');
});

test('W1a: el número escrito a mano gana al slider que quedó a medio disparar', async ({ page, request }) => {
  await page.goto('/');
  const slider = page.getByLabel('aportación Finanbest Grey');
  await slider.fill('900');
  const numero = page.getByLabel('aportación mensual Finanbest Grey');
  await numero.fill('650');
  await numero.press('Enter');
  await page.waitForTimeout(1000);   // el diferido del slider (400ms) ya tuvo tiempo de sobra para disparar
  const delta = (await (await request.get('/api/escenarios')).json())[0].cambios.find(d => d.id === 'grey');
  expect(delta.campos.aportacion_mensual).toBe(650);   // el número, no el 900 del slider (y en el escenario, no en lo real)
});

test('W1a: un slider tocado en un escenario sigue escribiendo ahí aunque se cambie a Real antes de que dispare', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  const slider = page.getByLabel('aportación Finanbest Grey');
  await slider.fill('1200');
  await page.getByRole('button', { name: '● Real' }).click();      // menos de 400ms después de soltar el slider
  await page.waitForTimeout(600);
  expect((await (await request.get('/api/carteras/grey')).json()).aportacion_mensual).toBe(300);   // lo real no cambia
  const escenarios = await (await request.get('/api/escenarios')).json();
  expect(escenarios.length).toBe(1);
  expect(escenarios[0].cambios.length).toBe(1);
  expect(escenarios[0].cambios[0].campos.aportacion_mensual).toBe(1200);   // el delta sí queda en el escenario
});

test('el total a carteras de Plan cuadra con el Reparto del ahorro, que vive en Finanzas', async ({ page }) => {
  await page.goto('/');
  const total = page.getByTestId('total-carteras');
  await expect(total).toContainText('Total a carteras');
  await expect(total).toContainText('600,00 €/mes');           // 300 + 300 tecleadas (datos de la migración)
  await expect(total).toContainText('enlazadas');              // el plan de pensiones va aparte
  // la migración no trae cuenta buffer: arriba se avisa del sin dueño (antes decía «sin dueño 0 €» aunque hubiera buffer)
  await expect(page.getByLabel('Veredicto')).toContainText('sin dueño');
  await expect(page.getByLabel('Reparto del ahorro')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finanzas' }).click();
  const reparto = page.getByLabel('Reparto del ahorro');
  await expect(reparto).toContainText('A carteras');
  await expect(reparto).toContainText('600,00 €');
});

test('los grupos de ingresos y gastos se pliegan, se recuerda al recargar, y buscar los abre', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  const luz = page.getByRole('button', { name: 'concepto Luz' });
  await expect(luz).toBeVisible();
  await page.getByRole('button', { name: 'plegar todo', exact: true }).click();
  await expect(luz).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ingresos y gastos', exact: true })).toContainText('/mes');   // los totales siguen a la vista
  await page.reload();
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await expect(page.getByRole('button', { name: 'desplegar todo', exact: true })).toBeVisible();
  await expect(luz).toHaveCount(0);
  await page.getByLabel('buscar concepto').fill('Luz');
  await expect(luz).toBeVisible();
  await page.getByLabel('buscar concepto').fill('');
  await page.getByRole('button', { name: 'desplegar todo', exact: true }).click();
  await expect(luz).toBeVisible();
});

test('aportación personal por regla: % de una base; el reparto la desglosa por cuenta con su «vs» y «Qué cambia» la describe', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await expect(page.getByTestId('reparto-cuenta-pn-ana')).toContainText('150,00 €');   // fija, como viene de los datos de pruebas
  await expect(page.getByTestId('reparto-cuenta-pn-ana')).toContainText('(fija)');
  await page.getByRole('button', { name: 'cuenta Cuenta personal Ana' }).click();
  const panel = page.getByLabel('Edición');
  await panel.getByLabel('modo aportación Cuenta personal Ana').selectOption('regla');
  // por defecto: 10 % de su nómina (el primer ingreso de Ana) = 210,00
  await expect(page.getByTestId('regla-pn-ana')).toContainText('× 10 % = 210,00 €/mes');
  await panel.getByRole('button', { name: '+ concepto' }).click();
  await panel.getByLabel('base 2 Cuenta personal Ana', { exact: true }).selectOption('ig-33');   // plan de pensiones, 150,00
  const parte = panel.getByLabel('parte 2 Cuenta personal Ana');
  await parte.fill('50');
  await parte.press('Enter');
  // (2.100 + 50 % de 150) × 10 % = 217,50
  await expect(page.getByTestId('regla-pn-ana')).toContainText('50 % de 150,00 €');
  await expect(page.getByTestId('regla-pn-ana')).toContainText('= 217,50 €/mes');
  const fila = page.getByTestId('reparto-cuenta-pn-ana');
  await expect(fila).toContainText('217,50 €');
  await expect(fila).toContainText('vs 150,00 €');   // estamos en el escenario automático: se compara con lo real
  await expect(page.getByLabel('Qué cambia')).toContainText('aporta fija → 10 % de Nómina neta Ana + Jubilación (plan de pensiones) al 50 %');
  // el servidor guarda la regla en el escenario (lo real no se toca hasta aplicar)
  await expect.poll(async () => (((await (await request.get('/api/escenarios')).json())[0] || { cambios: [] }).cambios.find(d => d.id === 'pn-ana') || { campos: {} }).campos.aportacion_regla?.base?.length).toBe(2);
});

test('los importes se leen con miles y «€» y se editan con la cifra pelada', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Finanzas' }).click();
  await page.getByRole('button', { name: 'cuenta Cuenta personal Ana' }).click();
  const saldo = page.getByLabel('Edición').getByLabel('saldo Cuenta personal Ana');
  await expect(saldo).toHaveValue('1.500 €');
  await saldo.focus();
  await expect(saldo).toHaveValue('1500');
  await saldo.fill('3.100,5');
  await saldo.press('Enter');
  await expect(saldo).toHaveValue('3.100,50 €');
});
