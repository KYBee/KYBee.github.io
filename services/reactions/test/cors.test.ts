import { describe, expect, it } from 'vitest';
import {
  getAllowedOrigin,
  handlePreflight,
} from '../src/cors';

const allowedOrigins = [
  'https://kybee.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

function preflight(options: {
  headers?: string;
  method?: string;
  origin?: string;
  path?: string;
} = {}): Request {
  const headers = new Headers({
    Origin: options.origin ?? 'https://kybee.github.io',
  });
  if (options.method !== undefined) {
    headers.set(
      'Access-Control-Request-Method',
      options.method,
    );
  }
  if (options.headers !== undefined) {
    headers.set(
      'Access-Control-Request-Headers',
      options.headers,
    );
  }
  return new Request(
    `https://api.example${
      options.path ?? '/v1/reactions/bootstrap'
    }`,
    { method: 'OPTIONS', headers },
  );
}

describe('CORS origins', () => {
  it.each(allowedOrigins)('accepts exact origin %s', (origin) => {
    const request = new Request(
      'https://api.example/v1/reactions/bootstrap',
      { headers: { Origin: origin } },
    );
    expect(getAllowedOrigin(request)).toBe(origin);
  });

  it.each([
    undefined,
    'https://evil.example',
    'https://kybee.github.io.evil.example',
    'https://kybee.github.io/',
    'HTTP://localhost:4321',
  ])('rejects origin %s', (origin) => {
    const headers = new Headers();
    if (origin !== undefined) {
      headers.set('Origin', origin);
    }
    const request = new Request(
      'https://api.example/v1/reactions/bootstrap',
      { headers },
    );
    expect(() => getAllowedOrigin(request)).toThrowError(
      expect.objectContaining({
        code: 'forbidden_origin',
        status: 403,
      }),
    );
  });
});

describe('CORS preflight', () => {
  it('returns a bodyless exact bootstrap preflight', async () => {
    const response = handlePreflight(preflight({
      method: 'POST',
      headers: 'content-type, authorization',
    }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get(
      'Access-Control-Allow-Origin',
    )).toBe('https://kybee.github.io');
    expect(response.headers.get(
      'Access-Control-Allow-Methods',
    )).toBe('POST, PUT, OPTIONS');
    expect(response.headers.get(
      'Access-Control-Allow-Headers',
    )).toBe('Authorization, Content-Type');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Cache-Control')).toBe(
      'no-store',
    );
  });

  it('accepts the exact mutation preflight', () => {
    const response = handlePreflight(preflight({
      path: '/v1/reactions',
      method: 'PUT',
      headers: 'Authorization, Content-Type',
    }));
    expect(response.status).toBe(204);
  });

  it.each([
    {
      name: 'PUT on bootstrap',
      path: '/v1/reactions/bootstrap',
      method: 'PUT',
      headers: 'content-type',
    },
    {
      name: 'POST on mutation',
      path: '/v1/reactions',
      method: 'POST',
      headers: 'content-type',
    },
    {
      name: 'an unknown path',
      path: '/v1/unknown',
      method: 'POST',
      headers: 'content-type',
    },
    {
      name: 'a missing requested method',
      path: '/v1/reactions/bootstrap',
      method: undefined,
      headers: 'content-type',
    },
    {
      name: 'a custom header',
      path: '/v1/reactions/bootstrap',
      method: 'POST',
      headers: 'content-type, x-custom-header',
    },
    {
      name: 'an empty header token',
      path: '/v1/reactions/bootstrap',
      method: 'POST',
      headers: 'content-type,,authorization',
    },
    {
      name: 'a missing requested-header list',
      path: '/v1/reactions/bootstrap',
      method: 'POST',
      headers: undefined,
    },
  ])('rejects $name', (testCase) => {
    expect(() => handlePreflight(preflight(testCase)))
      .toThrowError(expect.objectContaining({
        code: 'invalid_request',
        status: 400,
      }));
  });
});
