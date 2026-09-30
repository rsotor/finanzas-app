// Acceso a datos: filas ↔ objetos de `datos` (forma del plan 1). Toda escritura fija updated_at.
const crypto = require('crypto');

const COLUMNAS = {
  conceptos: ['id', 'nombre', 'tipo', 'categoria', 'grupo', 'importe', 'periodicidad', 'titular', 'esencial_en_paro', 'vinculado_a', 'nota_origen', 'orden', 'updated_at'],
  cuentas:   ['id', 'nombre', 'tipo', 'titular', 'saldo', 'fecha_saldo', 'nota_origen', 'aportado', 'cartera_id', 'rol', 'aportacion_mensual', 'aportacion_regla', 'tipo_interes', 'detalles', 'orden', 'updated_at'],
  carteras:  ['id', 'nombre', 'preset_id', 'tipo', 'titular', 'rentabilidad_fuente', 'rentabilidad_forzada', 'nota_origen', 'aportacion_origen', 'aportacion_mensual', 'concepto_id', 'aportacion_inicial', 'techo', 'cartera_destino', 'notas', 'orden', 'updated_at'],
  objetivos: ['id', 'nombre', 'cartera_id', 'tipo', 'anio', 'importe', 'duracion_anios', 'notas', 'estado', 'orden', 'updated_at'],
  acciones:  ['id', 'texto', 'estado', 'ligada_a', 'fecha', 'url_taskapp', 'orden', 'updated_at'],
};
const COLECCIONES = Object.keys(COLUMNAS);
const BOOLEANOS = { conceptos: ['esencial_en_paro'] };
const JSONS = { acciones: ['ligada_a'], cuentas: ['aportacion_regla'] };
// Forma de cada campo JSON; devuelve el error o null. null/undefined no llegan aquí: siempre valen («sin valor»).
const esObjeto = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const noNegativo = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const FORMA_JSON = {
  ligada_a: v => (esObjeto(v) && typeof v.entidad === 'string' && (typeof v.id === 'string' || typeof v.id === 'number')) ? null : 'se esperaba {entidad, id} o null',
  aportacion_regla: v => (esObjeto(v) && noNegativo(v.porcentaje) && Array.isArray(v.base)
    && v.base.every(b => esObjeto(b) && typeof b.concepto_id === 'string' && (b.parte == null || noNegativo(b.parte))))
    ? null : 'se esperaba {porcentaje, base: [{concepto_id, parte}]} o null',
};
function jsonInvalido(col, obj) {
  for (const campo of JSONS[col] || []) {
    const v = obj[campo];
    if (v === undefined || v === null) continue;
    const err = FORMA_JSON[campo](v);
    if (err) return `campo ${campo}: ${err}`;
  }
  return null;
}
const OBLIGATORIOS = {
  conceptos: ['nombre', 'tipo', 'importe', 'periodicidad'],
  cuentas: ['nombre', 'tipo', 'saldo'],
  carteras: ['nombre'],
  objetivos: ['nombre', 'anio'],
  acciones: ['texto'],
};
const DEFECTOS = {
  conceptos: { esencial_en_paro: false, orden: 0 },
  cuentas: { orden: 0 },
  carteras: { tipo: 'normal', rentabilidad_fuente: 'forward_neta', aportacion_origen: 'tecleada', orden: 0 },
  objetivos: { estado: 'activo', orden: 0 },
  acciones: { estado: 'abierta', orden: 0 },
};
const COLUMNAS_SUPUESTOS = ['fecha', 'inflacion', 'incremento_aportacion', 'meses_colchon', 'impuestos', 'tipo_plano', 'base_fiscal_inicial', 'paro', 'notas'];

// Validación de tipos (A4): numéricos finitos y enumerados contra las listas del esquema SQL.
const NUMERICOS = {
  conceptos: ['importe', 'orden'],
  cuentas: ['saldo', 'aportado', 'aportacion_mensual', 'tipo_interes', 'orden'],
  carteras: ['rentabilidad_forzada', 'aportacion_mensual', 'aportacion_inicial', 'techo', 'orden'],
  objetivos: ['anio', 'importe', 'duracion_anios', 'orden'],
  acciones: ['orden'],
};
const ENUMERADOS = {
  conceptos: { tipo: ['ingreso', 'gasto'], periodicidad: ['mensual', 'anual'] },
  cuentas: { tipo: ['liquidez', 'inversion', 'plan_pensiones', 'vivienda', 'deuda'], rol: ['colchon', 'buffer', 'personal'] },
  carteras: { tipo: ['normal', 'plan_pensiones'], rentabilidad_fuente: ['forward_neta', 'historica', 'forzada'], aportacion_origen: ['tecleada', 'enlazada'] },
  objetivos: { tipo: ['unico', 'renta', 'jubilacion'], estado: ['activo', 'falta_info'] },
  acciones: { estado: ['abierta', 'hecha'] },
};
const CATEGORIA_GASTO = ['indispensable', 'necesario', 'revisable'];   // solo aplica a conceptos de tipo 'gasto'
const NUMERICOS_SUPUESTOS = ['inflacion', 'incremento_aportacion', 'meses_colchon', 'tipo_plano'];
const ENUMERADOS_SUPUESTOS = { impuestos: ['tramos_reales', 'plano'], base_fiscal_inicial: ['aportado', 'valor'] };
// I2: estos 5 nunca pueden quedar vacíos — sin ellos el motor no calcula (fecha ancla la proyección,
// inflación/incremento la revalorizan, impuestos+base_fiscal_inicial fijan el cálculo fiscal). Se
// comprueba solo si el campo VIENE en el objeto: un delta parcial que no lo toca no debe fallar por esto.
const OBLIGATORIOS_SUPUESTOS = {
  fecha: 'la fecha es obligatoria', inflacion: 'la inflación es obligatoria',
  incremento_aportacion: 'el incremento de aportación es obligatorio',
  impuestos: 'el modo de impuestos es obligatorio', base_fiscal_inicial: 'la base fiscal inicial es obligatoria',
};

function tipoInvalido(v) { return v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v)); }
function enumInvalido(v, valores) { return v !== undefined && v !== null && !valores.includes(v); }
// I2(a): un valor no escalar (objeto/array/boolean) en un campo de texto es casi seguro un error de quien llama.
function textoInvalido(v) { return v !== undefined && v !== null && (typeof v === 'object' || typeof v === 'boolean'); }
// I2(c): orden: null se ignora (queda el actual en un UPDATE, o el defecto en un INSERT) — nunca se escribe NULL
// en una columna NOT NULL. Se aplica ANTES de fusionar con los valores por defecto / la fila actual.
function limpiarOrdenNulo(obj) {
  if (obj && obj.orden === null) { const o = { ...obj }; delete o.orden; return o; }
  return obj;
}

// updated_at estrictamente creciente aunque dos escrituras caigan en el mismo milisegundo (control optimista).
let ultimoMs = 0;
function ahora() {
  let ms = Date.now();
  if (ms <= ultimoMs) ms = ultimoMs + 1;
  ultimoMs = ms;
  return new Date(ms).toISOString();
}
const nuevoId = () => crypto.randomUUID();

function aFila(col, obj) {
  const fila = {};
  for (const c of COLUMNAS[col]) {
    let v = obj[c] === undefined ? null : obj[c];
    if ((BOOLEANOS[col] || []).includes(c)) v = v ? 1 : 0;
    if ((JSONS[col] || []).includes(c)) v = v == null ? null : JSON.stringify(v);
    fila[c] = v;
  }
  return fila;
}

function aObjeto(col, fila) {
  const obj = { ...fila };
  for (const c of BOOLEANOS[col] || []) obj[c] = !!fila[c];
  for (const c of JSONS[col] || []) obj[c] = fila[c] == null ? null : JSON.parse(fila[c]);
  return obj;
}

// I2(a): columnas de texto = todas menos numéricas, booleanas o JSON (esas llevan su propia comprobación).
function campoTexto(col, campo) {
  if (campo === 'id' || campo === 'updated_at') return false;
  if ((NUMERICOS[col] || []).includes(campo)) return false;
  if ((BOOLEANOS[col] || []).includes(campo)) return false;
  if ((JSONS[col] || []).includes(campo)) return false;
  return true;
}

// I2: numéricos/enumerados de una fila (o de un delta parcial) — sin obligatorios ni desconocidos: eso
// depende de si es una fila completa o un delta, y lo deciden validar() y validarTiposDelta() cada uno.
function validarTipos(col, obj) {
  for (const campo of COLUMNAS[col]) if (campoTexto(col, campo) && textoInvalido(obj[campo])) return `campo ${campo}: se esperaba texto`;
  for (const campo of BOOLEANOS[col] || []) { const v = obj[campo]; if (v !== undefined && v !== null && typeof v !== 'boolean') return `campo ${campo}: se esperaba boolean`; }
  const errJson = jsonInvalido(col, obj);
  if (errJson) return errJson;
  for (const campo of NUMERICOS[col] || []) if (tipoInvalido(obj[campo])) return `campo ${campo}: se esperaba número`;
  for (const [campo, valores] of Object.entries(ENUMERADOS[col] || {})) if (enumInvalido(obj[campo], valores)) return `campo ${campo}: valor no permitido (${valores.join('|')})`;
  if (col === 'conceptos' && obj.tipo === 'gasto' && enumInvalido(obj.categoria, CATEGORIA_GASTO)) return `campo categoria: valor no permitido (${CATEGORIA_GASTO.join('|')})`;
  return null;
}

// C2/I3: validación de tipos de un delta de escenario — SOLO numéricos/enumerados, en modo parcial (nunca
// obligatorios: un delta puede dejar, de camino, un campo vacío que el escenario resuelve en otro paso; la
// puerta que de verdad bloquea escribir es escribirDatos, sobre la fila resultante completa).
function validarTiposDelta(col, campos) {
  for (const [campo, valores] of Object.entries(ENUMERADOS[col] || {})) if (enumInvalido(campos[campo], valores)) return `campo ${campo}: valor no permitido (${valores.join('|')})`;
  for (const campo of NUMERICOS[col] || []) if (tipoInvalido(campos[campo])) return `campo ${campo}: se esperaba número`;
  return jsonInvalido(col, campos);   // una regla mal formada en un escenario rompería el motor al calcular la vista
}

function validar(col, obj, parcial) {
  const faltan = parcial ? [] : OBLIGATORIOS[col].filter(k => obj[k] === undefined || obj[k] === null || obj[k] === '');
  if (faltan.length) return `faltan campos obligatorios: ${faltan.join(', ')}`;
  // I2(b): con parcial, un obligatorio que SÍ viene pero vacío es tan inválido como si faltara del todo.
  if (parcial) {
    const vacios = OBLIGATORIOS[col].filter(k => k in obj && (obj[k] === null || obj[k] === ''));
    if (vacios.length) return `campo obligatorio no puede quedar vacío: ${vacios.join(', ')}`;
  }
  const desconocidos = Object.keys(obj).filter(k => !COLUMNAS[col].includes(k));
  if (desconocidos.length) return `campos desconocidos: ${desconocidos.join(', ')}`;
  return validarTipos(col, obj);
}

// Mismas reglas de tipos para el registro único de supuestos (no lleva desconocidos: eso lo pone escribirSupuestos).
// Sin obligatorios: la usa también validarDelta al GUARDAR un escenario, y ahí un delta puede dejar, de
// camino, un campo obligatorio vacío que el escenario resuelve en otro paso (igual que validarTiposDelta
// para el resto de entidades) — la puerta que de verdad bloquea ESCRIBIR es validarSupuestos, más abajo.
function validarTiposSupuestos(campos) {
  for (const campo of NUMERICOS_SUPUESTOS) if (tipoInvalido(campos[campo])) return `campo ${campo}: se esperaba número`;
  for (const [campo, valores] of Object.entries(ENUMERADOS_SUPUESTOS)) if (enumInvalido(campos[campo], valores)) return `campo ${campo}: valor no permitido (${valores.join('|')})`;
  return null;
}

// I2: puerta de ESCRITURA de supuestos (PUT /supuestos y la fila final antes de escribirDatos) — aquí sí
// se exige que los 5 obligatorios no queden vacíos, solo si el campo VIENE en el objeto.
function validarSupuestos(campos) {
  for (const [campo, mensaje] of Object.entries(OBLIGATORIOS_SUPUESTOS)) {
    if (campo in campos && (campos[campo] === null || campos[campo] === '')) return mensaje;
  }
  return validarTiposSupuestos(campos);
}

function listar(db, col) {
  return db.prepare(`SELECT * FROM ${col} ORDER BY orden, rowid`).all().map(f => aObjeto(col, f));
}

function obtener(db, col, id) {
  const f = db.prepare(`SELECT * FROM ${col} WHERE id = ?`).get(id);
  return f ? aObjeto(col, f) : null;
}

function insertar(db, col, obj) {
  obj = limpiarOrdenNulo(obj);
  const fila = aFila(col, { ...DEFECTOS[col], ...obj, id: obj.id || nuevoId(), updated_at: ahora() });
  const cols = COLUMNAS[col];
  db.prepare(`INSERT INTO ${col} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(fila);
  return obtener(db, col, fila.id);
}

// Control optimista: si `updatedAtEsperado` viene y no coincide con el actual → { conflicto: filaActual }.
function actualizar(db, col, id, campos, updatedAtEsperado) {
  const actual = obtener(db, col, id);
  if (!actual) return { noExiste: true };
  if (updatedAtEsperado && updatedAtEsperado !== actual.updated_at) return { conflicto: actual };
  campos = limpiarOrdenNulo(campos);
  const fila = aFila(col, { ...actual, ...campos, id, updated_at: ahora() });
  const cols = COLUMNAS[col].filter(c => c !== 'id');
  db.prepare(`UPDATE ${col} SET ${cols.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`).run(fila);
  return { fila: obtener(db, col, id) };
}

function borrar(db, col, id) {
  return db.prepare(`DELETE FROM ${col} WHERE id = ?`).run(id).changes > 0;
}

// m9: reordenar por posición en la lista, sin tocar updated_at (no es un cambio de datos, es de orden visual).
function reordenar(db, col, ids) {
  const existentes = new Set(listar(db, col).map(f => f.id));
  const desconocidos = ids.filter(id => !existentes.has(id));
  if (desconocidos.length) return { error: `ids desconocidos: ${desconocidos.join(', ')}` };
  db.transaction(() => { ids.forEach((id, i) => db.prepare(`UPDATE ${col} SET orden = ? WHERE id = ?`).run(i, id)); })();
  return { lista: listar(db, col) };
}

function leerSupuestos(db) {
  const f = db.prepare('SELECT * FROM supuestos WHERE id = 1').get();
  if (!f) return null;
  const s = { ...f }; delete s.id;
  s.paro = f.paro == null ? null : JSON.parse(f.paro);
  return s;
}

function escribirSupuestos(db, campos, updatedAtEsperado) {
  const actual = leerSupuestos(db);
  if (actual && updatedAtEsperado && updatedAtEsperado !== actual.updated_at) return { conflicto: actual };
  const DEFECTOS_SUPUESTOS = { impuestos: 'tramos_reales', base_fiscal_inicial: 'aportado', paro: null };
  const s = { ...DEFECTOS_SUPUESTOS, ...(actual || {}), ...campos };
  const fila = {};
  for (const c of COLUMNAS_SUPUESTOS) fila[c] = s[c] === undefined ? null : s[c];
  fila.paro = fila.paro == null ? null : JSON.stringify(fila.paro);
  // I3: si nada cambia de verdad (comparando la serialización, incluido paro), no tocar updated_at.
  if (actual) {
    const sinCambios = COLUMNAS_SUPUESTOS.every(c => fila[c] === (c === 'paro' ? (actual.paro == null ? null : JSON.stringify(actual.paro)) : actual[c]));
    if (sinCambios) return { supuestos: actual };
  }
  fila.updated_at = ahora();
  db.prepare(`INSERT INTO supuestos (id, ${COLUMNAS_SUPUESTOS.join(',')}, updated_at)
              VALUES (1, ${COLUMNAS_SUPUESTOS.map(c => '@' + c).join(',')}, @updated_at)
              ON CONFLICT(id) DO UPDATE SET ${COLUMNAS_SUPUESTOS.map(c => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at`).run(fila);
  return { supuestos: leerSupuestos(db) };
}

// `datos` completo, en la forma que consume el motor (plan 1).
function leerDatos(db) {
  const supuestos = leerSupuestos(db);
  const datos = { fecha: supuestos ? supuestos.fecha : null, supuestos };
  for (const col of COLECCIONES) datos[col] = listar(db, col);
  return datos;
}

// Sustituye el contenido de cada colección por `datos` en una transacción (import inicial y aplicar
// escenario), conservando el `updated_at` de las filas que no cambian: por fila entrante, si ya existe
// una con el mismo id y todos los campos (menos updated_at y orden, ya normalizados por aFila) son
// iguales, se deja tal cual (si solo cambia el orden, se actualiza sin tocar updated_at); si difiere,
// UPDATE con updated_at nuevo; si no existe, INSERT. Lo que no viene en `datos[col]` se borra.
const escribirDatos = (db, datos) => db.transaction(() => {
  // C2: única puerta de validación — nada se escribe si algo falla, y el fallo nunca es un 500 (err.codigo
  // 'VALIDACION' lo capturan las rutas de /import y /escenarios/:id/aplicar y responden 422).
  for (const col of COLECCIONES) {
    const vistosIds = new Set();
    for (const obj of datos[col] || []) {
      const err = validar(col, obj);
      if (err) { const e = new Error(`${col}: ${err}`); e.codigo = 'VALIDACION'; throw e; }
      if (obj.id != null) {
        if (vistosIds.has(obj.id)) { const e = new Error(`${col}: id repetido ${obj.id}`); e.codigo = 'VALIDACION'; throw e; }
        vistosIds.add(obj.id);
      }
    }
  }
  if (datos.supuestos) {
    const errSup = validarSupuestos(datos.supuestos);
    if (errSup) { const e = new Error(`supuestos: ${errSup}`); e.codigo = 'VALIDACION'; throw e; }
  }

  const contadores = {};
  for (const col of COLECCIONES) {
    const cols = COLUMNAS[col];
    const comparables = cols.filter(c => c !== 'updated_at' && c !== 'orden');
    const actuales = new Map(db.prepare(`SELECT * FROM ${col}`).all().map(f => [f.id, f]));
    const vistos = new Set();
    (datos[col] || []).forEach((obj, i) => {
      obj = limpiarOrdenNulo(obj);
      const id = obj.id || nuevoId();
      const entrante = aFila(col, { ...DEFECTOS[col], orden: i, ...obj, id });
      vistos.add(id);
      const actual = actuales.get(id);
      if (actual) {
        const igual = comparables.every(c => entrante[c] === actual[c]);
        if (igual) {
          if (entrante.orden !== actual.orden) db.prepare(`UPDATE ${col} SET orden = ? WHERE id = ?`).run(entrante.orden, id);
          return;
        }
        entrante.updated_at = ahora();
        db.prepare(`UPDATE ${col} SET ${cols.filter(c => c !== 'id').map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`).run(entrante);
        return;
      }
      entrante.updated_at = ahora();
      db.prepare(`INSERT INTO ${col} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(entrante);
    });
    for (const id of actuales.keys()) if (!vistos.has(id)) borrar(db, col, id);
    contadores[col] = db.prepare(`SELECT COUNT(*) n FROM ${col}`).get().n;
  }
  if (datos.supuestos) escribirSupuestos(db, { ...datos.supuestos, fecha: datos.fecha || datos.supuestos.fecha });
  return contadores;
})();

// Escenarios
function listarEscenarios(db) {
  return db.prepare('SELECT * FROM escenarios ORDER BY creado').all().map(f => ({ ...f, cambios: JSON.parse(f.cambios) }));
}
function obtenerEscenario(db, id) {
  const f = db.prepare('SELECT * FROM escenarios WHERE id = ?').get(id);
  return f ? { ...f, cambios: JSON.parse(f.cambios) } : null;
}
function insertarEscenario(db, e) {
  const fila = { id: e.id || nuevoId(), nombre: e.nombre, creado: e.creado || ahora(), creado_por: e.creado_por || null, cambios: JSON.stringify(e.cambios || []), updated_at: ahora() };
  db.prepare('INSERT INTO escenarios (id, nombre, creado, creado_por, cambios, updated_at) VALUES (@id, @nombre, @creado, @creado_por, @cambios, @updated_at)').run(fila);
  return obtenerEscenario(db, fila.id);
}
function actualizarEscenario(db, id, campos, updatedAtEsperado) {
  const actual = obtenerEscenario(db, id);
  if (!actual) return { noExiste: true };
  if (updatedAtEsperado && updatedAtEsperado !== actual.updated_at) return { conflicto: actual };
  const e = { ...actual, ...campos };
  db.prepare('UPDATE escenarios SET nombre = ?, cambios = ?, updated_at = ? WHERE id = ?').run(e.nombre, JSON.stringify(e.cambios), ahora(), id);
  return { escenario: obtenerEscenario(db, id) };
}
const borrarEscenario = (db, id) => db.prepare('DELETE FROM escenarios WHERE id = ?').run(id).changes > 0;

// Revisiones (fotos congeladas). I9: se guarda TODO lo que devolvía el motor (resumen + panel), no solo
// la proyección, y con qué versión de los presets se calculó; `proyeccion` se mantiene por compatibilidad.
function insertarRevision(db, r) {
  const fila = {
    id: nuevoId(), fecha: r.fecha, nota: r.nota || null, datos: JSON.stringify(r.datos),
    resultados: JSON.stringify(r.resultados), presets: JSON.stringify(r.presets || []),
    proyeccion: JSON.stringify(r.resultados.panel.proyeccion), creada_en: ahora(),
  };
  db.prepare(`INSERT INTO revisiones (id, fecha, nota, datos, resultados, presets, proyeccion, creada_en)
              VALUES (@id, @fecha, @nota, @datos, @resultados, @presets, @proyeccion, @creada_en)`).run(fila);
  return { id: fila.id, fecha: fila.fecha, nota: fila.nota, creada_en: fila.creada_en };
}
const listarRevisiones = db => db.prepare('SELECT id, fecha, nota, creada_en FROM revisiones ORDER BY fecha, creada_en').all();
// m9: limpieza de fixtures de test (los recorridos e2e siembran datos y revisiones antes de cada uno).
const borrarRevision = (db, id) => db.prepare('DELETE FROM revisiones WHERE id = ?').run(id).changes > 0;
function obtenerRevision(db, id) {
  const f = db.prepare('SELECT * FROM revisiones WHERE id = ?').get(id);
  if (!f) return null;
  return {
    ...f, datos: JSON.parse(f.datos),
    resultados: f.resultados ? JSON.parse(f.resultados) : null,
    presets: f.presets ? JSON.parse(f.presets) : null,
    proyeccion: JSON.parse(f.proyeccion),
  };
}

module.exports = {
  COLECCIONES, COLUMNAS, COLUMNAS_SUPUESTOS, nuevoId, validar, validarSupuestos, validarTiposSupuestos, validarTiposDelta,
  listar, obtener, insertar, actualizar, borrar, reordenar,
  leerSupuestos, escribirSupuestos, leerDatos, escribirDatos,
  listarEscenarios, obtenerEscenario, insertarEscenario, actualizarEscenario, borrarEscenario,
  insertarRevision, listarRevisiones, obtenerRevision, borrarRevision,
};
