# Seguridad

## Cómo avisar de un fallo de seguridad

**No abras una issue pública.** Usa el aviso privado de GitHub:
[Report a vulnerability](https://github.com/rsotor/finanzas-app/security/advisories/new)
(pestaña *Security* del repo → *Report a vulnerability*). Solo lo ve el mantenedor.

Incluye, si puedes:
- qué parte está afectada (servidor, interfaz, autenticación, Docker…) y en qué versión o commit;
- cómo reproducirlo, **con la demo** (`npm run demo`) y nunca con datos financieros reales;
- qué impacto crees que tiene.

Es un proyecto personal mantenido en el tiempo libre: no hay plazos garantizados, pero los avisos de
seguridad tienen prioridad sobre cualquier otra cosa. Cuando haya arreglo, se publica y se da crédito a quien
lo avisó (si quiere).

## Versiones soportadas

Solo la rama `main`. Si usas una copia antigua, actualiza (`git pull` + `npm install`) antes de avisar.

## Qué se considera un fallo de seguridad

- Acceder a los datos o modificarlos sin pasar por la autenticación del modo configurado.
- Que el **modo local** (sin login) acepte conexiones desde fuera de `127.0.0.1` sin que el usuario lo haya
  pedido explícitamente con `HOST`.
- Saltarse la validación de Cloudflare Access en el modo `cloudflare` (token de otro equipo, audiencia
  incorrecta, email no autorizado…), o que el token de servicio pueda escribir.
- Inyección de código o de HTML a través de los datos, los presets o los ficheros importados.
- Dependencias con vulnerabilidades conocidas que afecten a la app (Dependabot ya vigila las del repo).

## Qué no lo es

- Que el modo local no tenga login: es a propósito. Por eso solo escucha en tu ordenador.
- Exponer la app a internet sin autenticación configurándolo tú a mano.
- Errores de cálculo: son importantes, pero van por la issue de *Error de cálculo*.
