-- 003: I11 — la migración del Excel deja constancia de dónde sale cada supuesto (Panel B17-B19, Fondo de
-- emergencia C17/C18/C59, o una simplificación del propio Excel); sin columna no había dónde guardarlo.
ALTER TABLE supuestos ADD COLUMN notas TEXT;
