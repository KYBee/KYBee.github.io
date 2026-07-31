import { describe, expect, it, vi } from 'vitest';
import {
  ReactionHttpError,
  createReactionApi,
} from '../../src/scripts/reactions/api-client';
import {
  VISITOR_TOKEN_STORAGE_KEY,
  createVisitorTokenStore,
} from '../../src/scripts/reactions/token-store';
import { TEST_VISITOR_TOKEN } from './fixtures';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const createFetch = (response: Response) =>
  vi.fn<typeof fetch>().mockResolvedValue(response);

describe('reaction API client', () => {
  it('posts bootstrap JSON once to the normalized endpoint without a token', async () => {
    const response = {
      visitorToken: TEST_VISITOR_TOKEN,
      reactions: {},
    };
    const fetchImpl = createFetch(jsonResponse(response));
    const api = createReactionApi(
      'https://reactions.example:443/',
      fetchImpl,
    );

    await expect(
      api.bootstrap({ targets: ['work:alpha'] }),
    ).resolves.toEqual(response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe(
      'https://reactions.example/v1/reactions/bootstrap',
    );
    expect(init?.method).toBe('POST');
    expect(init?.cache).toBe('no-store');
    expect(init?.keepalive).toBe(false);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      targets: ['work:alpha'],
    });
  });

  it('adds exactly one Bearer header when bootstrap receives a token', async () => {
    const fetchImpl = createFetch(jsonResponse({
      visitorToken: TEST_VISITOR_TOKEN,
      reactions: {},
    }));
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await api.bootstrap({ targets: [] }, TEST_VISITOR_TOKEN);
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe(
      `Bearer ${TEST_VISITOR_TOKEN}`,
    );
  });

  it('puts desired final state once and never sends a toggle field', async () => {
    const response = {
      targetId: 'side:booster' as const,
      emoji: '🔥' as const,
      active: true,
      count: 2,
    };
    const fetchImpl = createFetch(jsonResponse(response));
    const api = createReactionApi(
      'http://127.0.0.1:4321',
      fetchImpl,
    );
    await expect(api.setReaction({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    }, TEST_VISITOR_TOKEN)).resolves.toEqual(response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4321/v1/reactions');
    expect(init?.method).toBe('PUT');
    expect(init?.keepalive).toBe(true);
    expect(JSON.parse(String(init?.body))).toEqual({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    });
    expect(String(init?.body)).not.toContain('toggle');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Bearer ${TEST_VISITOR_TOKEN}`,
    );
  });

  it('preserves status and a parsed API code on non-2xx JSON', async () => {
    const fetchImpl = createFetch(jsonResponse({
      error: { code: 'rate_limited', message: 'Slow down' },
    }, 429));
    const api = createReactionApi('https://reactions.example', fetchImpl);
    const error = await api.bootstrap({ targets: ['work:alpha'] })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ReactionHttpError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses an undefined API code for malformed non-2xx JSON', async () => {
    const fetchImpl = createFetch(
      new Response('not-json', { status: 500 }),
    );
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await expect(
      api.bootstrap({ targets: ['work:alpha'] }),
    ).rejects.toMatchObject({ status: 500, code: undefined });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed success JSON', async () => {
    const fetchImpl = createFetch(
      new Response('not-json', { status: 200 }),
    );
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await expect(
      api.bootstrap({ targets: ['work:alpha'] }),
    ).rejects.toThrow('invalid JSON');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['network failure', new TypeError('offline')],
    ['rate limit', new ReactionHttpError(429, 'rate_limited')],
  ])('does not retry a %s', async (_label, failure) => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await expect(api.setReaction({
      targetId: 'side:booster',
      emoji: '👏',
      active: false,
    }, TEST_VISITOR_TOKEN)).rejects.toBe(failure);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    '',
    ' https://reactions.example',
    'https://reactions.example ',
    'not a URL',
    'ftp://reactions.example',
    'http://reactions.example',
    'https://user:pass@reactions.example',
    'https://reactions.example/api',
    'https://reactions.example/?version=1',
    'https://reactions.example/#fragment',
    'http://localhost.evil.example:4321',
  ])('rejects invalid API base URL %j', (baseUrl) => {
    expect(() =>
      createReactionApi(baseUrl, vi.fn<typeof fetch>()),
    ).toThrow();
  });

  it.each([
    'https://reactions.example',
    'https://reactions.example/',
    'http://localhost:4321',
    'http://127.0.0.1:4321/',
  ])('accepts API origin %s', (baseUrl) => {
    expect(() =>
      createReactionApi(baseUrl, vi.fn<typeof fetch>()),
    ).not.toThrow();
  });
});

describe('visitor token storage', () => {
  it('uses one stable key for reads and writes', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(TEST_VISITOR_TOKEN),
      setItem: vi.fn(),
    };
    const store = createVisitorTokenStore(storage);
    expect(store.get()).toBe(TEST_VISITOR_TOKEN);
    store.set(TEST_VISITOR_TOKEN);
    expect(storage.getItem).toHaveBeenCalledWith(
      VISITOR_TOKEN_STORAGE_KEY,
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      VISITOR_TOKEN_STORAGE_KEY,
      TEST_VISITOR_TOKEN,
    );
  });

  it('catches unavailable storage reads and writes', () => {
    const storage = {
      getItem() {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem() {
        throw new DOMException('blocked', 'QuotaExceededError');
      },
    };
    const store = createVisitorTokenStore(storage);
    expect(store.get()).toBeUndefined();
    expect(() => store.set(TEST_VISITOR_TOKEN)).not.toThrow();
  });

  it.each(['', null])('does not expose or persist empty token %j', (value) => {
    const storage = {
      getItem: vi.fn().mockReturnValue(value),
      setItem: vi.fn(),
    };
    const store = createVisitorTokenStore(storage);
    expect(store.get()).toBeUndefined();
    store.set('');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
