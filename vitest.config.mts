import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirrors the tsconfig "@/*" path so route handlers and components can be tested.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
