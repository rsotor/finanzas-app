// Carga los datos de pruebas (familia ficticia, plantilla-excel/pruebas.xlsx) antes de cada recorrido (la app arranca vacía).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JSON_MIGRACION = path.resolve(__dirname, '..', '..', '..', 'app', 'tests', 'fixtures', 'datos-pruebas.json');
export const datos = JSON.parse(fs.readFileSync(JSON_MIGRACION, 'utf8'));

export async function sembrar(request) {
  const r = await request.post('/api/import', { data: { datos } });
  if (!r.ok()) throw new Error('import falló: ' + (await r.text()));
  for (const e of await (await request.get('/api/escenarios')).json()) await request.delete(`/api/escenarios/${e.id}`);
  // m9: las revisiones (fotos congeladas) también son estado que un recorrido anterior puede dejar puesto.
  for (const rv of await (await request.get('/api/revisiones')).json()) await request.delete(`/api/revisiones/${rv.id}`);
}
