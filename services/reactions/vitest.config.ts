import { fileURLToPath } from 'node:url';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const serviceRoot = fileURLToPath(new URL('.', import.meta.url));
const migrations = await readD1Migrations(`${serviceRoot}/migrations`);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: `${serviceRoot}/wrangler.jsonc` },
      miniflare: {
        d1Databases: ['DB'],
        bindings: {
          TEST_MIGRATIONS: migrations,
          REACTION_HMAC_SECRET:
            'test-only-secret-with-at-least-32-bytes',
        },
      },
    }),
  ],
  test: {
    include: ['services/reactions/test/**/*.test.ts'],
    setupFiles: ['services/reactions/test/setup.ts'],
  },
});
