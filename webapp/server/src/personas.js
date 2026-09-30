// Las personas del hogar: titulares posibles y a quién se le calcula el paro. Vienen de la variable PERSONAS
// ("id:Nombre,id:Nombre", como ALLOWED_EMAILS) y nunca del código: la app no sabe nada de ninguna familia concreta.
// El id es lo que se guarda en la base de datos (titular, paro), así que no debe cambiar una vez hay datos.
const POR_DEFECTO = 'ana:Ana,luis:Luis';   // la familia de ejemplo (ejemplo/datos-ejemplo.json)
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function leerPersonas(texto) {
  const entradas = String(texto == null || texto === '' ? POR_DEFECTO : texto).split(',').map(x => x.trim()).filter(Boolean);
  if (!entradas.length) throw new Error('PERSONAS vacía: pon al menos una persona (id:Nombre)');
  const vistos = new Set();
  return entradas.map(e => {
    const [id, ...resto] = e.split(':');
    const nombre = resto.join(':').trim() || id.charAt(0).toUpperCase() + id.slice(1);
    if (!ID.test(id)) throw new Error(`PERSONAS: id no válido «${id}» (minúsculas, números, - o _; empieza por letra o número)`);
    if (id === 'conjunto') throw new Error('PERSONAS: «conjunto» está reservado para lo que es de todos');
    if (vistos.has(id)) throw new Error(`PERSONAS: id repetido «${id}»`);
    vistos.add(id);
    return { id, nombre };
  });
}

module.exports = { leerPersonas, POR_DEFECTO };
