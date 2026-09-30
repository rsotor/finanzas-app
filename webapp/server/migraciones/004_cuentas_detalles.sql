-- 004: texto libre por cuenta (entidad, IBAN, acceso, contacto…) para tener toda la información de la cuenta en un
-- solo sitio. Solo se muestra al editar; el motor no lo lee.
ALTER TABLE cuentas ADD COLUMN detalles TEXT;
