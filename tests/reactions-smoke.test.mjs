import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runSmokeCli,
  smokeReactionsApi,
} from '../scripts/smoke-reactions-api.mjs';

const API_URL = 'https://reactions.example.com';
const MANIFEST_URL = 'https://kybee.github.io/reaction-targets.json';
const ORIGIN = 'https://kybee.github.io';
const TARGET = 'side:alpha';
const TOKEN = `v1.${'a'.repeat(43)}.${'B'.repeat(43)}`;
const EMOJIS = ['👍', '🔥', '🎉', '👏'];

function manifestResponse(body = { version: 1, targets: [TARGET] }, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function preflightResponse(overrides = {}) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Accept-Encoding, Origin',
    ...overrides.headers,
  });
  return new Response(null, {
    status: overrides.status ?? 204,
    headers,
  });
}

function bootstrapBody(overrides = {}) {
  return {
    visitorToken: TOKEN,
    reactions: {
      [TARGET]: {
        counts: {
          '👍': 1,
          '🔥': 0,
          '🎉': 2,
          '👏': 0,
        },
        selected: ['👍', '🎉'],
      },
    },
    ...overrides,
  };
}

function bootstrapResponse(body = bootstrapBody(), overrides = {}) {
  return new Response(JSON.stringify(body), {
    status: overrides.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': ORIGIN,
      ...overrides.headers,
    },
  });
}

function successfulFetch({ manifest = manifestResponse(), preflight, bootstrap } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === MANIFEST_URL) return manifest.clone();
    if (init.method === 'OPTIONS') {
      return (preflight ?? preflightResponse()).clone();
    }
    return (bootstrap ?? bootstrapResponse()).clone();
  };
  return { calls, fetchImpl };
}

function testOptions(fetchImpl, overrides = {}) {
  return {
    apiUrl: API_URL,
    fetchImpl,
    delay: async () => {},
    now: () => 0,
    timeoutSignal: () => new AbortController().signal,
    ...overrides,
  };
}

test('smoke validates a sorted real target with one OPTIONS and one POST only', async () => {
  const { calls, fetchImpl } = successfulFetch({
    manifest: manifestResponse({
      version: 1,
      targets: ['side:alpha', 'work:zulu'],
    }),
  });

  assert.deepEqual(await smokeReactionsApi(testOptions(fetchImpl)), {
    target: TARGET,
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map(({ init }) => init.method ?? 'GET'),
    ['GET', 'OPTIONS', 'POST'],
  );
  assert.ok(calls.every(({ init }) => init.method !== 'PUT'));

  assert.equal(calls[0].url, MANIFEST_URL);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(new Headers(calls[0].init.headers).get('Accept'), 'application/json');
  assert.ok(calls[0].init.signal instanceof AbortSignal);

  assert.equal(calls[1].url, `${API_URL}/v1/reactions/bootstrap`);
  const preflightHeaders = new Headers(calls[1].init.headers);
  assert.equal(preflightHeaders.get('Origin'), ORIGIN);
  assert.equal(preflightHeaders.get('Access-Control-Request-Method'), 'POST');
  assert.equal(
    preflightHeaders.get('Access-Control-Request-Headers'),
    'authorization, content-type',
  );

  const bootstrapHeaders = new Headers(calls[2].init.headers);
  assert.equal(bootstrapHeaders.get('Origin'), ORIGIN);
  assert.equal(bootstrapHeaders.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[2].init.body), { targets: [TARGET] });
});

test('API URL is validated before any fetch', async () => {
  let calls = 0;
  await assert.rejects(
    smokeReactionsApi(testOptions(async () => {
      calls += 1;
      throw new Error('must not fetch');
    }, { apiUrl: 'http://unsafe.example.com' })),
    { message: 'PUBLIC_REACTIONS_API_URL must use HTTPS' },
  );
  assert.equal(calls, 0);
});

for (const manifestUrl of [
  '/reaction-targets.json',
  'http://kybee.github.io/reaction-targets.json',
  'https://user:password@kybee.github.io/reaction-targets.json',
  'https://kybee.github.io/reaction-targets.json#fragment',
]) {
  test(`unsafe manifest URL is rejected before fetch: ${manifestUrl}`, async () => {
    let calls = 0;
    await assert.rejects(
      smokeReactionsApi(testOptions(async () => {
        calls += 1;
      }, { manifestUrl })),
      /Reaction manifest URL/,
    );
    assert.equal(calls, 0);
  });
}

test('101 manifest targets fail before API calls', async () => {
  const targets = Array.from(
    { length: 101 },
    (_, index) => `work:target-${String(index).padStart(3, '0')}`,
  );
  const calls = [];

  await assert.rejects(
    smokeReactionsApi(testOptions(async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return manifestResponse({ version: 1, targets });
    })),
    /manifest/i,
  );
  assert.equal(calls.length, 18);
  assert.ok(calls.every(({ url }) => url === MANIFEST_URL));
  assert.ok(calls.every(({ init }) => init.method !== 'PUT'));
});

test('18 immediate 503 responses use 17 delays and 85 seconds of fake time', async () => {
  let fakeNow = 0;
  const delays = [];
  const remaining = [];
  const calls = [];

  await assert.rejects(
    smokeReactionsApi(testOptions(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('unavailable', { status: 503 });
    }, {
      now: () => fakeNow,
      delay: async (milliseconds) => {
        delays.push(milliseconds);
        fakeNow += milliseconds;
      },
      timeoutSignal: (milliseconds) => {
        remaining.push(milliseconds);
        return new AbortController().signal;
      },
    })),
    /manifest/i,
  );

  assert.equal(calls.length, 18);
  assert.deepEqual(delays, Array(17).fill(5_000));
  assert.equal(fakeNow, 85_000);
  assert.deepEqual(
    remaining,
    Array.from({ length: 18 }, (_, index) => 90_000 - index * 5_000),
  );
  assert.ok(calls.every(({ init }) => init.method !== 'PUT'));
});

test('a never-settling manifest fetch aborts at the one 90-second deadline', async () => {
  let fakeNow = 0;
  const remaining = [];
  const calls = [];

  await assert.rejects(
    smokeReactionsApi(testOptions((url, init) => {
      calls.push({ url: String(url), init });
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), {
          once: true,
        });
      });
    }, {
      now: () => fakeNow,
      timeoutSignal: (milliseconds) => {
        remaining.push(milliseconds);
        const controller = new AbortController();
        fakeNow += milliseconds;
        queueMicrotask(() => controller.abort(new Error('deadline')));
        return controller.signal;
      },
    })),
    /timed out|deadline/i,
  );

  assert.deepEqual(remaining, [90_000]);
  assert.equal(fakeNow, 90_000);
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].init.method, 'PUT');
});

for (const hangingMethod of ['OPTIONS', 'POST']) {
  test(`after one retry a hanging ${hangingMethod} receives only 85 seconds`, async () => {
    let fakeNow = 0;
    let manifestAttempts = 0;
    const remaining = [];
    const calls = [];

    await assert.rejects(
      smokeReactionsApi(testOptions((url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url) === MANIFEST_URL) {
          manifestAttempts += 1;
          return Promise.resolve(
            manifestAttempts === 1
              ? new Response('retry', { status: 503 })
              : manifestResponse(),
          );
        }
        if (hangingMethod === 'POST' && init.method === 'OPTIONS') {
          return Promise.resolve(preflightResponse());
        }
        return new Promise((resolve, reject) => {
          init.signal.addEventListener(
            'abort',
            () => reject(init.signal.reason),
            { once: true },
          );
        });
      }, {
        now: () => fakeNow,
        delay: async (milliseconds) => {
          fakeNow += milliseconds;
        },
        timeoutSignal: (milliseconds) => {
          remaining.push(milliseconds);
          const controller = new AbortController();
          if (
            (hangingMethod === 'OPTIONS' && remaining.length === 3)
            || (hangingMethod === 'POST' && remaining.length === 4)
          ) {
            fakeNow += milliseconds;
            queueMicrotask(() => controller.abort(new Error('deadline')));
          }
          return controller.signal;
        },
      })),
      /timed out|deadline/i,
    );

    assert.equal(fakeNow, 90_000);
    assert.equal(remaining.at(-1), 85_000);
    assert.ok(calls.every(({ init }) => init.method !== 'PUT'));
  });
}

test('native request signal governs manifest JSON body consumption', async () => {
  let fakeNow = 0;
  const stream = new ReadableStream({ start() {} });

  await assert.rejects(
    smokeReactionsApi(testOptions(async () => new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }), {
      now: () => fakeNow,
      timeoutSignal: (milliseconds) => {
        const controller = new AbortController();
        fakeNow += milliseconds;
        queueMicrotask(() => controller.abort(new Error('deadline')));
        return controller.signal;
      },
    })),
    /timed out|deadline/i,
  );
  assert.equal(fakeNow, 90_000);
});

function failureFixture(mutate) {
  const fixture = {
    manifest: { version: 1, targets: [TARGET] },
    manifestStatus: 200,
    manifestRaw: undefined,
    preflightStatus: 204,
    preflightHeaders: {
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      Vary: 'Origin',
    },
    bootstrapStatus: 200,
    bootstrapHeaders: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': ORIGIN,
    },
    bootstrap: bootstrapBody(),
  };
  mutate(fixture);
  return fixture;
}

const failureCases = [
  ['manifest non-2xx', (f) => { f.manifestStatus = 503; }],
  ['manifest malformed JSON', (f) => { f.manifestRaw = '{'; }],
  ['manifest wrong version', (f) => { f.manifest.version = 2; }],
  ['manifest unsorted', (f) => { f.manifest.targets = ['work:zulu', TARGET]; }],
  ['manifest invalid target', (f) => { f.manifest.targets = ['work:INVALID']; }],
  ['preflight status', (f) => { f.preflightStatus = 200; }],
  ['preflight origin', (f) => { f.preflightHeaders['Access-Control-Allow-Origin'] = 'https://evil.example'; }],
  ['preflight methods', (f) => { f.preflightHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }],
  ['preflight headers', (f) => { f.preflightHeaders['Access-Control-Allow-Headers'] = 'Content-Type'; }],
  ['preflight Vary', (f) => { f.preflightHeaders.Vary = 'Accept-Encoding'; }],
  ['bootstrap status', (f) => { f.bootstrapStatus = 503; }],
  ['bootstrap no-store', (f) => { f.bootstrapHeaders['Cache-Control'] = 'public'; }],
  ['bootstrap origin', (f) => { f.bootstrapHeaders['Access-Control-Allow-Origin'] = 'https://evil.example'; }],
  ['bootstrap token', (f) => { f.bootstrap.visitorToken = 'not-canonical'; }],
  ['bootstrap target keys', (f) => { f.bootstrap.reactions['work:zulu'] = f.bootstrap.reactions[TARGET]; }],
  ['bootstrap count keys', (f) => { delete f.bootstrap.reactions[TARGET].counts['👏']; }],
  ['bootstrap noninteger count', (f) => { f.bootstrap.reactions[TARGET].counts['👍'] = 1.5; }],
  ['bootstrap negative count', (f) => { f.bootstrap.reactions[TARGET].counts['👍'] = -1; }],
  ['bootstrap duplicate selection', (f) => { f.bootstrap.reactions[TARGET].selected = ['👍', '👍']; }],
  ['bootstrap unapproved selection', (f) => { f.bootstrap.reactions[TARGET].selected = ['💣']; }],
  ['bootstrap zero-count selection', (f) => { f.bootstrap.reactions[TARGET].selected = ['🔥']; }],
];

for (const [label, mutate] of failureCases) {
  test(`CLI fails closed for ${label} with no PUT`, async () => {
    const fixture = failureFixture(mutate);
    const calls = [];
    const stdout = [];
    const stderr = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url) === MANIFEST_URL) {
        const raw = fixture.manifestRaw
          ?? JSON.stringify(fixture.manifest);
        return new Response(raw, { status: fixture.manifestStatus });
      }
      if (init.method === 'OPTIONS') {
        return new Response(null, {
          status: fixture.preflightStatus,
          headers: fixture.preflightHeaders,
        });
      }
      return new Response(JSON.stringify(fixture.bootstrap), {
        status: fixture.bootstrapStatus,
        headers: fixture.bootstrapHeaders,
      });
    };

    const result = await runSmokeCli({
      env: { PUBLIC_REACTIONS_API_URL: API_URL },
      fetchImpl,
      delay: async () => {},
      now: () => 0,
      timeoutSignal: () => new AbortController().signal,
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
    });

    assert.equal(result, 1);
    assert.deepEqual(stdout, []);
    assert.equal(stderr.length, 1);
    assert.match(stderr[0], /\S/u);
    assert.doesNotMatch(stderr[0], /\n/u);
    assert.ok(calls.every(({ init }) => init.method !== 'PUT'));
  });
}

test('CLI success prints only the selected real target', async () => {
  const { calls, fetchImpl } = successfulFetch();
  const stdout = [];
  const stderr = [];

  const result = await runSmokeCli({
    env: { PUBLIC_REACTIONS_API_URL: `${API_URL}/` },
    fetchImpl,
    delay: async () => {},
    now: () => 0,
    timeoutSignal: () => new AbortController().signal,
    writeStdout: (line) => stdout.push(line),
    writeStderr: (line) => stderr.push(line),
  });

  assert.equal(result, 0);
  assert.deepEqual(stdout, [`Reaction API smoke passed for ${TARGET}.`]);
  assert.deepEqual(stderr, []);
  assert.ok(calls.every(({ init }) => init.method !== 'PUT'));
});

test('approved count key order is enforced', async () => {
  for (const ordering of [
    ['🔥', '👍', '🎉', '👏'],
    ['👍', '🎉', '🔥', '👏'],
  ]) {
    const counts = Object.fromEntries(ordering.map((emoji) => [emoji, 1]));
    const body = bootstrapBody();
    body.reactions[TARGET].counts = counts;
    const { fetchImpl } = successfulFetch({
      bootstrap: bootstrapResponse(body),
    });
    await assert.rejects(smokeReactionsApi(testOptions(fetchImpl)), /bootstrap/i);
  }

  assert.deepEqual(EMOJIS, ['👍', '🔥', '🎉', '👏']);
});

test('unique approved selections need not be sorted', async () => {
  const body = bootstrapBody();
  body.reactions[TARGET].selected = ['🎉', '👍'];
  const { fetchImpl } = successfulFetch({
    bootstrap: bootstrapResponse(body),
  });

  await assert.doesNotReject(smokeReactionsApi(testOptions(fetchImpl)));
});
