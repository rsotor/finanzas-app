-- 002: I9 — una revisión congela TODO lo que devolvía el motor (resumen + panel), no solo la proyección,
-- y la versión de los presets con la que se calculó. `proyeccion` se mantiene por compatibilidad hacia
-- atrás (revisiones ya cerradas) y se sigue rellenando con resultados.panel.proyeccion.
ALTER TABLE revisiones ADD COLUMN resultados TEXT;
ALTER TABLE revisiones ADD COLUMN presets TEXT;
