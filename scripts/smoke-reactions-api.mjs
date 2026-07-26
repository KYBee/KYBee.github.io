import { pathToFileURL } from 'node:url';

import { validateReactionsApiUrl } from './validate-reactions-env.mjs';

export const APPROVED_REACTION_EMOJIS = ['👍', '🔥', '🎉', '👏'];
export const REACTION_TARGET_PATTERN =
  /^(work|side):[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_REACTION_TARGET_LENGTH = 96;
export const MAX_REACTION_TARGETS = 100;
export const MANIFEST_ATTEMPTS = 18;
export const MANIFEST_RETRY_DELAY_MS = 5_000;
export const SMOKE_DEADLINE_MS = 90_000;

const DEFAULT_MANIFEST_URL =
  'https://kybee.github.io/reaction-targets.json';
const DEFAULT_ORIGIN = 'https://kybee.github.io';
const MAX_JSON_BYTES = 32_768;
const TOKEN_PATTERN =
  /^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;

function hasExactKeys(value, expected) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
  );
}

function assertManifestUrl(value) {
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new TypeError('Reaction manifest URL must be absolute');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Reaction manifest URL must be absolute');
  }
  if (
    url.protocol !== 'https:'
    || !url.hostname
    || url.username
    || url.password
    || url.hash
  ) {
    throw new TypeError(
      'Reaction manifest URL must be a credential-free HTTPS URL',
    );
  }
  return url.href;
}

function assertOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:'
    || !url.hostname
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new TypeError('Reaction smoke origin must be an HTTPS origin');
  }
  return url.origin;
}

function remainingMilliseconds(deadline, now) {
  const remaining = Math.ceil(deadline - now());
  if (remaining <= 0) {
    throw new Error('Reaction API smoke timed out');
  }
  return remaining;
}

function waitForAbort(operation, signal, onAbort) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      onAbort?.();
      reject(signal.reason ?? new Error('Reaction API smoke timed out'));
    };

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

async function readBoundedText(response, signal) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const result = await waitForAbort(
        reader.read(),
        signal,
        () => {
          try {
            void reader.cancel().catch(() => undefined);
          } catch {
            // The request still fails closed if cancellation is unavailable.
          }
        },
      );
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_JSON_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The bounded parser has already stopped consuming the body.
        }
        throw new TypeError('Reaction API response body is too large');
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
  return new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: false,
  }).decode(bytes);
}

async function readBoundedJson(response, signal) {
  return JSON.parse(await readBoundedText(response, signal));
}

async function fetchWithinDeadline({
  url,
  init,
  deadline,
  fetchImpl,
  now,
  timeoutSignal,
}) {
  const signal = timeoutSignal(remainingMilliseconds(deadline, now));
  const response = await waitForAbort(
    Promise.resolve(fetchImpl(url, { ...init, signal })),
    signal,
  );
  return { response, signal };
}

function parseManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Manifest must be an object');
  }
  const manifest = value;
  if (
    !hasExactKeys(manifest, ['version', 'targets'])
  ) {
    throw new TypeError('Manifest has unexpected fields');
  }
  if (manifest.version !== 1) {
    throw new TypeError('Manifest version must be 1');
  }
  if (
    !Array.isArray(manifest.targets)
    || manifest.targets.length < 1
    || manifest.targets.length > MAX_REACTION_TARGETS
  ) {
    throw new TypeError('Manifest must contain between 1 and 100 targets');
  }

  let previous;
  for (const target of manifest.targets) {
    if (
      typeof target !== 'string'
      || target.length > MAX_REACTION_TARGET_LENGTH
      || !REACTION_TARGET_PATTERN.test(target)
    ) {
      throw new TypeError('Manifest contains an invalid target');
    }
    if (previous !== undefined && previous >= target) {
      throw new TypeError('Manifest targets must be unique and sorted');
    }
    previous = target;
  }
  return manifest.targets[0];
}

async function pollManifest(options) {
  let lastError;
  for (let attempt = 0; attempt < MANIFEST_ATTEMPTS; attempt += 1) {
    try {
      const { response, signal } = await fetchWithinDeadline({
        ...options,
        url: options.manifestUrl,
        init: {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Manifest returned ${response.status}`);
      }
      return parseManifest(await readBoundedJson(response, signal));
    } catch (error) {
      lastError = error;
      if (options.now() >= options.deadline) {
        throw new Error('Reaction API smoke timed out');
      }
      if (attempt + 1 === MANIFEST_ATTEMPTS) break;
      const delayMilliseconds = Math.min(
        MANIFEST_RETRY_DELAY_MS,
        remainingMilliseconds(options.deadline, options.now),
      );
      await options.delay(delayMilliseconds);
    }
  }
  throw lastError ?? new Error('Manifest did not become available');
}

function assertPreflight(response, body, origin) {
  if (response.status !== 204) {
    throw new TypeError('Preflight must return 204');
  }
  if (body !== '') {
    throw new TypeError('Preflight body must be empty');
  }
  if (response.headers.get('Access-Control-Allow-Origin') !== origin) {
    throw new TypeError('Preflight allow-origin is incorrect');
  }
  if (
    response.headers.get('Access-Control-Allow-Methods')
    !== 'POST, PUT, OPTIONS'
  ) {
    throw new TypeError('Preflight allow-methods is incorrect');
  }
  if (
    response.headers.get('Access-Control-Allow-Headers')
    !== 'Authorization, Content-Type'
  ) {
    throw new TypeError('Preflight allow-headers is incorrect');
  }
  const vary = (response.headers.get('Vary') ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase());
  if (!vary.includes('origin')) {
    throw new TypeError('Preflight must vary on Origin');
  }
}

function assertBootstrap(value, target) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Bootstrap body must be an object');
  }
  const body = value;
  if (
    !hasExactKeys(body, ['visitorToken', 'reactions'])
  ) {
    throw new TypeError('Bootstrap body has unexpected fields');
  }
  if (
    typeof body.visitorToken !== 'string'
    || !TOKEN_PATTERN.test(body.visitorToken)
  ) {
    throw new TypeError('Bootstrap token is invalid');
  }

  if (
    !body.reactions
    || typeof body.reactions !== 'object'
    || Array.isArray(body.reactions)
  ) {
    throw new TypeError('Bootstrap reactions are invalid');
  }
  const reactions = body.reactions;
  if (!hasExactKeys(reactions, [target])) {
    throw new TypeError('Bootstrap target keys are incorrect');
  }
  const snapshot = reactions[target];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('Bootstrap snapshot is invalid');
  }
  if (!hasExactKeys(snapshot, ['counts', 'selected'])) {
    throw new TypeError('Bootstrap snapshot has unexpected fields');
  }
  if (
    !snapshot.counts
    || typeof snapshot.counts !== 'object'
    || Array.isArray(snapshot.counts)
  ) {
    throw new TypeError('Bootstrap counts are invalid');
  }
  const counts = snapshot.counts;
  if (!hasExactKeys(counts, APPROVED_REACTION_EMOJIS)) {
    throw new TypeError('Bootstrap count keys are incorrect');
  }
  for (const emoji of APPROVED_REACTION_EMOJIS) {
    const count = counts[emoji];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new TypeError(`Bootstrap count for ${emoji} is invalid`);
    }
  }
  if (!Array.isArray(snapshot.selected)) {
    throw new TypeError('Selected must be an array');
  }
  const selected = new Set();
  for (const emoji of snapshot.selected) {
    if (
      selected.has(emoji)
      || !APPROVED_REACTION_EMOJIS.includes(emoji)
      || counts[emoji] < 1
    ) {
      throw new TypeError('Selected reactions are invalid');
    }
    selected.add(emoji);
  }
}

export async function smokeReactionsApi({
  apiUrl,
  manifestUrl = DEFAULT_MANIFEST_URL,
  origin = DEFAULT_ORIGIN,
  fetchImpl = fetch,
  delay = (milliseconds) => new Promise(
    (resolve) => setTimeout(resolve, milliseconds),
  ),
  now = () => performance.now(),
  timeoutSignal = (milliseconds) => AbortSignal.timeout(milliseconds),
} = {}) {
  const normalizedApiUrl = validateReactionsApiUrl(apiUrl, {
    required: true,
  });
  const normalizedManifestUrl = assertManifestUrl(manifestUrl);
  const normalizedOrigin = assertOrigin(origin);
  const deadline = now() + SMOKE_DEADLINE_MS;
  const shared = {
    deadline,
    delay,
    fetchImpl,
    now,
    timeoutSignal,
  };

  const target = await pollManifest({
    ...shared,
    manifestUrl: normalizedManifestUrl,
  });
  const bootstrapUrl = `${normalizedApiUrl}/v1/reactions/bootstrap`;

  const preflight = await fetchWithinDeadline({
    ...shared,
    url: bootstrapUrl,
    init: {
      method: 'OPTIONS',
      headers: {
        Origin: normalizedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    },
  });
  assertPreflight(
    preflight.response,
    await readBoundedText(preflight.response, preflight.signal),
    normalizedOrigin,
  );

  const bootstrap = await fetchWithinDeadline({
    ...shared,
    url: bootstrapUrl,
    init: {
      method: 'POST',
      headers: {
        Origin: normalizedOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targets: [target] }),
    },
  });
  if (
    bootstrap.response.status !== 200
  ) {
    throw new TypeError('Bootstrap must return 200');
  }
  if (bootstrap.response.headers.get('Cache-Control') !== 'no-store') {
    throw new TypeError('Bootstrap must be no-store');
  }
  if (
    bootstrap.response.headers.get('Access-Control-Allow-Origin')
    !== normalizedOrigin
  ) {
    throw new TypeError('Bootstrap allow-origin is incorrect');
  }
  assertBootstrap(
    await readBoundedJson(bootstrap.response, bootstrap.signal),
    target,
  );
  return { target };
}

export async function runSmokeCli(dependencies = {}) {
  const {
    env = process.env,
    stdout,
    stderr,
    writeStdout = stdout ?? ((line) => console.log(line)),
    writeStderr = stderr ?? ((line) => console.error(line)),
    ...options
  } = dependencies;
  try {
    const { target } = await smokeReactionsApi({
      apiUrl: env.PUBLIC_REACTIONS_API_URL,
      manifestUrl:
        options.manifestUrl
        ?? env.REACTION_TARGET_MANIFEST_URL
        ?? DEFAULT_MANIFEST_URL,
      ...options,
    });
    writeStdout(`Reaction API smoke passed for ${target}.`);
    return 0;
  } catch (error) {
    writeStderr(
      error instanceof Error
        ? error.message
        : 'Reaction API smoke failed',
    );
    return 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runSmokeCli();
}
