import { defineConfig } from 'vitest/config';

/**
 * `npm run test:tutor-soak`: the tutor scramble suite with 10,000 scrambles per method instead
 * of the 1,000 the default suite runs (beginner, CFOP 2-look and CFOP full last layer). Same test
 * file and seed; at this size the full last-layer run must also hit every OLL and PLL case.
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
