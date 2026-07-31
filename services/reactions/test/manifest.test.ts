import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactionTargetId } from '../../../src/lib/reactions/contracts';
import { createManifestVerifier } from '../src/manifest';

const manifestUrl = 'https://kybee.github.io/reaction-targets.json';
const validTargets: ReactionTargetId[] = [
  'side:booster',
  'work:samsung-metrics',
];
const manifestUnavailable = {
  code: 'manifest_unavailable',
  message: 'The reaction target list is unavailable',
  status: 503,
};
const targetNotFound = {
  code: 'target_not_found',
  message: 'Reaction target was not found',
  status: 404,
};

afterEach(() => {
  vi.useRealTimers();
});

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function injectedFetch(
  implementation: (
    input: FetchInput,
    init?: FetchInit,
  ) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

function manifestResponse(
  targets: readonly string[] = validTargets,
): Response {
  return new Response(JSON.stringify({ version: 1, targets }));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('reaction target manifest', () => {
  it('isolates cached membership from source mutation and fetches once', async () => {
    const sourceTargets = [...validTargets];
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return manifestResponse(sourceTargets);
      }),
    });

    await verifier.assertKnown(['side:booster']);
    sourceTargets.splice(0, sourceTargets.length, 'work:replacement');
    await verifier.assertKnown(['side:booster']);

    expect(fetchCalls).toBe(1);
  });

  it('uses exact fail-closed fetch options', async () => {
    const calls: Array<{ input: FetchInput; init?: FetchInit }> = [];
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async (input, init) => {
        calls.push({ input, init });
        throw new Error('network unavailable');
      }),
    });

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(manifestUnavailable);
    expect(calls).toEqual([{
      input: new URL(manifestUrl),
      init: {
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      },
    }]);
    expect(calls[0].init?.signal?.aborted).toBe(false);
  });

  it('cancels a chunked body after 16,384 bytes and rejects overflow', async () => {
    let bodyCanceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16_384));
        controller.enqueue(Uint8Array.of(0));
        setTimeout(() => {
          try {
            controller.close();
          } catch {
            // The bounded reader canceled the stream before this fallback.
          }
        }, 0);
      },
      cancel() {
        bodyCanceled = true;
      },
    });
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => new Response(body, {
        headers: { 'Content-Length': '1' },
      })),
    });

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(manifestUnavailable);
    expect(bodyCanceled).toBe(true);
  });

  it('aborts a fetch that is still pending at 5,000 ms', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async (_input, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
    });

    const verification = verifier.assertKnown(['side:booster']);
    const rejection = expect(verification).rejects.toMatchObject(
      manifestUnavailable,
    );
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    await rejection;
  });

  it('times out and cancels a body that stops after a partial chunk', async () => {
    vi.useFakeTimers();
    let bodyCanceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"version":1,'));
      },
      cancel() {
        bodyCanceled = true;
      },
    });
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => new Response(body)),
    });

    const verification = verifier.assertKnown(['side:booster']);
    const rejection = expect(verification).rejects.toMatchObject(
      manifestUnavailable,
    );
    await vi.advanceTimersByTimeAsync(4_999);
    expect(bodyCanceled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(bodyCanceled).toBe(true);
    await rejection;
  });

  it('reuses the cache through 299,999 ms and refreshes at 300,000 ms', async () => {
    let currentTime = 0;
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      now: () => currentTime,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return manifestResponse();
      }),
    });

    await verifier.assertKnown(['side:booster']);
    currentTime = 299_999;
    await verifier.assertKnown(['side:booster']);
    expect(fetchCalls).toBe(1);

    currentTime = 300_000;
    await verifier.assertKnown(['side:booster']);
    expect(fetchCalls).toBe(2);
  });

  it('shares one in-flight refresh across concurrent callers', async () => {
    const pendingResponse = deferred<Response>();
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return pendingResponse.promise;
      }),
    });

    const first = verifier.assertKnown(['side:booster']);
    const second = verifier.assertKnown(['work:samsung-metrics']);
    expect(fetchCalls).toBe(1);

    pendingResponse.resolve(manifestResponse());
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });

  it('does not serve stale targets when an expired refresh fails', async () => {
    let currentTime = 0;
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      now: () => currentTime,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return fetchCalls === 1
          ? manifestResponse()
          : new Response('upstream error', { status: 503 });
      }),
    });

    await verifier.assertKnown(['side:booster']);
    currentTime = 300_000;

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(manifestUnavailable);
    expect(fetchCalls).toBe(2);
  });

  it('retries after a failed first fetch', async () => {
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return fetchCalls === 1
          ? new Response('upstream error', { status: 500 })
          : manifestResponse();
      }),
    });

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(manifestUnavailable);
    await expect(
      verifier.assertKnown(['side:booster']),
    ).resolves.toBeUndefined();
    expect(fetchCalls).toBe(2);
  });

  it.each([
    'http://kybee.github.io/reaction-targets.json',
    'not a URL',
  ])('rejects unsafe manifest URL %s without fetching', async (unsafeUrl) => {
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl: unsafeUrl,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return manifestResponse();
      }),
    });

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(manifestUnavailable);
    expect(fetchCalls).toBe(0);
  });

  it.each([
    {
      name: 'non-2xx response',
      response: () => new Response('upstream error', { status: 500 }),
    },
    {
      name: 'malformed JSON',
      response: () => new Response('{'),
    },
    {
      name: 'null body',
      response: () => new Response('null'),
    },
    {
      name: 'primitive body',
      response: () => new Response('42'),
    },
    {
      name: 'missing version',
      response: () => new Response(JSON.stringify({ targets: [] })),
    },
    {
      name: 'missing targets',
      response: () => new Response(JSON.stringify({ version: 1 })),
    },
    {
      name: 'wrong version',
      response: () => new Response(JSON.stringify({
        version: 2,
        targets: [],
      })),
    },
    {
      name: 'extra key',
      response: () => new Response(JSON.stringify({
        version: 1,
        targets: [],
        extra: true,
      })),
    },
    {
      name: 'non-array targets',
      response: () => new Response(JSON.stringify({
        version: 1,
        targets: {},
      })),
    },
    {
      name: 'non-string target',
      response: () => new Response(JSON.stringify({
        version: 1,
        targets: [1],
      })),
    },
    {
      name: 'invalid target ID',
      response: () => new Response(JSON.stringify({
        version: 1,
        targets: ['project:booster'],
      })),
    },
    {
      name: 'duplicate targets',
      response: () => manifestResponse([
        'side:booster',
        'side:booster',
      ]),
    },
    {
      name: 'unsorted targets',
      response: () => manifestResponse([
        'work:samsung-metrics',
        'side:booster',
      ]),
    },
    {
      name: '101 targets',
      response: () => manifestResponse(Array.from(
        { length: 101 },
        (_, index) => `work:item-${String(index).padStart(3, '0')}`,
      )),
    },
  ])('maps $name to manifest_unavailable', async ({ response }) => {
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => response()),
    });

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(manifestUnavailable);
  });

  it('returns target_not_found for a valid manifest without the target', async () => {
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: injectedFetch(async () => manifestResponse([])),
    });

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(targetNotFound);
  });

  it('accepts a deleted target until expiry and rejects it after refresh', async () => {
    let currentTime = 0;
    let fetchCalls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      now: () => currentTime,
      fetchImpl: injectedFetch(async () => {
        fetchCalls += 1;
        return fetchCalls === 1
          ? manifestResponse()
          : manifestResponse(['work:samsung-metrics']);
      }),
    });

    await verifier.assertKnown(['side:booster']);
    currentTime = 299_999;
    await verifier.assertKnown(['side:booster']);
    currentTime = 300_000;

    await expect(
      verifier.assertKnown(['side:booster']),
    ).rejects.toMatchObject(targetNotFound);
    expect(fetchCalls).toBe(2);
  });
});
