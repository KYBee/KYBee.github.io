import { env } from 'cloudflare:workers';
import {
  applyD1Migrations,
  type D1Migration,
} from 'cloudflare:test';
import { beforeEach } from 'vitest';
import type { Env as ReactionEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends ReactionEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  if (env.TEST_MIGRATIONS.length > 0) {
    await env.DB.prepare('DELETE FROM reactions').run();
  }
});
