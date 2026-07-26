import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createIssueRateLimitKey,
  issueVisitorToken,
  verifyVisitorToken,
} from '../src/token';

const secret = '0123456789abcdef0123456789abcdef';
const otherSecret = 'abcdef0123456789abcdef0123456789';
const visitorBytes = Uint8Array.from(
  { length: 32 },
  (_, index) => index,
);
const invalidTokenError = {
  code: 'invalid_token',
  message: 'Invalid visitor token',
  status: 401,
};
const configurationError = {
  code: 'internal_error',
  message: 'The reaction service is not configured',
  status: 500,
};

function changedFirstCharacter(value: string): string {
  const first = value.charAt(0) === 'A' ? 'B' : 'A';
  return `${first}${value.slice(1)}`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('visitor tokens', () => {
  it('round-trips a canonical token and stable visitor hash', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );

    expect(issued.token).toMatch(
      /^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(issued.token).not.toContain('=');
    const verified = await verifyVisitorToken(secret, issued.token);
    expect(verified.visitorHash).toBe(issued.visitorHash);
    expect(verified.visitorHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('matches the raw-byte SHA-256 known-answer visitor hash', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );

    expect(issued.visitorHash).toBe(
      'Yw3NKWbEM2aRElRIu7JbT_QSpJxzLbLIq8G4WBvXEN0',
    );
  });

  it.each([
    `v2.${'A'.repeat(43)}.${'A'.repeat(43)}`,
    `v1.short.${'A'.repeat(43)}`,
    `v1.${'A'.repeat(43)}.short`,
    `v1.${'A'.repeat(43)}.${'A'.repeat(43)}.extra`,
    `v1.${'A'.repeat(42)}*.${'A'.repeat(43)}`,
    `v1.${'A'.repeat(43)}.${'A'.repeat(42)}`,
    `v1.${'A'.repeat(43)}=.${'A'.repeat(43)}`,
  ])('rejects malformed token %s', async (token) => {
    await expect(
      verifyVisitorToken(secret, token),
    ).rejects.toMatchObject(invalidTokenError);
  });

  it.each(['payload', 'signature'] as const)(
    'rejects %s tampering',
    async (part) => {
      const issued = await issueVisitorToken(
        secret,
        () => visitorBytes,
      );
      const segments = issued.token.split('.');
      const index = part === 'payload' ? 1 : 2;
      segments[index] = changedFirstCharacter(segments[index]);

      await expect(
        verifyVisitorToken(secret, segments.join('.')),
      ).rejects.toMatchObject(invalidTokenError);
    },
  );

  it('rejects a signature made with another secret', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );

    await expect(
      verifyVisitorToken(otherSecret, issued.token),
    ).rejects.toMatchObject(invalidTokenError);
  });

  it('derives different hashes for different visitor IDs', async () => {
    const first = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );
    const second = await issueVisitorToken(
      secret,
      () => Uint8Array.from(
        { length: 32 },
        (_, index) => index + 1,
      ),
    );

    expect(first.visitorHash).not.toBe(second.visitorHash);
  });

  it('uses Worker WebCrypto verify with the HMAC call shape', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );
    const verifySpy = vi.spyOn(crypto.subtle, 'verify');

    await verifyVisitorToken(secret, issued.token);

    expect(verifySpy).toHaveBeenCalledOnce();
    expect(verifySpy).toHaveBeenCalledWith(
      'HMAC',
      expect.anything(),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
    );
    const [, , signature, data] = verifySpy.mock.calls[0];
    expect(signature).toHaveLength(32);
    expect(new TextDecoder().decode(data as ArrayBufferView)).toBe(
      `visitor-token:v1\0${issued.token.split('.')[1]}`,
    );
  });
});

describe('HMAC configuration', () => {
  it.each([
    'short-secret',
    '가나다라마바사아자차',
  ])('rejects a UTF-8 secret shorter than 32 bytes on issuance', async (
    shortSecret,
  ) => {
    expect(new TextEncoder().encode(shortSecret).byteLength).toBeLessThan(32);
    await expect(issueVisitorToken(
      shortSecret,
      () => visitorBytes,
    )).rejects.toMatchObject(configurationError);
  });

  it('rejects a short secret while verifying a token', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );

    await expect(
      verifyVisitorToken('short-secret', issued.token),
    ).rejects.toMatchObject(configurationError);
  });

  it('rejects a short secret while deriving an issue key', async () => {
    await expect(createIssueRateLimitKey(
      'short-secret',
      '203.0.113.4',
    )).rejects.toMatchObject(configurationError);
  });

  it.each([31, 33])(
    'rejects a random source returning %i bytes',
    async (length) => {
      await expect(issueVisitorToken(
        secret,
        () => new Uint8Array(length),
      )).rejects.toMatchObject(configurationError);
    },
  );
});

describe('token-issue rate-limit keys', () => {
  it('derives an opaque issue key without returning the raw IP', async () => {
    const key = await createIssueRateLimitKey(secret, '203.0.113.4');

    expect(key).toMatch(/^issue:[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain('203.0.113.4');
  });

  it('matches the issue-domain HMAC known-answer key', async () => {
    const key = await createIssueRateLimitKey(secret, '203.0.113.4');

    expect(key).toBe(
      'issue:IsdICMbLspSt6A3lrx8zd_oHJyybh_Zrv_Jzp43YbcM',
    );
  });

  it('derives different keys for different IPs', async () => {
    const first = await createIssueRateLimitKey(
      secret,
      '203.0.113.4',
    );
    const second = await createIssueRateLimitKey(
      secret,
      '203.0.113.5',
    );

    expect(first).not.toBe(second);
  });

  it('rejects a missing IP as a server error', async () => {
    await expect(
      createIssueRateLimitKey(secret, ''),
    ).rejects.toMatchObject(configurationError);
  });
});
