// Abre la base SQLite y aplica las migraciones pendientes de ../migraciones (ficheros NNN_*.sql, en orden).
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DIR_MIGRACIONES = path.join(__dirname, '..', 'migraciones');

function abrir(ruta) {
  // I6: arranque en local sin preparar el directorio a mano (salvo :memory:, que no tiene directorio).
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  // Sin claves foráneas en el esquema: las referencias entre entidades las valida el motor
  // (objetivo con cartera desconocida → sinModelar) y el frontend.
  migrar(db);
  return db;
}

function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)');
  const hechas = new Set(db.prepare('SELECT nombre FROM migraciones').all().map(r => r.nombre));
  const ficheros = fs.readdirSync(DIR_MIGRACIONES).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort();
  const aplicar = db.transaction((nombre, sql) => {
    db.exec(sql);
    db.prepare('INSERT INTO migraciones (nombre, aplicada_en) VALUES (?, ?)').run(nombre, new Date().toISOString());
  });
  const aplicadas = [];
  for (const f of ficheros) {
    if (hechas.has(f)) continue;
    aplicar(f, fs.readFileSync(path.join(DIR_MIGRACIONES, f), 'utf8'));
    aplicadas.push(f);
  }
  return aplicadas;
}

module.exports = { abrir, migrar, DIR_MIGRACIONES };
