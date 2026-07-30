import { ApiError, responseHeaders } from './http';

const ALLOWED_ORIGINS = new Set([
  'https://kybee.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);
const ALLOWED_REQUEST_HEADERS = new Set([
  'authorization',
  'content-type',
]);
const PATH_METHODS = new Map([
  ['/v1/reactions/bootstrap', 'POST'],
  ['/v1/reactions', 'PUT'],
]);

export function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    throw new ApiError(403, 'forbidden_origin', 'Origin is not allowed');
  }
  return origin;
}

export function handlePreflight(request: Request): Response {
  const origin = getAllowedOrigin(request);
  const expectedMethod = PATH_METHODS.get(new URL(request.url).pathname);
  const requestedMethod = request.headers.get(
    'Access-Control-Request-Method',
  );
  if (!expectedMethod || requestedMethod !== expectedMethod) {
    throw new ApiError(400, 'invalid_request', 'Invalid preflight method');
  }

  const requestedHeaders =
    request.headers.get('Access-Control-Request-Headers') ?? '';
  for (const rawHeader of requestedHeaders.split(',')) {
    const header = rawHeader.trim().toLowerCase();
    if (!header || !ALLOWED_REQUEST_HEADERS.has(header)) {
      throw new ApiError(400, 'invalid_request', 'Invalid preflight header');
    }
  }

  const headers = responseHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );
  return new Response(null, { status: 204, headers });
}
