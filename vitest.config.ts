import { defineConfig } from 'vitest/config';
import { URL, fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.?(c|m)[jt]s?(x)'],
    passWithNoTests: true,
  },
});
