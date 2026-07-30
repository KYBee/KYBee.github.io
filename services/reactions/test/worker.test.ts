import { describe, expect, it, vi } from 'vitest';
import type {
  ApiErrorResponse,
  BootstrapResponse,
  SetReactionResponse,
} from '../../../src/lib/reactions/contracts';
import { createReactionWorker } from '../src/index';
import {
  issueVisitorToken,
  verifyVisitorToken,
} from '../src/token';
import {
  ALLOWED_ORIGIN,
  FIXED_RANDOM_BYTES,
  MANIFEST_URL,
  RecordingRateLimiter,
  TEST_SECRET,
  createManifestFetch,
  createTestEnv,
  dispatch,
  jsonRequest,
  readJson,
} from './helpers';

const FIXED_VISITOR_TOKEN =
  'v1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
  + '.aiEQm4RWT4Noqxp9Qc2giYY2LSUdNFXIwf_bTccGkYA';
const FIXED_VISITOR_HASH =
  'Yw3NKWbEM2aRElRIu7JbT_QSpJxzLbLIq8G4WBvXEN0';

const jsonHeaders = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  vary: 'Origin',
};
const errorHeadersWithoutOrigin = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  vary: 'Origin',
};
const emptyCounts = { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 };

function headers(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers);
}

function workerWithManifest(
  manifestFetch = createManifestFetch(),
  options: {
    randomBytes?: () => Uint8Array;
  } = {},
): {
  calls: ReturnType<typeof createManifestFetch>['calls'];
  worker: ExportedHandler<ReturnType<typeof createTestEnv>>;
} {
  return {
    calls: manifestFetch.calls,
    worker: createReactionWorker({
      fetchImpl: manifestFetch.fetchImpl,
      randomBytes: options.randomBytes ?? (() => FIXED_RANDOM_BYTES),
    }),
  };
}

describe('reaction Worker bootstrap route', () => {
  it('issues a canonical visitor token and zero-filled snapshots', async () => {
    const issueLimiter = new RecordingRateLimiter();
    const bindings = createTestEnv({ issueLimiter });
    const { calls, worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['work:samsung-metrics', 'side:booster'],
      }),
      bindings,
    );

    expect(response.status).toBe(200);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(await readJson<BootstrapResponse>(response)).toEqual({
      visitorToken: FIXED_VISITOR_TOKEN,
      reactions: {
        'work:samsung-metrics': {
          counts: emptyCounts,
          selected: [],
        },
        'side:booster': {
          counts: emptyCounts,
          selected: [],
        },
      },
    });
    expect(issueLimiter.keys).toHaveLength(1);
    expect(issueLimiter.keys[0]).toMatch(
      /^issue:[A-Za-z0-9_-]{43}$/,
    );
    expect(issueLimiter.keys[0]).not.toContain('203.0.113.4');
    expect(calls).toEqual([{
      input: new URL(MANIFEST_URL),
      init: {
        redirect: 'manual',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      },
    }]);
  });

  it('keeps a valid signed token and restores its selection', async () => {
    const identity = await issueVisitorToken(
      TEST_SECRET,
      () => Uint8Array.from(FIXED_RANDOM_BYTES),
    );
    await createTestEnv().DB.prepare(`
      INSERT INTO reactions (target_id, emoji, visitor_hash)
      VALUES (?, ?, ?)
    `).bind(
      'work:samsung-metrics',
      '🔥',
      identity.visitorHash,
    ).run();
    const issueLimiter = new RecordingRateLimiter();
    const bindings = createTestEnv({ issueLimiter });
    const { worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['work:samsung-metrics'],
      }, { authorization: `Bearer ${identity.token}` }),
      bindings,
    );

    expect(response.status).toBe(200);
    expect(await readJson<BootstrapResponse>(response)).toEqual({
      visitorToken: identity.token,
      reactions: {
        'work:samsung-metrics': {
          counts: { ...emptyCounts, '🔥': 1 },
          selected: ['🔥'],
        },
      },
    });
    expect(issueLimiter.keys).toEqual([]);
  });

  it('replaces a damaged token and applies the issuance limiter', async () => {
    const issueLimiter = new RecordingRateLimiter();
    const bindings = createTestEnv({ issueLimiter });
    const { worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }, { authorization: 'Bearer v1.damaged.token' }),
      bindings,
    );

    expect(response.status).toBe(200);
    expect((await readJson<BootstrapResponse>(response)).visitorToken)
      .toBe(FIXED_VISITOR_TOKEN);
    expect(issueLimiter.keys).toHaveLength(1);
  });

  it('returns 429 before fetching the manifest when issuance is denied', async () => {
    const issueLimiter = new RecordingRateLimiter(false);
    const bindings = createTestEnv({ issueLimiter });
    const { calls, worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }),
      bindings,
    );

    expect(response.status).toBe(429);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many reaction requests',
      },
    });
    expect(issueLimiter.keys).toHaveLength(1);
    expect(calls).toEqual([]);
  });
});

describe('reaction Worker mutation route', () => {
  it('adds and removes a reaction idempotently', async () => {
    const identity = await issueVisitorToken(
      TEST_SECRET,
      () => FIXED_RANDOM_BYTES,
    );
    const writeLimiter = new RecordingRateLimiter();
    const bindings = createTestEnv({ writeLimiter });
    const { worker } = workerWithManifest();

    for (const [active, expectedCount] of [
      [true, 1],
      [true, 1],
      [false, 0],
      [false, 0],
    ] as const) {
      const response = await dispatch(
        worker,
        jsonRequest('/v1/reactions', {
          targetId: 'side:booster',
          emoji: '👏',
          active,
        }, {
          authorization: `Bearer ${identity.token}`,
          method: 'PUT',
        }),
        bindings,
      );
      expect(response.status).toBe(200);
      expect(headers(response)).toEqual(jsonHeaders);
      expect(await readJson<SetReactionResponse>(response)).toEqual({
        targetId: 'side:booster',
        emoji: '👏',
        active,
        count: expectedCount,
      });
    }
    expect(writeLimiter.keys).toEqual(
      Array(4).fill(`write:${identity.visitorHash}`),
    );
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'Bearer v1.damaged.token'],
  ])('rejects a %s token without touching the write limiter', async (
    _name,
    authorization,
  ) => {
    const writeLimiter = new RecordingRateLimiter();
    const bindings = createTestEnv({ writeLimiter });
    const { worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions', {
        targetId: 'side:booster',
        emoji: '👍',
        active: true,
      }, { authorization, method: 'PUT' }),
      bindings,
    );

    expect(response.status).toBe(401);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'invalid_token',
        message: 'Invalid visitor token',
      },
    });
    expect(writeLimiter.keys).toEqual([]);
  });

  it('rate-limits an opaque visitor hash before manifest membership', async () => {
    const identity = await issueVisitorToken(
      TEST_SECRET,
      () => FIXED_RANDOM_BYTES,
    );
    const writeLimiter = new RecordingRateLimiter(false);
    const bindings = createTestEnv({ writeLimiter });
    const { calls, worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions', {
        targetId: 'work:absent',
        emoji: '👍',
        active: true,
      }, {
        authorization: `Bearer ${identity.token}`,
        method: 'PUT',
      }),
      bindings,
    );

    expect(response.status).toBe(429);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many reaction requests',
      },
    });
    expect(writeLimiter.keys).toEqual([
      `write:${FIXED_VISITOR_HASH}`,
    ]);
    expect(writeLimiter.keys[0]).toMatch(
      /^write:[A-Za-z0-9_-]{43}$/,
    );
    expect(calls).toEqual([]);
  });

  it('returns target_not_found for a valid-shaped absent target', async () => {
    const identity = await issueVisitorToken(
      TEST_SECRET,
      () => FIXED_RANDOM_BYTES,
    );
    const bindings = createTestEnv();
    const { worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions', {
        targetId: 'work:absent',
        emoji: '🎉',
        active: true,
      }, {
        authorization: `Bearer ${identity.token}`,
        method: 'PUT',
      }),
      bindings,
    );

    expect(response.status).toBe(404);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'target_not_found',
        message: 'Reaction target was not found',
      },
    });
  });
});

describe('reaction Worker routing, failures, and privacy', () => {
  it('returns a safe manifest_unavailable response', async () => {
    const manifestFetch = createManifestFetch();
    manifestFetch.fetchImpl = (async () => {
      throw new Error('private upstream hostname and credential');
    }) as typeof fetch;
    const bindings = createTestEnv();
    const { worker } = workerWithManifest(manifestFetch);

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }),
      bindings,
    );

    expect(response.status).toBe(503);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'manifest_unavailable',
        message: 'The reaction target list is unavailable',
      },
    });
  });

  it.each([
    ['missing', null],
    ['disallowed', 'https://evil.example'],
  ])('rejects a %s Origin without ACAO', async (_name, origin) => {
    const bindings = createTestEnv();
    const { calls, worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }, { origin }),
      bindings,
    );

    expect(response.status).toBe(403);
    expect(headers(response)).toEqual(errorHeadersWithoutOrigin);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'forbidden_origin',
        message: 'Origin is not allowed',
      },
    });
    expect(calls).toEqual([]);
  });

  it('returns invalid_request for an unknown route', async () => {
    const bindings = createTestEnv();
    const { worker } = workerWithManifest();
    const response = await dispatch(
      worker,
      jsonRequest('/v1/unknown', {}),
      bindings,
    );

    expect(response.status).toBe(404);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: {
        code: 'invalid_request',
        message: 'Reaction route was not found',
      },
    });
  });

  it.each([
    {
      name: 'wrong bootstrap method',
      request: () => jsonRequest(
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
        { method: 'PUT' },
      ),
      message: 'Reaction request method is invalid',
    },
    {
      name: 'wrong mutation method',
      request: () => jsonRequest(
        '/v1/reactions',
        { targetId: 'side:booster', emoji: '👍', active: true },
        { method: 'POST' },
      ),
      message: 'Reaction request method is invalid',
    },
    {
      name: 'wrong content type',
      request: () => jsonRequest(
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
        { contentType: 'text/plain' },
      ),
      message: 'Expected JSON content',
    },
    {
      name: 'malformed JSON',
      request: () => new Request(
        'https://reactions.example/v1/reactions/bootstrap',
        {
          body: '{',
          headers: {
            'CF-Connecting-IP': '203.0.113.4',
            'Content-Type': 'application/json',
            Origin: ALLOWED_ORIGIN,
          },
          method: 'POST',
        },
      ),
      message: 'Invalid JSON body',
    },
    {
      name: 'body larger than 16 KiB with a false length',
      request: () => new Request(
        'https://reactions.example/v1/reactions/bootstrap',
        {
          body: JSON.stringify({ padding: 'x'.repeat(16_384) }),
          headers: {
            'CF-Connecting-IP': '203.0.113.4',
            'Content-Length': '1',
            'Content-Type': 'application/json',
            Origin: ALLOWED_ORIGIN,
          },
          method: 'POST',
        },
      ),
      message: 'JSON body is too large',
    },
  ])('returns bounded JSON 400 for $name', async ({
    request,
    message,
  }) => {
    const bindings = createTestEnv();
    const { worker } = workerWithManifest();
    const response = await dispatch(worker, request(), bindings);

    expect(response.status).toBe(400);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(await readJson<ApiErrorResponse>(response)).toEqual({
      error: { code: 'invalid_request', message },
    });
  });

  it('redacts private details from an unexpected DB exception', async () => {
    const privateDetail =
      'sqlite path=/private/data token=database-password';
    const db = {
      prepare() {
        throw new Error(privateDetail);
      },
    } as unknown as D1Database;
    const bindings = createTestEnv({ db });
    const { worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }, { authorization: `Bearer ${FIXED_VISITOR_TOKEN}` }),
      bindings,
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(headers(response)).toEqual(jsonHeaders);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'internal_error',
        message: 'The reaction service could not complete the request',
      },
    });
    expect(text).not.toContain(privateDetail);
  });

  it('handles valid preflight without touching any dependency', async () => {
    let fetchCalls = 0;
    let dbCalls = 0;
    let issueCalls = 0;
    let writeCalls = 0;
    let randomCalls = 0;
    const failingLimiter = (counter: 'issue' | 'write') => ({
      async limit(): Promise<{ success: boolean }> {
        if (counter === 'issue') issueCalls += 1;
        else writeCalls += 1;
        throw new Error('must not run');
      },
    });
    const bindings = {
      DB: {
        prepare() {
          dbCalls += 1;
          throw new Error('must not run');
        },
      } as unknown as D1Database,
      ISSUE_RATE_LIMITER: failingLimiter('issue'),
      REACTION_HMAC_SECRET: 'bad',
      REACTION_TARGET_MANIFEST_URL: MANIFEST_URL,
      WRITE_RATE_LIMITER: failingLimiter('write'),
    };
    const worker = createReactionWorker({
      fetchImpl: (async () => {
        fetchCalls += 1;
        throw new Error('must not run');
      }) as typeof fetch,
      randomBytes: () => {
        randomCalls += 1;
        throw new Error('must not run');
      },
    });
    const request = new Request(
      'https://reactions.example/v1/reactions/bootstrap',
      {
        headers: {
          'Access-Control-Request-Headers':
            'Authorization, Content-Type',
          'Access-Control-Request-Method': 'POST',
          Origin: ALLOWED_ORIGIN,
        },
        method: 'OPTIONS',
      },
    );

    const response = await dispatch(worker, request, bindings);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(headers(response)).toEqual({
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'POST, PUT, OPTIONS',
      'access-control-allow-origin': ALLOWED_ORIGIN,
      'cache-control': 'no-store',
      vary: 'Origin',
    });
    expect({
      dbCalls,
      fetchCalls,
      issueCalls,
      randomCalls,
      writeCalls,
    }).toEqual({
      dbCalls: 0,
      fetchCalls: 0,
      issueCalls: 0,
      randomCalls: 0,
      writeCalls: 0,
    });
  });

  it('does not log damaged-token bootstrap secrets or identities', async () => {
    const logSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
    const authorization = 'Bearer v1.damaged.private-token';
    const bindings = createTestEnv();
    const { worker } = workerWithManifest();

    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }, { authorization, ip: '198.51.100.91' }),
      bindings,
    );

    expect(response.status).toBe(200);
    expect(logSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    const recorded = logSpies
      .flatMap((spy) => spy.mock.calls.flat())
      .join(' ');
    for (const privateValue of [
      authorization,
      'v1.damaged.private-token',
      '198.51.100.91',
      FIXED_VISITOR_HASH,
      TEST_SECRET,
    ]) {
      expect(recorded).not.toContain(privateValue);
    }
    vi.restoreAllMocks();
  });

  it('returns a safe server error when CF-Connecting-IP is absent', async () => {
    const bindings = createTestEnv();
    const { calls, worker } = workerWithManifest();
    const response = await dispatch(
      worker,
      jsonRequest('/v1/reactions/bootstrap', {
        targets: ['side:booster'],
      }, { ip: null }),
      bindings,
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'internal_error',
        message: 'The reaction service could not complete the request',
      },
    });
    expect(text).not.toContain('CF-Connecting-IP');
    expect(calls).toEqual([]);
  });
});
