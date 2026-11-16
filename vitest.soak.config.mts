import { defineConfig } from 'vitest/config';

/**
 * `npm run test:tutor-soak`: the tutor scramble suite with 10,000 scrambles per method instead
 * of the 1,000 the default suite runs. Same test file, same seed, same assertions.
 */
export default defineConfig({
  test: {
    include: ['tests/tutor-scrambles.test.ts'],
    env: { TUTOR_SCRAMBLES: '10000' },
    testTimeout: 900_000,
    // Show the move-count report the suite prints.
    silent: false,
  },
});
