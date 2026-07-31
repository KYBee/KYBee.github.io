import type {
  BootstrapRequest,
  BootstrapResponse,
  ReactionApiErrorCode,
  SetReactionRequest,
  SetReactionResponse,
} from '../../lib/reactions/contracts';

export interface ReactionApi {
  bootstrap(
    request: BootstrapRequest,
    token?: string,
  ): Promise<BootstrapResponse>;
  setReaction(
    request: SetReactionRequest,
    token: string,
  ): Promise<SetReactionResponse>;
}

export class ReactionHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: ReactionApiErrorCode,
  ) {
    super(`Reaction API request failed with ${status}`);
  }
}

function normalizeBaseUrl(value: string): string {
  if (value.trim() !== value || value.length === 0) {
    throw new TypeError('Reaction API URL is invalid');
  }
  const url = new URL(value);
  const localHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new TypeError('Reaction API URL is invalid');
  }
  return url.origin;
}

function readApiErrorCode(value: unknown): ReactionApiErrorCode | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return undefined;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string'
    ? (code as ReactionApiErrorCode)
    : undefined;
}

export function createReactionApi(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): ReactionApi {
  const origin = normalizeBaseUrl(baseUrl);

  async function requestJson<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown,
    token?: string,
  ): Promise<T> {
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetchImpl(`${origin}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      if (!response.ok) {
        throw new ReactionHttpError(response.status);
      }
      throw new TypeError('Reaction API returned invalid JSON');
    }
    if (!response.ok) {
      throw new ReactionHttpError(
        response.status,
        readApiErrorCode(value),
      );
    }
    return value as T;
  }

  return {
    bootstrap(request, token) {
      return requestJson<BootstrapResponse>(
        '/v1/reactions/bootstrap',
        'POST',
        request,
        token,
      );
    },
    setReaction(request, token) {
      return requestJson<SetReactionResponse>(
        '/v1/reactions',
        'PUT',
        request,
        token,
      );
    },
  };
}
