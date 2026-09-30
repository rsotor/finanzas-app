// Arranque de desarrollo multiplataforma (npm run dev): fija la configuración de desarrollo sin la sintaxis
// VAR=valor de Unix, que no funciona en Windows. Lo que ya venga en el entorno manda.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.AUTH_MODE = process.env.AUTH_MODE || 'dev';
process.env.AUTH_DEV_EMAIL = process.env.AUTH_DEV_EMAIL || 'ana@local';
require('./index');
