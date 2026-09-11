import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { URL, fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  plugins: [tailwindcss(), react()],
});
