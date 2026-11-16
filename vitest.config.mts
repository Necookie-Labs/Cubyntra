import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirrors the tsconfig "@/*" path so route handlers and components can be tested.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The first solve or validation in each worker builds Kociemba pruning tables: about
    // 2 s alone, but well past the 5 s / 10 s defaults while other suites compete for CPU.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Agent worktrees under .claude/ are other checkouts; their tests run from their own root.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
