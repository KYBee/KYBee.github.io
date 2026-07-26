import { describe, expect, it } from 'vitest';
import {
  ApiError,
  errorResponse,
  jsonResponse,
  MAX_JSON_BYTES,
  readJsonObject,
} from '../src/http';
import {
  parseBearerToken,
  parseBootstrapRequest,
  parseSetReactionRequest,
} from '../src/validation';

function requestWithBody(
  body: BodyInit,
  contentType?: string,
): Request {
  const headers = new Headers();
  if (contentType !== undefined) {
    headers.set('Content-Type', contentType);
  }
  return new Request('https://api.example/v1/reactions', {
    method: 'POST',
    headers,
    body,
  });
}

function expectInvalidBootstrap(body: unknown): void {
  expect(() => parseBootstrapRequest(
    body as Record<string, unknown>,
  )).toThrowError(expect.objectContaining({
    code: 'invalid_request',
    status: 400,
  }));
}

function expectInvalidMutation(body: unknown): void {
  expect(() => parseSetReactionRequest(
    body as Record<string, unknown>,
  )).toThrowError(expect.objectContaining({
    code: 'invalid_request',
    status: 400,
  }));
}

describe('HTTP response helpers', () => {
  it('returns JSON with exact shared headers and an origin', async () => {
    const response = jsonResponse(
      { accepted: true },
      202,
      'https://kybee.github.io',
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(response.headers.get('Content-Type')).toBe(
      'application/json; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://kybee.github.io',
    );
  });

  it('omits allow-origin when no origin is supplied', () => {
    const response = jsonResponse({ accepted: false }, 400);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('serializes API errors into the public JSON envelope', async () => {
    const response = errorResponse(
      new ApiError(401, 'invalid_token', 'Invalid visitor token'),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_token',
        message: 'Invalid visitor token',
      },
    });
    expect(response.headers.get('Content-Type')).toBe(
      'application/json; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('bootstrap validation', () => {
  it('deduplicates valid targets in first-seen order', () => {
    expect(parseBootstrapRequest({
      targets: ['work:a', 'side:b', 'work:a'],
    })).toEqual({ targets: ['work:a', 'side:b'] });
  });

  it.each([
    null,
    [],
    {},
    { targets: [] },
    { targets: ['bad'] },
    { targets: [1] },
    { targets: ['work:a'], extra: true },
    {
      targets: Array.from(
        { length: 101 },
        (_, index) => `work:x-${index}`,
      ),
    },
  ])('rejects invalid bootstrap body %#', (body) => {
    expectInvalidBootstrap(body);
  });
});

describe('set-reaction validation', () => {
  it('accepts desired-state writes', () => {
    expect(parseSetReactionRequest({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    })).toEqual({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    });
  });

  it.each([
    {
      targetId: 'not-a-target',
      emoji: '🔥',
      active: true,
    },
    {
      targetId: 'side:booster',
      emoji: '💯',
      active: true,
    },
    {
      targetId: 'side:booster',
      emoji: '🔥',
      active: 'true',
    },
    {
      targetId: 'side:booster',
      emoji: '🔥',
    },
    {
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
      extra: 1,
    },
  ])('rejects invalid mutation body %#', (body) => {
    expectInvalidMutation(body);
  });
});

describe('Bearer parsing', () => {
  it('accepts exactly one case-sensitive Bearer token', () => {
    expect(parseBearerToken(
      'Bearer v1.payload.signature',
    )).toBe('v1.payload.signature');
  });

  it.each([
    null,
    '',
    'Basic abc',
    'bearer abc',
    'Bearer',
    'Bearer one two',
    'Bearer  two',
  ])('rejects authorization value %s', (value) => {
    expect(() => parseBearerToken(value)).toThrowError(
      expect.objectContaining({
        code: 'invalid_token',
        status: 401,
      }),
    );
  });
});

describe('bounded JSON reader', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
  ])('accepts content type %s', async (contentType) => {
    await expect(readJsonObject(requestWithBody(
      '{"targetId":"work:a"}',
      contentType,
    ))).resolves.toEqual({ targetId: 'work:a' });
  });

  it.each([
    undefined,
    'text/plain',
    'application/jsonp',
  ])('rejects content type %s', async (contentType) => {
    await expect(readJsonObject(requestWithBody(
      '{}',
      contentType,
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('rejects malformed UTF-8', async () => {
    const malformed = Uint8Array.from([
      0x7b, 0x22, 0x78, 0x22, 0x3a,
      0x22, 0xc3, 0x28, 0x22, 0x7d,
    ]);
    await expect(readJsonObject(requestWithBody(
      malformed,
      'application/json',
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('rejects malformed JSON', async () => {
    await expect(readJsonObject(requestWithBody(
      '{"targetId":',
      'application/json',
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it.each([
    '[]',
    'null',
    'true',
    '"text"',
    '1',
  ])('rejects non-object JSON %s', async (body) => {
    await expect(readJsonObject(requestWithBody(
      body,
      'application/json',
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('accepts exactly 16,384 UTF-8 bytes', async () => {
    const body = JSON.stringify({
      value: 'x'.repeat(MAX_JSON_BYTES - 12),
    });
    expect(new TextEncoder().encode(body).byteLength).toBe(
      MAX_JSON_BYTES,
    );
    const parsed = await readJsonObject(requestWithBody(
      body,
      'application/json',
    ));
    expect((parsed.value as string).length).toBe(
      MAX_JSON_BYTES - 12,
    );
  });

  it('cancels and rejects at 16,385 bytes despite Content-Length', async () => {
    let canceled = false;
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(new Uint8Array(MAX_JSON_BYTES));
          return;
        }
        controller.enqueue(Uint8Array.of(0x20));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request(
      'https://api.example/v1/reactions',
      {
        method: 'POST',
        headers: {
          'Content-Length': '1',
          'Content-Type': 'application/json',
        },
        body: stream,
      },
    );

    await expect(readJsonObject(request)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
    expect(canceled).toBe(true);
  });

  it('keeps the size-limit error when stream cancellation rejects', async () => {
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(new Uint8Array(MAX_JSON_BYTES));
          return;
        }
        controller.enqueue(Uint8Array.of(0x20));
      },
      cancel() {
        return Promise.reject(new Error('cancel failed'));
      },
    });
    const request = new Request(
      'https://api.example/v1/reactions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stream,
      },
    );

    await expect(readJsonObject(request)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });
});
