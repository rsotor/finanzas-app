// Cliente HTTP mínimo. Toda respuesta no-2xx se convierte en un Error con status y cuerpo.
async function pedir(metodo, ruta, cuerpo) {
  const r = await fetch(ruta, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!r.ok) { const e = new Error((json && json.error) || `HTTP ${r.status}`); e.status = r.status; e.cuerpo = json; throw e; }
  return json;
}

export const api = {
  get: ruta => pedir('GET', ruta),
  post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
  del: ruta => pedir('DELETE', ruta),
};
