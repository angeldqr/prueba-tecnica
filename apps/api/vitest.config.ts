import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    clearMocks: true,
  },
  plugins: [
    // esbuild descarta el emitDecoratorMetadata, y sin él la inyección de
    // dependencias de Nest no resuelve nada en los tests. SWC sí lo emite.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
