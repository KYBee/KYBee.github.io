import { env as testBindings } from 'cloudflare:workers';
import {
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import type {
  ReactionTargetManifest,
} from '../../../src/lib/reactions/contracts';
import type { Env } from '../src/env';

export const ALLOWED_ORIGIN = 'https://kybee.github.io';
export const TEST_SECRET = '0123456789abcdef0123456789abcdef';
export const MANIFEST_URL =
  'https://kybee.github.io/reaction-targets.json';
export const FIXED_RANDOM_BYTES = Uint8Array.from(
  { length: 32 },
  (_, index) => index,
);
export const VALID_MANIFEST: ReactionTargetManifest = {
  version: 1,
  targets: ['side:booster', 'work:samsung-metrics'],
};

export class RecordingRateLimiter {
  readonly keys: string[] = [];

  constructor(public success = true) {}

  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key);
    return { success: this.success };
  }
}

export interface ManifestFetchCall {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
}

export function createManifestFetch(
  manifest: unknown = VALID_MANIFEST,
): {
  calls: ManifestFetchCall[];
  fetchImpl: typeof fetch;
} {
  const calls: ManifestFetchCall[] = [];
  const fetchImpl = (async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

export function createTestEnv({
  db = testBindings.DB,
  issueLimiter = new RecordingRateLimiter(),
  manifestUrl = MANIFEST_URL,
  writeLimiter = new RecordingRateLimiter(),
}: {
  db?: D1Database;
  issueLimiter?: RecordingRateLimiter;
  manifestUrl?: string;
  writeLimiter?: RecordingRateLimiter;
} = {}): Env {
  return {
    DB: db,
    ISSUE_RATE_LIMITER: issueLimiter,
    REACTION_HMAC_SECRET: TEST_SECRET,
    REACTION_TARGET_MANIFEST_URL: manifestUrl,
    WRITE_RATE_LIMITER: writeLimiter,
  };
}

export function jsonRequest(
  path: string,
  body: unknown,
  {
    authorization,
    contentType = 'application/json',
    ip = '203.0.113.4',
    method = 'POST',
    origin = ALLOWED_ORIGIN,
  }: {
    authorization?: string;
    contentType?: string | null;
    ip?: string | null;
    method?: string;
    origin?: string | null;
  } = {},
): Request {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set('Authorization', authorization);
  }
  if (contentType !== null) {
    headers.set('Content-Type', contentType);
  }
  if (ip !== null) headers.set('CF-Connecting-IP', ip);
  if (origin !== null) headers.set('Origin', origin);
  return new Request(`https://reactions.example${path}`, {
    body: JSON.stringify(body),
    headers,
    method,
  });
}

export async function dispatch(
  worker: ExportedHandler<Env>,
  request: Request,
  bindings: Env,
): Promise<Response> {
  if (!worker.fetch) throw new TypeError('Worker fetch handler is missing');
  const ctx = createExecutionContext();
  const incomingRequest = request as Parameters<
    NonNullable<ExportedHandler<Env>['fetch']>
  >[0];
  const response = await worker.fetch(incomingRequest, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
