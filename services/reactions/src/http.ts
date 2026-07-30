import type {
  ApiErrorResponse,
  ReactionApiErrorCode,
} from '../../../src/lib/reactions/contracts';

export const MAX_JSON_BYTES = 16_384;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ReactionApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function responseHeaders(origin?: string): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function jsonResponse(
  value: unknown,
  status: number,
  origin?: string,
): Response {
  const headers = responseHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

export function errorResponse(error: ApiError, origin?: string): Response {
  const body: ApiErrorResponse = {
    error: { code: error.code, message: error.message },
  };
  return jsonResponse(body, error.status, origin);
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(400, 'invalid_request', 'Expected JSON content');
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new ApiError(400, 'invalid_request', 'Expected a request body');
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError(400, 'invalid_request', 'JSON body is too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      }).decode(bytes),
    );
  } catch {
    throw new ApiError(400, 'invalid_request', 'Invalid JSON body');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', 'Expected a JSON object');
  }
  return value as Record<string, unknown>;
}
