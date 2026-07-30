import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateReactionsApiUrl } from '../scripts/validate-reactions-env.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts', 'validate-reactions-env.mjs');

test('optional missing values normalize to undefined', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(validateReactionsApiUrl(value), undefined);
  }
});

test('required missing values use a static error', () => {
  for (const value of [undefined, null, '']) {
    assert.throws(
      () => validateReactionsApiUrl(value, { required: true }),
      { message: 'PUBLIC_REACTIONS_API_URL is required' },
    );
  }
});

test('valid HTTPS origins normalize to their origin', () => {
  assert.equal(
    validateReactionsApiUrl('https://reactions.example.com/'),
    'https://reactions.example.com',
  );
  assert.equal(
    validateReactionsApiUrl('https://reactions.example.com:8443'),
    'https://reactions.example.com:8443',
  );
});

test('invalid values are rejected with static messages', () => {
  const cases = [
    [42, 'PUBLIC_REACTIONS_API_URL must be a string'],
    [' https://reactions.example.com', 'PUBLIC_REACTIONS_API_URL must not contain surrounding whitespace'],
    ['https://reactions.example.com ', 'PUBLIC_REACTIONS_API_URL must not contain surrounding whitespace'],
    ['/relative', 'PUBLIC_REACTIONS_API_URL must be an absolute URL'],
    ['not a URL', 'PUBLIC_REACTIONS_API_URL must be an absolute URL'],
    ['http://reactions.example.com', 'PUBLIC_REACTIONS_API_URL must use HTTPS'],
    ['https://', 'PUBLIC_REACTIONS_API_URL must be an absolute URL'],
    ['https://user:password@reactions.example.com', 'PUBLIC_REACTIONS_API_URL must not contain credentials'],
    ['https://reactions.example.com/v1', 'PUBLIC_REACTIONS_API_URL must be an origin without a path'],
    ['https://reactions.example.com?token=secret', 'PUBLIC_REACTIONS_API_URL must not contain a query'],
    ['https://reactions.example.com#secret', 'PUBLIC_REACTIONS_API_URL must not contain a fragment'],
  ];

  for (const [value, message] of cases) {
    assert.throws(() => validateReactionsApiUrl(value), { message }, value);
  }
});

test('CLI accepts optional missing configuration without revealing a URL', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PUBLIC_REACTIONS_API_URL: '' },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Reaction API URL configuration is valid.\n');
  assert.equal(result.stderr, '');
});

test('CLI --required validates configured HTTPS origin', () => {
  const value = 'https://reactions.example.com/';
  const result = spawnSync(process.execPath, [script, '--required'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PUBLIC_REACTIONS_API_URL: value },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Reaction API URL configuration is valid.\n');
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /reactions\.example\.com/);
});

test('CLI failure is one static stderr line and never echoes credentials', () => {
  const secret = 'cli-password-that-must-not-leak';
  const result = spawnSync(process.execPath, [script, '--required'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PUBLIC_REACTIONS_API_URL: `https://user:${secret}@reactions.example.com`,
    },
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    'PUBLIC_REACTIONS_API_URL must not contain credentials\n',
  );
  assert.equal(result.stdout, '');
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
});

test('CLI --required rejects missing configuration', () => {
  const env = { ...process.env };
  delete env.PUBLIC_REACTIONS_API_URL;
  const result = spawnSync(process.execPath, [script, '--required'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'PUBLIC_REACTIONS_API_URL is required\n');
});
