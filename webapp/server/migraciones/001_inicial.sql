-- 001_inicial: esquema de la app de finanzas (spec §4.1). Booleanos como INTEGER 0/1; JSON como TEXT.
CREATE TABLE IF NOT EXISTS conceptos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  categoria TEXT, grupo TEXT,
  importe REAL NOT NULL DEFAULT 0,
  periodicidad TEXT NOT NULL CHECK (periodicidad IN ('mensual','anual')),
  titular TEXT, esencial_en_paro INTEGER NOT NULL DEFAULT 0, vinculado_a TEXT, nota_origen TEXT,
  orden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cuentas (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('liquidez','inversion','plan_pensiones','vivienda','deuda')),
  titular TEXT, saldo REAL NOT NULL DEFAULT 0, fecha_saldo TEXT, nota_origen TEXT,
  aportado REAL, cartera_id TEXT, rol TEXT CHECK (rol IS NULL OR rol IN ('colchon','buffer','personal')),
  aportacion_mensual REAL, tipo_interes REAL,
  orden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS carteras (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, preset_id TEXT,
  tipo TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal','plan_pensiones')),
  titular TEXT,
  rentabilidad_fuente TEXT NOT NULL DEFAULT 'forward_neta' CHECK (rentabilidad_fuente IN ('forward_neta','historica','forzada')),
  rentabilidad_forzada REAL, nota_origen TEXT,
  aportacion_origen TEXT NOT NULL DEFAULT 'tecleada' CHECK (aportacion_origen IN ('tecleada','enlazada')),
  aportacion_mensual REAL, concepto_id TEXT, aportacion_inicial REAL, techo REAL, cartera_destino TEXT, notas TEXT,
  orden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS objetivos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, cartera_id TEXT,
  tipo TEXT CHECK (tipo IS NULL OR tipo IN ('unico','renta','jubilacion')),
  anio INTEGER NOT NULL, importe REAL, duracion_anios INTEGER, notas TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','falta_info')),
  orden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supuestos (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fecha TEXT NOT NULL, inflacion REAL NOT NULL, incremento_aportacion REAL NOT NULL, meses_colchon REAL,
  impuestos TEXT NOT NULL DEFAULT 'tramos_reales' CHECK (impuestos IN ('tramos_reales','plano')),
  tipo_plano REAL, base_fiscal_inicial TEXT NOT NULL DEFAULT 'aportado' CHECK (base_fiscal_inicial IN ('aportado','valor')),
  paro TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS acciones (
  id TEXT PRIMARY KEY, texto TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','hecha')),
  ligada_a TEXT, fecha TEXT, url_taskapp TEXT,
  orden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS escenarios (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, creado TEXT NOT NULL, cambios TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revisiones (
  id TEXT PRIMARY KEY, fecha TEXT NOT NULL, nota TEXT, datos TEXT NOT NULL, proyeccion TEXT NOT NULL, creada_en TEXT NOT NULL
);
