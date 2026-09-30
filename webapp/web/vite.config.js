import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite sirve el frontend y reenvía al servidor (npm run dev en webapp/server) la API,
// el motor (/motor = app/ del repo) y los estilos compartidos (/estilos = styles/ del repo).
export default defineConfig({
  plugins: [react()],
  server: {
    // 5180 y no el 5173 por defecto de Vite: así no choca con otros proyectos Vite abiertos (el navegador mezcla cachés)
    // de módulos de las dos apps (pantalla en blanco al cambiar de una a otra).
    port: 5180,
    proxy: {
      '/api': 'http://localhost:3000',
      '/motor': 'http://localhost:3000',
      '/estilos': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
