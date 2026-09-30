-- 006: regla de aportación de una cuenta personal (JSON {porcentaje, base: [{concepto_id, parte}]}). Con regla, lo que
-- va a la cuenta se calcula (% de la base); sin ella (NULL) sigue valiendo aportacion_mensual tecleada.
ALTER TABLE cuentas ADD COLUMN aportacion_regla TEXT;
