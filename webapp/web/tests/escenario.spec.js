// Escenarios (ronda 2): pestañas, «qué cambia», aplicar solo los marcados, comparar y descartar sin tocar lo real.
import { test, expect } from '@playwright/test';
import { sembrar } from './_datos.js';

test.beforeEach(async ({ request }) => { await sembrar(request); });

test('un escenario no toca lo real hasta aplicarse; descartar lo deja intacto', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await page.getByLabel('Nombre del escenario').fill('Moto');
  await page.getByLabel('Nombre del escenario').press('Enter');
  const ap = page.getByLabel('aportación mensual Finanbest Grey');
  await ap.fill('900');
  await ap.press('Enter');
  await expect(page.getByTestId('estado-grey')).toContainText('cubierta');
  await expect(page.getByLabel('Veredicto')).toContainText('comparado');           // dos veredictos: escenario y real
  await expect(page.getByLabel('Qué cambia')).toContainText('Finanbest Grey: aportas');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBe(1);
  expect((await (await request.get('/api/carteras/grey')).json()).aportacion_mensual).toBe(300);   // lo real intacto
  await page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Descartar escenario' }).click();
  await expect(page.locator('header.barra-escenario')).toHaveCount(0);
  await expect(page.getByTestId('estado-grey')).toContainText('faltan');
  expect((await (await request.get('/api/escenarios')).json()).length).toBe(0);
});

test('aplicar solo los cambios marcados: uno se escribe, el otro se queda en el escenario; comparar con otro escenario', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await page.getByLabel('Nombre del escenario').fill('Subo Grey');
  await page.getByLabel('Nombre del escenario').press('Enter');
  const ap = page.getByLabel('aportación mensual Finanbest Grey');
  await ap.fill('900'); await ap.press('Enter');
  const apM = page.getByLabel('aportación mensual Cartera Metal');
  await apM.fill('50'); await apM.press('Enter');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBe(2);
  // segundo escenario para comparar
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await page.getByLabel('Nombre del escenario').fill('Otro');
  await page.getByLabel('Nombre del escenario').press('Enter');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json()).length).toBe(2);
  await page.getByLabel('Comparar con').selectOption({ label: 'Subo Grey' });
  await expect(page.getByLabel('Veredicto')).toContainText('comparado');
  // volver al primero y aplicar solo el cambio de Grey
  await page.getByRole('button', { name: /Subo Grey/ }).click();
  await page.getByLabel('cambio 2').uncheck();
  await page.getByRole('button', { name: /Aplicar los marcados \(1\)/ }).click();
  await expect.poll(async () => (await (await request.get('/api/carteras/grey')).json()).aportacion_mensual).toBe(900);
  expect((await (await request.get('/api/carteras/metal')).json()).aportacion_mensual).toBe(300);   // no marcado: intacto
  const escenarios = await (await request.get('/api/escenarios')).json();
  expect(escenarios.find(e => e.nombre === 'Subo Grey').cambios.length).toBe(1);               // queda el de Metal
  await expect(page.locator('header.barra-escenario')).toBeVisible();                            // sigue en el escenario
  // W2a: al bajar de 2 a 1 cambios la selección se reinicia — el restante (Metal) sale marcado de nuevo
  await expect(page.getByRole('button', { name: 'Aplicar los marcados (1)' })).toBeVisible();
  await expect(page.getByLabel('cambio 1')).toBeChecked();
  await page.getByRole('button', { name: 'Aplicar los marcados (1)' }).click();
  await expect.poll(async () => (await (await request.get('/api/carteras/metal')).json()).aportacion_mensual).toBe(50);
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json()).find(e => e.nombre === 'Subo Grey')).toBeUndefined();
  await expect(page.locator('header.barra-escenario')).toHaveCount(0);                          // se borró: vuelve a Real
});

test('W2a: la selección local no viaja entre escenarios — al cambiar de uno con un cambio desmarcado a otro, en el nuevo aparece todo marcado', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await page.getByLabel('Nombre del escenario').fill('A');
  await page.getByLabel('Nombre del escenario').press('Enter');
  const ap = page.getByLabel('aportación mensual Finanbest Grey');
  await ap.fill('900'); await ap.press('Enter');
  const apM = page.getByLabel('aportación mensual Cartera Metal');
  await apM.fill('50'); await apM.press('Enter');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json()).find(e => e.nombre === 'A').cambios.length).toBe(2);
  await page.getByLabel('cambio 2').uncheck();
  await expect(page.getByRole('button', { name: 'Aplicar los marcados (1)' })).toBeVisible();
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await page.getByLabel('Nombre del escenario').fill('B');
  await page.getByLabel('Nombre del escenario').press('Enter');
  const apMB = page.getByLabel('aportación mensual Cartera Metal');
  await apMB.fill('75'); await apMB.press('Enter');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json()).find(e => e.nombre === 'B').cambios.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Aplicar los marcados (1)' })).toBeVisible();   // trivial con 1 solo cambio
  // volver a A: el cambio de escenario reinicia la selección — el desmarcado en A no sobrevive a la visita a B
  await page.getByRole('button', { name: 'A (2)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aplicar los marcados (2)' })).toBeVisible();
  await expect(page.getByLabel('cambio 1')).toBeChecked();
  await expect(page.getByLabel('cambio 2')).toBeChecked();
});

// m7+m10: el diálogo de conflictos es modal de verdad (foco al abrir, Escape cierra) y confirmar solo
// alguno de los conflictos aplica ese y deja el resto en el escenario (I5: no se pierde en silencio).
test('m10: conflicto al aplicar — diálogo modal, Escape lo cierra, imponer solo uno deja el otro en el escenario', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await page.getByLabel('Nombre del escenario').fill('Conf');
  await page.getByLabel('Nombre del escenario').press('Enter');
  const ap = page.getByLabel('aportación mensual Finanbest Grey');
  await ap.fill('900'); await ap.press('Enter');
  const apM = page.getByLabel('aportación mensual Cartera Metal');
  await apM.fill('50'); await apM.press('Enter');
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBe(2);
  // Luis cambia lo real por API mientras el escenario existe: las dos carteras quedan en conflicto.
  const grey = await (await request.get('/api/carteras/grey')).json();
  await request.put(`/api/carteras/${grey.id}`, { data: { aportacion_mensual: 350, updated_at: grey.updated_at } });
  const metal = await (await request.get('/api/carteras/metal')).json();
  await request.put(`/api/carteras/${metal.id}`, { data: { aportacion_mensual: 360, updated_at: metal.updated_at } });
  await page.getByRole('button', { name: /Aplicar los marcados/ }).click();
  let dialogo = page.getByRole('dialog', { name: 'Conflictos al aplicar' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toHaveAttribute('aria-modal', 'true');
  await expect(dialogo).toBeFocused();                     // m7: foco al abrir
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);                    // m7: Escape cierra
  await page.getByRole('button', { name: /Aplicar los marcados/ }).click();
  dialogo = page.getByRole('dialog', { name: 'Conflictos al aplicar' });
  await expect(dialogo).toBeVisible();
  await dialogo.locator('li', { hasText: 'metal' }).getByRole('checkbox').uncheck();   // solo se impone Grey
  await dialogo.getByRole('button', { name: 'Imponer los marcados y aplicar' }).click();
  await expect.poll(async () => (await (await request.get('/api/carteras/grey')).json()).aportacion_mensual).toBe(900);
  expect((await (await request.get('/api/carteras/metal')).json()).aportacion_mensual).toBe(360);   // no impuesto: intacto
  await expect(page.locator('.toast')).toContainText('no aplicados');
  const escenarios = await (await request.get('/api/escenarios')).json();
  expect(escenarios[0].cambios.length).toBe(1);            // Metal sigue en el escenario, no se perdió
});

// m10: crear y borrar un objetivo dentro de un escenario, sin llegar a aplicarlo, no debe dejar rastro:
// el delta 'crear' se retira sin más (el objetivo temporal nunca existió en lo real).
test('m10: crear y borrar un objetivo dentro de un escenario no deja rastro en «Qué cambia»', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  await page.getByLabel('Nombre del escenario').fill('Objetivo fugaz');
  await page.getByLabel('Nombre del escenario').press('Enter');
  await page.getByRole('button', { name: '+ objetivo' }).click();
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBe(1);
  await expect(page.getByLabel('Qué cambia')).toContainText('Nuevo objetivo');
  page.once('dialog', d => d.accept());
  await page.getByTitle('borrar').last().click();
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json())[0].cambios.length).toBe(0);
  await expect(page.getByLabel('Qué cambia')).toContainText('Todavía nada');
});

test('I4: «Qué cambia» describe año y rentabilidad en palabras, sin € ni — donde no toca', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ nuevo' }).click();
  const anio = page.getByLabel('año Coche');
  await anio.fill('2032');
  await anio.press('Enter');
  await page.getByLabel('detalle Finanbest Grey').click();
  const fuente = page.getByLabel('rentabilidad fuente Finanbest Grey');
  await fuente.selectOption('historica');
  const cambios = page.getByLabel('Qué cambia').locator('.cambios');
  await expect(cambios).toContainText('año 2031 → 2032');
  const filaAnio = cambios.locator('li', { hasText: 'año' });
  await expect(filaAnio).not.toContainText('€');
  await expect(filaAnio).not.toContainText('—');
  const filaRentabilidad = cambios.locator('li', { hasText: 'rentabilidad' });
  await expect(filaRentabilidad).toContainText('forzada');
  await expect(filaRentabilidad).toContainText('historica');
});

// 005: dos personas. El escenario automático lleva el autor en el nombre, no se reutiliza el de la otra persona, y
// «Qué cambia» avisa cuando el escenario abierto es de otro.
test('cada persona trabaja en su escenario automático y la app avisa al abrir el de la otra', async ({ page, request }) => {
  const deLuis = await (await request.post('/api/escenarios', { headers: { 'x-dev-user': 'luis@e2e' }, data: { nombre: 'Cambios de luis', cambios: [] } })).json();
  expect(deLuis.creado_por).toBe('luis');
  await page.goto('/');
  // edito en Real: mi escenario automático, no el de Luis aunque sea de hoy
  const ap = page.getByLabel('aportación mensual Finanbest Grey');
  await ap.fill('700'); await ap.press('Enter');
  await expect(page.locator('header.barra-escenario')).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/escenarios')).json()).length).toBe(2);
  const mio = (await (await request.get('/api/escenarios')).json()).find(e => e.id !== deLuis.id);
  expect(mio.creado_por).toBe('ana');
  expect(mio.nombre).toMatch(/^Cambios de ana /);
  expect(mio.cambios.length).toBe(1);
  await expect(page.getByLabel('Qué cambia')).not.toContainText('lo creó');
  // abro el de Luis: aviso claro
  await page.getByRole('button', { name: /Cambios de luis/ }).click();
  await expect(page.getByTestId('escenario-de-otro')).toContainText('lo creó luis');
});
