import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/reactions/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
