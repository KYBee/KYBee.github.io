import {
  MAX_BOOTSTRAP_TARGETS,
  type ReactionTargetId,
} from '../../../src/lib/reactions/contracts';
import { assertReactionTargetId } from '../../../src/lib/reactions/targets';
import { ApiError } from './http';

const MANIFEST_TTL_MS = 300_000;
const MAX_MANIFEST_BYTES = 16_384;
const MANIFEST_TIMEOUT_MS = 5_000;

interface CachedManifest {
  expiresAt: number;
  targets: ReadonlySet<ReactionTargetId>;
}

export interface ManifestVerifier {
  assertKnown(targets: readonly ReactionTargetId[]): Promise<void>;
}

function manifestUnavailable(): ApiError {
  return new ApiError(
    503,
    'manifest_unavailable',
    'The reaction target list is unavailable',
  );
}

function waitForAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason);
    };

    signal.addEventListener('abort', onAbort);
    if (signal.aborted) {
      onAbort();
      return;
    }

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): void {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best-effort while the refresh still fails closed.
  }
}

async function readManifestJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) {
    throw new TypeError('Manifest response body is missing');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await waitForAbort(reader.read(), signal);
      } catch (error) {
        if (signal.aborted) cancelReader(reader);
        throw error;
      }

      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_MANIFEST_BYTES) {
        cancelReader(reader);
        throw new TypeError('Manifest response body is too large');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const json = new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: false,
  }).decode(bytes);
  return JSON.parse(json) as unknown;
}

function parseManifest(value: unknown): ReadonlySet<ReactionTargetId> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid reaction target manifest');
  }

  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !Object.hasOwn(value, 'version')
    || !Object.hasOwn(value, 'targets')
  ) {
    throw new TypeError('Invalid reaction target manifest');
  }

  const manifest = value as Record<string, unknown>;
  if (
    manifest.version !== 1
    || !Array.isArray(manifest.targets)
    || manifest.targets.length > MAX_BOOTSTRAP_TARGETS
  ) {
    throw new TypeError('Invalid reaction target manifest');
  }

  const targets = new Set<ReactionTargetId>();
  let previous: string | undefined;

  for (const target of manifest.targets) {
    if (typeof target !== 'string') {
      throw new TypeError('Invalid reaction target manifest');
    }

    assertReactionTargetId(target);
    if (previous !== undefined && previous >= target) {
      throw new TypeError('Invalid reaction target manifest');
    }

    targets.add(target);
    previous = target;
  }

  return targets;
}

export function createManifestVerifier({
  manifestUrl,
  fetchImpl = fetch,
  now = Date.now,
}: {
  manifestUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): ManifestVerifier {
  let cache: CachedManifest | undefined;
  let refreshPromise: Promise<CachedManifest> | undefined;

  async function refresh(): Promise<CachedManifest> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      MANIFEST_TIMEOUT_MS,
    );

    try {
      const url = new URL(manifestUrl);
      if (url.protocol !== 'https:') {
        throw new TypeError('Manifest URL must use HTTPS');
      }

      const requestInit: RequestInit & {
        cache: 'no-store';
        signal: AbortSignal;
      } = {
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: abortController.signal,
      };
      const response = await waitForAbort(
        fetchImpl(url, requestInit),
        abortController.signal,
      );
      if (!response.ok) {
        throw new TypeError('Manifest request failed');
      }

      const targets = parseManifest(await readManifestJson(
        response,
        abortController.signal,
      ));
      const refreshed = {
        expiresAt: now() + MANIFEST_TTL_MS,
        targets,
      };
      cache = refreshed;
      return refreshed;
    } catch {
      throw manifestUnavailable();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function current(): Promise<CachedManifest> {
    if (cache && now() < cache.expiresAt) {
      return Promise.resolve(cache);
    }

    if (!refreshPromise) {
      refreshPromise = refresh().finally(() => {
        refreshPromise = undefined;
      });
    }
    return refreshPromise;
  }

  return {
    async assertKnown(targets): Promise<void> {
      const manifest = await current();
      for (const target of targets) {
        if (!manifest.targets.has(target)) {
          throw new ApiError(
            404,
            'target_not_found',
            'Reaction target was not found',
          );
        }
      }
    },
  };
}
