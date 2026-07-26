import { ApiError } from './http';

const TOKEN_VERSION = 'v1';
const TOKEN_LABEL = 'visitor-token:v1\0';
const ISSUE_LABEL = 'issue-ip\0';
const TOKEN_BYTES = 32;
const BASE64URL_SHA256_LENGTH = 43;
const ENCODING_CHUNK_BYTES = 0x8000;

const textEncoder = new TextEncoder();

export interface VisitorIdentity {
  token: string;
  visitorHash: string;
}

function configurationError(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'The reaction service is not configured',
  );
}

function invalidTokenError(): ApiError {
  return new ApiError(
    401,
    'invalid_token',
    'Invalid visitor token',
  );
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += ENCODING_CHUNK_BYTES
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + ENCODING_CHUNK_BYTES),
    );
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decodeCanonicalBase64Url(value: string): Uint8Array {
  if (
    value.length !== BASE64URL_SHA256_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalidTokenError();
  }

  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw invalidTokenError();
  }

  const bytes = Uint8Array.from(binary, (character) => (
    character.charCodeAt(0)
  ));
  if (
    bytes.byteLength !== TOKEN_BYTES
    || encodeBase64Url(bytes) !== value
  ) {
    throw invalidTokenError();
  }
  return bytes;
}

function encodeLabeledValue(label: string, value: string): Uint8Array {
  return textEncoder.encode(`${label}${value}`);
}

async function importHmacKey(
  secret: string,
  usage: 'sign' | 'verify',
): Promise<CryptoKey> {
  const secretBytes = textEncoder.encode(secret);
  if (secretBytes.byteLength < TOKEN_BYTES) {
    throw configurationError();
  }
  return crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

async function hashVisitor(visitorBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', visitorBytes);
  return encodeBase64Url(new Uint8Array(digest));
}

export async function issueVisitorToken(
  secret: string,
  randomSource: () => Uint8Array = () => (
    crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  ),
): Promise<VisitorIdentity> {
  const key = await importHmacKey(secret, 'sign');
  const visitorBytes = randomSource();
  if (
    !(visitorBytes instanceof Uint8Array)
    || visitorBytes.byteLength !== TOKEN_BYTES
  ) {
    throw configurationError();
  }

  const payload = encodeBase64Url(visitorBytes);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encodeLabeledValue(TOKEN_LABEL, payload),
  );
  return {
    token: `${
      TOKEN_VERSION
    }.${payload}.${encodeBase64Url(new Uint8Array(signature))}`,
    visitorHash: await hashVisitor(visitorBytes),
  };
}

export async function verifyVisitorToken(
  secret: string,
  token: string,
): Promise<{ visitorHash: string }> {
  const segments = token.split('.');
  if (
    segments.length !== 3
    || segments[0] !== TOKEN_VERSION
    || segments[1].length !== BASE64URL_SHA256_LENGTH
    || segments[2].length !== BASE64URL_SHA256_LENGTH
  ) {
    throw invalidTokenError();
  }

  const payload = segments[1];
  const visitorBytes = decodeCanonicalBase64Url(payload);
  const signatureBytes = decodeCanonicalBase64Url(segments[2]);
  const key = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encodeLabeledValue(TOKEN_LABEL, payload),
  );
  if (!valid) {
    throw invalidTokenError();
  }
  return { visitorHash: await hashVisitor(visitorBytes) };
}

export async function createIssueRateLimitKey(
  secret: string,
  ip: string,
): Promise<string> {
  if (!ip) {
    throw configurationError();
  }
  const key = await importHmacKey(secret, 'sign');
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encodeLabeledValue(ISSUE_LABEL, ip),
  );
  return `issue:${encodeBase64Url(new Uint8Array(signature))}`;
}
