-- 005: quién creó cada escenario (nombre de la persona autenticada). Con varias personas usando la app, cada uno trabaja en
-- su escenario automático y la app avisa antes de aplicar el de la otra.
ALTER TABLE escenarios ADD COLUMN creado_por TEXT;
