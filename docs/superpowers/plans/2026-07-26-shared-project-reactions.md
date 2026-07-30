# Shared Project Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the decorative work/side-project reaction counts with accessible, anonymous, shared `👍`, `🔥`, `🎉`, and `👏` reactions whose D1 data survives every portfolio and Worker deployment.

**Architecture:** The Astro build derives stable language-independent target IDs from the content entry IDs, renders reaction-ready project markup, and publishes the authoritative `/reaction-targets.json`. A separately deployed Cloudflare Worker validates the exact site origin and target manifest, signs anonymous visitor tokens, rate-limits writes, and stores one D1 row per visitor/target/emoji. The browser bootstraps once per page load, exposes controls only after real data arrives, opens one Slack-like action bar by hover/focus/tap, and performs idempotent optimistic `PUT` updates with per-emoji rollback.

**Tech Stack:** Astro 4, TypeScript 5, Vitest 4 with Happy DOM, Cloudflare Workers, Wrangler 4, Cloudflare Workers Vitest Pool, D1/SQLite migrations, Node.js 20, GitHub Actions, Playwright browser verification

---

## Source of truth and rollout boundary

Implement against
`docs/superpowers/specs/2026-07-26-shared-project-reactions-design.md`.
The fixed wire-level decisions are:

- Allowed emoji: `👍`, `🔥`, `🎉`, `👏`, in that order.
- Target pattern:
  `^(work|side):[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 96 characters.
- Production site origin: `https://kybee.github.io`.
- Local browser origins: `http://localhost:4321` and
  `http://127.0.0.1:4321`.
- Target cache lifetime: exactly 300,000 ms, with no stale fallback after
  expiry.
- Write limit: 30 requests per visitor hash per 60 seconds.
- Token-issue limit: 20 requests per IP-derived HMAC key per 60 seconds.
- D1 stores only `target_id`, `emoji`, `visitor_hash`, and `created_at`.
- The first production release is two phases:
  1. publish the manifest and healthy Worker/D1 while no reaction UI is
     visible;
  2. enable the frontend only after bootstrap succeeds against production.

Do not migrate the current fake numbers. Do not add polling, login, arbitrary
emoji, a reaction CMS field, an admin interface, IP persistence, or automatic
mutation retries.

## File structure

### Create

```text
src/components/ReactionControls.astro
src/lib/project-groups.ts
src/lib/reactions/contracts.ts
src/lib/reactions/targets.ts
src/pages/reaction-targets.json.ts
src/scripts/reactions/api-client.ts
src/scripts/reactions/data-controller.ts
src/scripts/reactions/index.ts
src/scripts/reactions/interaction-controller.ts
src/scripts/reactions/token-store.ts
src/styles/reactions.css

services/reactions/README.md
services/reactions/wrangler.jsonc
services/reactions/tsconfig.json
services/reactions/vitest.config.ts
services/reactions/migrations/0001_create_reactions.sql
services/reactions/src/cors.ts
services/reactions/src/env.ts
services/reactions/src/http.ts
services/reactions/src/index.ts
services/reactions/src/manifest.ts
services/reactions/src/repository.ts
services/reactions/src/token.ts
services/reactions/src/validation.ts
services/reactions/test/cors.test.ts
services/reactions/test/helpers.ts
services/reactions/test/manifest.test.ts
services/reactions/test/migration.test.ts
services/reactions/test/repository.test.ts
services/reactions/test/setup.ts
services/reactions/test/tsconfig.json
services/reactions/test/token.test.ts
services/reactions/test/validation.test.ts
services/reactions/test/worker.test.ts

tests/reactions/api-client.test.ts
tests/reactions/contracts.test.ts
tests/reactions/data-controller.test.ts
tests/reactions/fixtures.ts
tests/reactions/index.test.ts
tests/reactions/interaction-controller.test.ts
tests/reactions/targets.test.ts
tests/reactions-env.test.mjs
tests/reactions-smoke.test.mjs
vitest.frontend.config.ts
scripts/smoke-reactions-api.mjs
scripts/validate-reactions-env.mjs
.github/workflows/reactions-deploy.yml
```

### Modify

```text
.gitignore
.github/workflows/deploy.yml
package.json
package-lock.json
tsconfig.json
src/components/Workspace.astro
src/env.d.ts
tests/site-output.test.mjs
tests/workflows.test.mjs
```

### Leave unchanged

```text
.pages.yml
src/content/**
```

Pages CMS remains content-only. It changes the generated target manifest by
publishing content; it never reads or writes reaction counts.

## Execution gates

This is one end-to-end plan because Phase A and Phase B must use the same
contract, target IDs, and deployment invariants. It is not one uninterrupted
execution run. Stop and report evidence at each gate:

1. **Phase-A code gate:** enter Tasks 1–10 from the clean feature worktree
   containing this committed plan and design. Exit only when every Phase-A
   commit exists, `npm run verify` passes, and no visible reaction UI was
   introduced.
2. **Production-foundation gate:** Task 11 is a separate runbook with external
   Cloudflare/GitHub state. Stop for any required login or merge authority.
   Exit only after Pages has published the same-SHA manifest and the
   read-only production Worker smoke succeeds.
3. **Phase-B code gate:** start Tasks 12–18 from the verified `main` commit in
   a fresh worktree. Do not copy unmerged Phase-A work forward. Exit only
   after local automated/browser checks, review, and the authorized Pages
   release succeed.
4. **Persistence gate:** completion requires the controlled temporary
   reaction to survive both a Worker redeploy and a Pages redeploy, followed
   by confirmed cleanup. A healthy UI alone is not completion evidence.

At every gate, preserve D1 and use only additive migrations. If a gate fails,
stop at that boundary; do not expose Phase-B controls or mutate production to
work around it.

Before Task 1, confirm the plan and design are committed:

```bash
git log -2 --oneline
git status --short
```

Expected: `docs: plan shared project reactions` and
`docs: design shared project reactions` are the two newest commits, and
`git status --short` prints nothing.

## Phase A — shared contract, manifest, Worker, and production foundation

### Task 1: Install deterministic test/runtime tooling and define the shared API contract

**Files:**

- Create: `src/lib/reactions/contracts.ts`
- Create: `tests/reactions/contracts.test.ts`
- Create: `vitest.frontend.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install exact Node-20-compatible development packages**

Run from the feature worktree:

```bash
npm install --save-dev --save-exact \
  @astrojs/check@0.9.4 \
  @cloudflare/vitest-pool-workers@0.15.1 \
  @cloudflare/workers-types@4.20260426.1 \
  @types/node@20.19.43 \
  happy-dom@20.11.1 \
  vitest@4.1.10 \
  wrangler@4.86.0
```

Expected: `package.json` and the single root `package-lock.json` change.
Wrangler stays at `4.86.0`; do not replace the exact pin with `^4.86.0`
because newer Wrangler releases require Node 22.

- [ ] **Step 2: Scope site typechecking and add the frontend Vitest configuration**

Replace root `tsconfig.json` with:

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [
    ".astro/types.d.ts",
    "src/**/*.astro",
    "src/**/*.ts",
    "tests/reactions/**/*.ts",
    "vitest.frontend.config.ts"
  ],
  "exclude": [
    "dist",
    "node_modules",
    "services/reactions/**"
  ]
}
```

This keeps `astro check` responsible for Astro/site code and the browser test
sources while the two Worker tsconfigs exclusively own
`services/reactions/**`.

Create `vitest.frontend.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/reactions/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
```

Add these scripts to `package.json` without changing the existing commands yet:

```json
{
  "test:frontend": "vitest run --config vitest.frontend.config.ts",
  "test:worker": "vitest run --config services/reactions/vitest.config.ts",
  "typecheck:site": "astro check",
  "reactions:typecheck": "tsc --noEmit -p services/reactions/tsconfig.json && tsc --noEmit -p services/reactions/test/tsconfig.json",
  "reactions:dry-run": "wrangler deploy --dry-run --config services/reactions/wrangler.jsonc",
  "reactions:migrate:local": "wrangler d1 migrations apply kybee-reactions --local --config services/reactions/wrangler.jsonc",
  "dev:reactions": "wrangler dev --config services/reactions/wrangler.jsonc"
}
```

Do not add `test:worker`, `reactions:typecheck`, or `reactions:dry-run` to
`verify` until their files exist in Task 4.

- [ ] **Step 3: Write the failing shared-contract test**

Create `tests/reactions/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_BOOTSTRAP_TARGETS,
  REACTION_EMOJIS,
  createEmptyReactionCounts,
} from '../../src/lib/reactions/contracts';

describe('reaction wire contract', () => {
  it('uses the approved emoji in stable display order', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '🔥', '🎉', '👏']);
  });

  it('creates a fresh zero-filled count map', () => {
    const first = createEmptyReactionCounts();
    const second = createEmptyReactionCounts();

    expect(first).toEqual({ '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 });
    expect(second).not.toBe(first);
  });

  it('shares the 100-target bootstrap ceiling', () => {
    expect(MAX_BOOTSTRAP_TARGETS).toBe(100);
  });
});
```

- [ ] **Step 4: Run the focused test and verify RED**

```bash
npm run test:frontend -- tests/reactions/contracts.test.ts
```

Expected: FAIL because `src/lib/reactions/contracts.ts` does not exist.

- [ ] **Step 5: Implement the one shared browser/Worker contract**

Create `src/lib/reactions/contracts.ts`:

```ts
export const REACTION_EMOJIS = ['👍', '🔥', '🎉', '👏'] as const;
export const MAX_BOOTSTRAP_TARGETS = 100;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export type ReactionTargetId = `${'work' | 'side'}:${string}`;
export type ReactionCounts = Record<ReactionEmoji, number>;

export interface ReactionSnapshot {
  counts: ReactionCounts;
  selected: ReactionEmoji[];
}

export interface ReactionTargetManifest {
  version: 1;
  targets: ReactionTargetId[];
}

export interface BootstrapRequest {
  targets: ReactionTargetId[];
}

export interface BootstrapResponse {
  visitorToken: string;
  reactions: Record<ReactionTargetId, ReactionSnapshot>;
}

export interface SetReactionRequest {
  targetId: ReactionTargetId;
  emoji: ReactionEmoji;
  active: boolean;
}

export interface SetReactionResponse extends SetReactionRequest {
  count: number;
}

export type ReactionApiErrorCode =
  | 'invalid_request'
  | 'invalid_token'
  | 'forbidden_origin'
  | 'target_not_found'
  | 'rate_limited'
  | 'manifest_unavailable'
  | 'internal_error';

export interface ApiErrorResponse {
  error: {
    code: ReactionApiErrorCode;
    message: string;
  };
}

export function createEmptyReactionCounts(): ReactionCounts {
  return { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 };
}
```

The types document the wire shape only. The Worker must still validate every
runtime value.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:frontend -- tests/reactions/contracts.test.ts
git add package.json package-lock.json tsconfig.json \
  vitest.frontend.config.ts \
  src/lib/reactions/contracts.ts tests/reactions/contracts.test.ts
git commit -m "feat: define shared reaction contract"
```

Expected: both tests pass and the commit contains no Worker or UI behavior.

### Task 2: Extract project grouping and lock stable target IDs

**Files:**

- Create: `src/lib/project-groups.ts`
- Create: `src/lib/reactions/targets.ts`
- Create: `tests/reactions/targets.test.ts`

- [ ] **Step 1: Write the target and grouping tests**

Create `tests/reactions/targets.test.ts` with these concrete cases:

```ts
import { describe, expect, it } from 'vitest';
import {
  getCurrentProjectEntries,
  groupProjectEntries,
} from '../../src/lib/project-groups';
import {
  createReactionTargetManifest,
  toReactionTargetId,
} from '../../src/lib/reactions/targets';

const entry = (
  id: string,
  lang: 'ko' | 'en',
  order: number,
  company: string,
) => ({
  id,
  data: {
    lang,
    order,
    company,
    role: 'Backend Engineer',
    period: 'current',
  },
});

describe('toReactionTargetId', () => {
  it('maps both languages to the same work target', () => {
    expect(toReactionTargetId('projects', 'samsung-agenthub.ko')).toBe(
      'work:samsung-agenthub',
    );
    expect(
      toReactionTargetId('projects', 'samsung-agenthub.en.yaml'),
    ).toBe('work:samsung-agenthub');
  });

  it('keeps work and side namespaces separate', () => {
    expect(toReactionTargetId('projects', 'booster.ko')).toBe(
      'work:booster',
    );
    expect(toReactionTargetId('sideProjects', 'booster.en')).toBe(
      'side:booster',
    );
  });

  it.each([
    'missing-language',
    'Uppercase.ko',
    '-leading.ko',
    'double--dash.en',
    'name.fr',
  ])('rejects invalid entry id %s', (id) => {
    expect(() => toReactionTargetId('projects', id)).toThrow();
  });

  it('rejects a normalized target longer than 96 characters', () => {
    expect(() =>
      toReactionTargetId('sideProjects', `${'a'.repeat(92)}.ko`),
    ).toThrow(/96/);
  });
});

describe('project selection', () => {
  const entries = [
    entry('old.ko', 'ko', 30, 'Old Co'),
    entry('current-b.ko', 'ko', 20, 'Current Co'),
    entry('current-a.ko', 'ko', 10, 'Current Co'),
  ];

  it('sorts entries and groups only adjacent matching employment metadata', () => {
    expect(groupProjectEntries(entries).map((group) =>
      group.items.map(({ id }) => id),
    )).toEqual([
      ['current-a.ko', 'current-b.ko'],
      ['old.ko'],
    ]);
  });

  it('returns only the first rendered work group', () => {
    expect(getCurrentProjectEntries(entries).map(({ id }) => id)).toEqual([
      'current-a.ko',
      'current-b.ko',
    ]);
  });
});

it('deduplicates and sorts a version-1 manifest', () => {
  expect(
    createReactionTargetManifest([
      'work:zeta',
      'side:alpha',
      'work:zeta',
    ]),
  ).toEqual({
    version: 1,
    targets: ['side:alpha', 'work:zeta'],
  });
});

it('accepts 100 targets and rejects a 101st target', () => {
  const hundred = Array.from(
    { length: 100 },
    (_, index) => `work:project-${index}` as `work:${string}`,
  );
  expect(createReactionTargetManifest(hundred).targets).toHaveLength(100);
  expect(() =>
    createReactionTargetManifest([
      ...hundred,
      'side:one-more',
    ]),
  ).toThrow(/100/);
});
```

- [ ] **Step 2: Run the target tests and verify RED**

```bash
npm run test:frontend -- tests/reactions/targets.test.ts
```

Expected: FAIL because both imported modules are missing.

- [ ] **Step 3: Implement the shared project grouping helper**

Create `src/lib/project-groups.ts`:

```ts
export interface ProjectEntryLike {
  id: string;
  data: {
    lang: 'ko' | 'en';
    order?: number;
    company: string;
    role: string;
    period: string;
    location?: string;
  };
}

export interface ProjectGroup<T extends ProjectEntryLike> {
  company: string;
  role: string;
  period: string;
  location?: string;
  items: T[];
}

export function compareEntryOrder(
  left: { data: { order?: number } },
  right: { data: { order?: number } },
): number {
  return (left.data.order ?? 0) - (right.data.order ?? 0);
}

export function groupProjectEntries<T extends ProjectEntryLike>(
  entries: readonly T[],
): ProjectGroup<T>[] {
  const groups: ProjectGroup<T>[] = [];

  for (const entry of [...entries].sort(compareEntryOrder)) {
    const { company, role, period, location } = entry.data;
    const previous = groups.at(-1);
    if (
      previous &&
      previous.company === company &&
      previous.role === role &&
      previous.period === period
    ) {
      previous.items.push(entry);
    } else {
      groups.push({
        company,
        role,
        period,
        location,
        items: [entry],
      });
    }
  }

  return groups;
}

export function getCurrentProjectEntries<T extends ProjectEntryLike>(
  entries: readonly T[],
): T[] {
  return groupProjectEntries(entries)[0]?.items ?? [];
}
```

This helper must be used by both `Workspace.astro` and the JSON route so the
manifest cannot silently include historical work entries that are not rendered
in `# 업무-프로젝트`.

- [ ] **Step 4: Implement strict target normalization**

Create `src/lib/reactions/targets.ts`:

```ts
import {
  MAX_BOOTSTRAP_TARGETS,
  type ReactionTargetId,
  type ReactionTargetManifest,
} from './contracts';

const ENTRY_ID_PATTERN =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(ko|en)(?:\.ya?ml)?$/;
export const REACTION_TARGET_PATTERN =
  /^(work|side):[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_REACTION_TARGET_LENGTH = 96;

export function assertReactionTargetId(
  value: string,
): asserts value is ReactionTargetId {
  if (
    value.length > MAX_REACTION_TARGET_LENGTH ||
    !REACTION_TARGET_PATTERN.test(value)
  ) {
    throw new TypeError(`Invalid reaction target: ${value}`);
  }
}

export function toReactionTargetId(
  collection: 'projects' | 'sideProjects',
  entryId: string,
): ReactionTargetId {
  const match = ENTRY_ID_PATTERN.exec(entryId);
  if (!match) {
    throw new TypeError(`Invalid localized content entry id: ${entryId}`);
  }

  const prefix = collection === 'projects' ? 'work' : 'side';
  const target = `${prefix}:${match[1]}`;
  if (target.length > MAX_REACTION_TARGET_LENGTH) {
    throw new TypeError('Reaction target must be at most 96 characters');
  }
  assertReactionTargetId(target);
  return target;
}

export function createReactionTargetManifest(
  targets: Iterable<ReactionTargetId>,
): ReactionTargetManifest {
  const unique = new Set<ReactionTargetId>();
  for (const target of targets) {
    assertReactionTargetId(target);
    unique.add(target);
  }
  if (unique.size > MAX_BOOTSTRAP_TARGETS) {
    throw new TypeError(
      `Reaction manifest must contain at most ${MAX_BOOTSTRAP_TARGETS} targets`,
    );
  }
  return {
    version: 1,
    targets: [...unique].sort(),
  };
}
```

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:frontend -- tests/reactions/targets.test.ts
npm run test:frontend -- tests/reactions/contracts.test.ts
git add src/lib/project-groups.ts src/lib/reactions/targets.ts \
  tests/reactions/targets.test.ts
git commit -m "feat: derive stable reaction target ids"
```

Expected: all contract/target tests pass.

### Task 3: Publish the authoritative rendered-target manifest

**Files:**

- Create: `src/pages/reaction-targets.json.ts`
- Modify: `tests/site-output.test.mjs`

- [ ] **Step 1: Add a failing built-output manifest test**

Change the imports in `tests/site-output.test.mjs` to include YAML parsing:

```js
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
```

Add these content-derived helpers after the imports:

```js
async function readReactionContentEntries(collection) {
  const directory = `src/content/${collection}`;
  const filenames = (await readdir(directory))
    .filter((filename) => /\.ya?ml$/u.test(filename))
    .sort();

  return Promise.all(
    filenames.map(async (filename) => {
      const data = parseYaml(
        await readFile(`${directory}/${filename}`, 'utf8'),
      );
      assert.ok(
        data !== null &&
          typeof data === 'object' &&
          !Array.isArray(data),
        `Expected ${directory}/${filename} to contain a YAML object`,
      );
      return {
        id: filename.replace(/\.ya?ml$/u, ''),
        data,
      };
    }),
  );
}

function currentWorkEntriesForLanguage(entries, lang) {
  const sorted = entries
    .filter((entry) => entry.data.lang === lang)
    .sort(
      (left, right) =>
        (left.data.order ?? 0) - (right.data.order ?? 0),
    );
  const first = sorted[0];
  assert.ok(first, `Expected at least one ${lang} work project`);

  const current = [];
  for (const entry of sorted) {
    if (
      entry.data.company !== first.data.company ||
      entry.data.role !== first.data.role ||
      entry.data.period !== first.data.period
    ) {
      break;
    }
    current.push(entry);
  }
  return current;
}

function localizedContentStem(entryId) {
  const match =
    /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(?:ko|en)$/u.exec(entryId);
  assert.ok(match, `Expected a localized content ID: ${entryId}`);
  return match[1];
}

async function expectedReactionTargetsFromContent() {
  const [projects, sideProjects] = await Promise.all([
    readReactionContentEntries('projects'),
    readReactionContentEntries('sideProjects'),
  ]);
  const targets = new Set();

  for (const lang of ['ko', 'en']) {
    for (const entry of currentWorkEntriesForLanguage(projects, lang)) {
      targets.add(`work:${localizedContentStem(entry.id)}`);
    }
  }
  for (const entry of sideProjects) {
    targets.add(`side:${localizedContentStem(entry.id)}`);
  }
  return Array.from(targets).sort();
}
```

Add this test:

```js
test('reaction target manifest contains the exact rendered project set', async () => {
  const manifest = JSON.parse(
    await readFile('dist/reaction-targets.json', 'utf8'),
  );
  const expectedTargets = await expectedReactionTargetsFromContent();

  assert.deepEqual(manifest, {
    version: 1,
    targets: expectedTargets,
  });
  assert.deepEqual(
    manifest.targets,
    Array.from(manifest.targets).sort(),
  );
  assert.equal(
    new Set(manifest.targets).size,
    manifest.targets.length,
  );
  assert.ok(
    manifest.targets.length <= 100,
    'One bootstrap request supports at most 100 rendered projects',
  );
});
```

The helper mirrors `getCurrentProjectEntries`: it sorts each language by
`order`, selects the first contiguous employment group by company, role, and
period, includes every side project, removes language suffixes, deduplicates,
and sorts. A valid Pages CMS add, delete, or reorder changes the expectation
without changing this test.

- [ ] **Step 2: Build and verify RED**

```bash
npm run build
node --test --test-name-pattern='reaction target manifest' tests/site-output.test.mjs
```

Expected: FAIL with `ENOENT` for `dist/reaction-targets.json`.

- [ ] **Step 3: Implement the prerendered JSON endpoint**

Create `src/pages/reaction-targets.json.ts`:

```ts
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCurrentProjectEntries } from '../lib/project-groups';
import {
  createReactionTargetManifest,
  toReactionTargetId,
} from '../lib/reactions/targets';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [projects, sideProjects] = await Promise.all([
    getCollection('projects'),
    getCollection('sideProjects'),
  ]);

  const workEntries = (['ko', 'en'] as const).flatMap((lang) =>
    getCurrentProjectEntries(
      projects.filter((entry) => entry.data.lang === lang),
    ),
  );

  const manifest = createReactionTargetManifest(
    workEntries
      .map((entry) => toReactionTargetId('projects', entry.id))
      .concat(
        sideProjects.map((entry) =>
          toReactionTargetId('sideProjects', entry.id),
        ),
      ),
  );

  return new Response(`${JSON.stringify(manifest)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
```

- [ ] **Step 4: Rebuild, run GREEN, and commit**

```bash
npm run build
node --test --test-name-pattern='reaction target manifest' tests/site-output.test.mjs
git add src/pages/reaction-targets.json.ts tests/site-output.test.mjs
git commit -m "feat: publish reaction target manifest"
```

Expected: the content-derived current work group plus every side-project stem
passes. Historical work groups are excluded by the same contiguous
first-group rule, without hard-coding company or project names.

### Task 4: Scaffold the Worker runtime and prove the D1 migration locally

**Files:**

- Create: `services/reactions/wrangler.jsonc`
- Create: `services/reactions/tsconfig.json`
- Create: `services/reactions/vitest.config.ts`
- Create: `services/reactions/migrations/0001_create_reactions.sql`
- Create: `services/reactions/src/env.ts`
- Create: `services/reactions/src/index.ts` (temporary typed stub; replaced in Task 9)
- Create: `services/reactions/test/setup.ts`
- Create: `services/reactions/test/migration.test.ts`
- Create: `services/reactions/test/tsconfig.json`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Add local-artifact ignores**

Append:

```gitignore
# Cloudflare Workers local state and secrets
**/.wrangler/
**/.dev.vars
```

Never add an exception that permits a real `.dev.vars` or generated HMAC
secret to be committed.

- [ ] **Step 2: Add the initial production-safe Wrangler config**

Create `services/reactions/wrangler.jsonc` without a fake D1 UUID:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "kybee-reactions-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-26",
  "workers_dev": true,
  "secrets": {
    "required": ["REACTION_HMAC_SECRET"]
  },
  "vars": {
    "REACTION_TARGET_MANIFEST_URL": "https://kybee.github.io/reaction-targets.json"
  },
  "ratelimits": [
    {
      "name": "WRITE_RATE_LIMITER",
      "namespace_id": "2026072601",
      "simple": { "limit": 30, "period": 60 }
    },
    {
      "name": "ISSUE_RATE_LIMITER",
      "namespace_id": "2026072602",
      "simple": { "limit": 20, "period": 60 }
    }
  ]
}
```

The `2026-04-26` compatibility date matches the newest runtime embedded in
the pinned Wrangler `4.86.0` and Vitest pool `0.15.1`. Do not advance that
date without upgrading Wrangler, the pool, Miniflare/workerd, and Workers
types together.

The real `d1_databases` block is added by Wrangler's `--update-config` in
Task 11. Do not commit a textual UUID marker, a zero UUID, or a local database
ID as if it were production.

- [ ] **Step 3: Add Worker types and test configuration**

Create `services/reactions/src/env.ts`:

```ts
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  REACTION_HMAC_SECRET: string;
  REACTION_TARGET_MANIFEST_URL: string;
  WRITE_RATE_LIMITER: RateLimiter;
  ISSUE_RATE_LIMITER: RateLimiter;
}
```

Create `services/reactions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.ts",
    "../../src/lib/reactions/contracts.ts"
  ]
}
```

Create `services/reactions/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const serviceRoot = fileURLToPath(new URL('.', import.meta.url));
const migrations = await readD1Migrations(
  `${serviceRoot}/migrations`,
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: `${serviceRoot}/wrangler.jsonc`,
      },
      miniflare: {
        d1Databases: ['DB'],
        bindings: {
          TEST_MIGRATIONS: migrations,
          REACTION_HMAC_SECRET:
            'test-only-secret-with-at-least-32-bytes',
        },
      },
    }),
  ],
  test: {
    include: ['services/reactions/test/**/*.test.ts'],
    setupFiles: ['services/reactions/test/setup.ts'],
  },
});
```

Create `services/reactions/test/setup.ts`:

```ts
import { env } from 'cloudflare:workers';
import {
  applyD1Migrations,
  type D1Migration,
} from 'cloudflare:test';
import { beforeEach } from 'vitest';
import type { Env as ReactionEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends ReactionEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  if (env.TEST_MIGRATIONS.length > 0) {
    await env.DB.prepare('DELETE FROM reactions').run();
  }
});
```

The Workers pool isolates storage per test file, not per individual test.
Keep the migration metadata table intact so `applyD1Migrations()` can skip
already-applied files, but clear application rows before each test. The
length guard preserves Task 4's intended RED state while the migrations
directory is still empty: the failing insert reaches the missing-table
assertion instead of failing in setup.

Create `services/reactions/test/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": [
      "@cloudflare/workers-types",
      "@cloudflare/vitest-pool-workers/types",
      "vitest/globals",
      "node"
    ]
  },
  "include": [
    "../src/**/*.ts",
    "../vitest.config.ts",
    "./**/*.ts",
    "../../../src/lib/reactions/**/*.ts"
  ]
}
```

Create the intentional typed stub at `services/reactions/src/index.ts` before
running any bundle command:

```ts
import type { Env } from './env';

const worker: ExportedHandler<Env> = {
  fetch() {
    return new Response('Reaction service is not ready', { status: 503 });
  },
};

export default worker;
```

Task 9 replaces this entire stub after route tests are RED.

- [ ] **Step 4: Write the failing local D1 migration test**

Create the migration directory before Vitest evaluates its configuration:

```bash
mkdir -p services/reactions/migrations
```

Create `services/reactions/test/migration.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';

it('applies the reactions table and composite uniqueness', async () => {
  const insert = env.DB.prepare(`
    INSERT INTO reactions (target_id, emoji, visitor_hash)
    VALUES (?, ?, ?)
  `).bind('work:samsung-metrics', '👍', 'visitor-a');

  await insert.run();
  await expect(insert.run()).rejects.toThrow();

  const row = await env.DB.prepare(`
    SELECT target_id, emoji, visitor_hash
    FROM reactions
  `).first();
  expect(row).toEqual({
    target_id: 'work:samsung-metrics',
    emoji: '👍',
    visitor_hash: 'visitor-a',
  });
});

it('starts the next test with no application rows', async () => {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM reactions
  `).first<{ count: number }>();

  expect(row?.count).toBe(0);
});
```

- [ ] **Step 5: Run the migration test and verify RED**

```bash
npm run test:worker -- services/reactions/test/migration.test.ts
```

Expected: FAIL because `reactions` does not exist; the empty migrations
directory lets the test reach the intended SQL assertion.

- [ ] **Step 6: Create the additive migration and activate every verification gate**

Create `services/reactions/migrations/0001_create_reactions.sql`:

```sql
CREATE TABLE reactions (
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (target_id, emoji, visitor_hash)
);

CREATE INDEX reactions_target_emoji
  ON reactions (target_id, emoji);
```

Never edit this migration after it is applied remotely. Future schema changes
must be new, additive migration files.

Update `package.json`:

```json
{
  "verify": "npm test && npm run test:frontend && npm run test:worker && npm run reactions:typecheck && npm run typecheck:site && npm run reactions:dry-run && npm run validate:content && npm run build && npm run test:site"
}
```

- [ ] **Step 7: Run the migration test and all new gates GREEN**

Run:

```bash
npm run test:worker -- services/reactions/test/migration.test.ts
npm run reactions:typecheck
npm run typecheck:site
npm run reactions:dry-run
```

Expected: the migration test passes in the Workers runtime with local D1,
both production and test/config typechecks pass, Astro typecheck passes, and
Wrangler bundles the intentional stub without deploying.

- [ ] **Step 8: Commit the Worker foundation**

```bash
git add .gitignore package.json package-lock.json services/reactions
git commit -m "feat: scaffold reactions worker and d1 schema"
```

Expected: no production database identifier or secret appears in the diff.

### Task 5: Enforce bounded JSON, exact CORS, and strict request validation

**Files:**

- Create: `services/reactions/src/http.ts`
- Create: `services/reactions/src/cors.ts`
- Create: `services/reactions/src/validation.ts`
- Create: `services/reactions/test/cors.test.ts`
- Create: `services/reactions/test/validation.test.ts`

- [ ] **Step 1: Write the failing CORS tests**

Create `services/reactions/test/cors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  getAllowedOrigin,
  handlePreflight,
} from '../src/cors';

const allowedOrigins = [
  'https://kybee.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

function preflight(options: {
  headers?: string;
  method?: string;
  origin?: string;
  path?: string;
} = {}): Request {
  const headers = new Headers({
    Origin: options.origin ?? 'https://kybee.github.io',
  });
  if (options.method !== undefined) {
    headers.set(
      'Access-Control-Request-Method',
      options.method,
    );
  }
  if (options.headers !== undefined) {
    headers.set(
      'Access-Control-Request-Headers',
      options.headers,
    );
  }
  return new Request(
    `https://api.example${
      options.path ?? '/v1/reactions/bootstrap'
    }`,
    { method: 'OPTIONS', headers },
  );
}

describe('CORS origins', () => {
  it.each(allowedOrigins)('accepts exact origin %s', (origin) => {
    const request = new Request(
      'https://api.example/v1/reactions/bootstrap',
      { headers: { Origin: origin } },
    );
    expect(getAllowedOrigin(request)).toBe(origin);
  });

  it.each([
    undefined,
    'https://evil.example',
    'https://kybee.github.io.evil.example',
    'https://kybee.github.io/',
    'HTTP://localhost:4321',
  ])('rejects origin %s', (origin) => {
    const headers = new Headers();
    if (origin !== undefined) {
      headers.set('Origin', origin);
    }
    const request = new Request(
      'https://api.example/v1/reactions/bootstrap',
      { headers },
    );
    expect(() => getAllowedOrigin(request)).toThrowError(
      expect.objectContaining({
        code: 'forbidden_origin',
        status: 403,
      }),
    );
  });
});

describe('CORS preflight', () => {
  it('returns a bodyless exact bootstrap preflight', async () => {
    const response = handlePreflight(preflight({
      method: 'POST',
      headers: 'content-type, authorization',
    }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get(
      'Access-Control-Allow-Origin',
    )).toBe('https://kybee.github.io');
    expect(response.headers.get(
      'Access-Control-Allow-Methods',
    )).toBe('POST, PUT, OPTIONS');
    expect(response.headers.get(
      'Access-Control-Allow-Headers',
    )).toBe('Authorization, Content-Type');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Cache-Control')).toBe(
      'no-store',
    );
  });

  it('accepts the exact mutation preflight', () => {
    const response = handlePreflight(preflight({
      path: '/v1/reactions',
      method: 'PUT',
      headers: 'Authorization, Content-Type',
    }));
    expect(response.status).toBe(204);
  });

  it.each([
    {
      name: 'PUT on bootstrap',
      path: '/v1/reactions/bootstrap',
      method: 'PUT',
      headers: 'content-type',
    },
    {
      name: 'POST on mutation',
      path: '/v1/reactions',
      method: 'POST',
      headers: 'content-type',
    },
    {
      name: 'an unknown path',
      path: '/v1/unknown',
      method: 'POST',
      headers: 'content-type',
    },
    {
      name: 'a missing requested method',
      path: '/v1/reactions/bootstrap',
      method: undefined,
      headers: 'content-type',
    },
    {
      name: 'a custom header',
      path: '/v1/reactions/bootstrap',
      method: 'POST',
      headers: 'content-type, x-custom-header',
    },
    {
      name: 'an empty header token',
      path: '/v1/reactions/bootstrap',
      method: 'POST',
      headers: 'content-type,,authorization',
    },
    {
      name: 'a missing requested-header list',
      path: '/v1/reactions/bootstrap',
      method: 'POST',
      headers: undefined,
    },
  ])('rejects $name', (testCase) => {
    expect(() => handlePreflight(preflight(testCase)))
      .toThrowError(expect.objectContaining({
        code: 'invalid_request',
        status: 400,
      }));
  });
});
```

- [ ] **Step 2: Write the failing JSON and contract parser tests**

Create `services/reactions/test/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_JSON_BYTES,
  readJsonObject,
} from '../src/http';
import {
  parseBearerToken,
  parseBootstrapRequest,
  parseSetReactionRequest,
} from '../src/validation';

function requestWithBody(
  body: BodyInit,
  contentType?: string,
): Request {
  const headers = new Headers();
  if (contentType !== undefined) {
    headers.set('Content-Type', contentType);
  }
  return new Request('https://api.example/v1/reactions', {
    method: 'POST',
    headers,
    body,
  });
}

function expectInvalidBootstrap(body: unknown): void {
  expect(() => parseBootstrapRequest(
    body as Record<string, unknown>,
  )).toThrowError(expect.objectContaining({
    code: 'invalid_request',
    status: 400,
  }));
}

function expectInvalidMutation(body: unknown): void {
  expect(() => parseSetReactionRequest(
    body as Record<string, unknown>,
  )).toThrowError(expect.objectContaining({
    code: 'invalid_request',
    status: 400,
  }));
}

describe('bootstrap validation', () => {
  it('deduplicates valid targets in first-seen order', () => {
    expect(parseBootstrapRequest({
      targets: ['work:a', 'side:b', 'work:a'],
    })).toEqual({ targets: ['work:a', 'side:b'] });
  });

  it.each([
    null,
    [],
    {},
    { targets: [] },
    { targets: ['bad'] },
    { targets: [1] },
    { targets: ['work:a'], extra: true },
    {
      targets: Array.from(
        { length: 101 },
        (_, index) => `work:x-${index}`,
      ),
    },
  ])('rejects invalid bootstrap body %#', (body) => {
    expectInvalidBootstrap(body);
  });
});

describe('set-reaction validation', () => {
  it('accepts desired-state writes', () => {
    expect(parseSetReactionRequest({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    })).toEqual({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    });
  });

  it.each([
    {
      targetId: 'not-a-target',
      emoji: '🔥',
      active: true,
    },
    {
      targetId: 'side:booster',
      emoji: '💯',
      active: true,
    },
    {
      targetId: 'side:booster',
      emoji: '🔥',
      active: 'true',
    },
    {
      targetId: 'side:booster',
      emoji: '🔥',
    },
    {
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
      extra: 1,
    },
  ])('rejects invalid mutation body %#', (body) => {
    expectInvalidMutation(body);
  });
});

describe('Bearer parsing', () => {
  it('accepts exactly one case-sensitive Bearer token', () => {
    expect(parseBearerToken(
      'Bearer v1.payload.signature',
    )).toBe('v1.payload.signature');
  });

  it.each([
    null,
    '',
    'Basic abc',
    'bearer abc',
    'Bearer',
    'Bearer one two',
    'Bearer  two',
  ])('rejects authorization value %s', (value) => {
    expect(() => parseBearerToken(value)).toThrowError(
      expect.objectContaining({
        code: 'invalid_token',
        status: 401,
      }),
    );
  });
});

describe('bounded JSON reader', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
  ])('accepts content type %s', async (contentType) => {
    await expect(readJsonObject(requestWithBody(
      '{"targetId":"work:a"}',
      contentType,
    ))).resolves.toEqual({ targetId: 'work:a' });
  });

  it.each([
    undefined,
    'text/plain',
    'application/jsonp',
  ])('rejects content type %s', async (contentType) => {
    await expect(readJsonObject(requestWithBody(
      '{}',
      contentType,
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('rejects malformed UTF-8', async () => {
    const malformed = Uint8Array.from([
      0x7b, 0x22, 0x78, 0x22, 0x3a,
      0x22, 0xc3, 0x28, 0x22, 0x7d,
    ]);
    await expect(readJsonObject(requestWithBody(
      malformed,
      'application/json',
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('rejects malformed JSON', async () => {
    await expect(readJsonObject(requestWithBody(
      '{"targetId":',
      'application/json',
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it.each([
    '[]',
    'null',
    'true',
    '"text"',
    '1',
  ])('rejects non-object JSON %s', async (body) => {
    await expect(readJsonObject(requestWithBody(
      body,
      'application/json',
    ))).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('accepts exactly 16,384 UTF-8 bytes', async () => {
    const body = JSON.stringify({
      value: 'x'.repeat(MAX_JSON_BYTES - 12),
    });
    expect(new TextEncoder().encode(body).byteLength).toBe(
      MAX_JSON_BYTES,
    );
    const parsed = await readJsonObject(requestWithBody(
      body,
      'application/json',
    ));
    expect((parsed.value as string).length).toBe(
      MAX_JSON_BYTES - 12,
    );
  });

  it('cancels and rejects at 16,385 bytes despite Content-Length', async () => {
    let canceled = false;
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(new Uint8Array(MAX_JSON_BYTES));
          return;
        }
        controller.enqueue(Uint8Array.of(0x20));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request(
      'https://api.example/v1/reactions',
      {
        method: 'POST',
        headers: {
          'Content-Length': '1',
          'Content-Type': 'application/json',
        },
        body: stream,
      },
    );

    await expect(readJsonObject(request)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
    expect(canceled).toBe(true);
  });
});
```

- [ ] **Step 3: Run RED**

```bash
npm run test:worker -- \
  services/reactions/test/cors.test.ts \
  services/reactions/test/validation.test.ts
```

Expected: FAIL because the HTTP, CORS, and validation modules do not exist.

- [ ] **Step 4: Implement the shared HTTP error and bounded reader**

Create `services/reactions/src/http.ts` with this public shape:

```ts
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
      await reader.cancel();
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
```

- [ ] **Step 5: Implement exact CORS/preflight checks**

Create `services/reactions/src/cors.ts`:

```ts
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
```

The top-level Worker in Task 9 must catch `ApiError` thrown by preflight and
attach CORS headers only when the request origin itself was valid.

- [ ] **Step 6: Implement strict runtime parsers**

Create `services/reactions/src/validation.ts`. Export:

```ts
import {
  MAX_BOOTSTRAP_TARGETS,
  REACTION_EMOJIS,
  type BootstrapRequest,
  type ReactionEmoji,
  type ReactionTargetId,
  type SetReactionRequest,
} from '../../../src/lib/reactions/contracts';
import { assertReactionTargetId } from '../../../src/lib/reactions/targets';
import { ApiError } from './http';

const emojiSet = new Set<string>(REACTION_EMOJIS);

function invalid(message: string): never {
  throw new ApiError(400, 'invalid_request', message);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function parseTarget(value: unknown): ReactionTargetId {
  if (typeof value !== 'string') {
    return invalid('Reaction target must be a string');
  }
  try {
    assertReactionTargetId(value);
  } catch {
    return invalid('Reaction target is invalid');
  }
  return value;
}

export function parseBootstrapRequest(
  value: Record<string, unknown>,
): BootstrapRequest {
  if (!hasExactKeys(value, ['targets']) || !Array.isArray(value.targets)) {
    return invalid('Bootstrap body must contain only targets');
  }

  const targets = new Set<ReactionTargetId>();
  for (const target of value.targets) {
    targets.add(parseTarget(target));
  }
  if (targets.size === 0 || targets.size > MAX_BOOTSTRAP_TARGETS) {
    return invalid('Bootstrap must contain 1 to 100 unique targets');
  }
  return { targets: [...targets] };
}

export function parseSetReactionRequest(
  value: Record<string, unknown>,
): SetReactionRequest {
  if (!hasExactKeys(value, ['targetId', 'emoji', 'active'])) {
    return invalid('Reaction body has unexpected fields');
  }

  const targetId = parseTarget(value.targetId);
  if (typeof value.emoji !== 'string' || !emojiSet.has(value.emoji)) {
    return invalid('Reaction emoji is invalid');
  }
  if (typeof value.active !== 'boolean') {
    return invalid('Reaction active state must be boolean');
  }

  return {
    targetId,
    emoji: value.emoji as ReactionEmoji,
    active: value.active,
  };
}

export function parseBearerToken(value: string | null): string {
  const match = value === null ? null : /^Bearer ([^\s]+)$/.exec(value);
  if (!match) {
    throw new ApiError(401, 'invalid_token', 'Invalid visitor token');
  }
  return match[1];
}
```

The final cast applies only after membership validation; it is not being used
as runtime validation.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm run test:worker -- \
  services/reactions/test/cors.test.ts \
  services/reactions/test/validation.test.ts
npm run reactions:typecheck
git add services/reactions/src services/reactions/test
git commit -m "feat: validate reaction http requests"
```

Expected: every CORS/body/parser branch passes.

### Task 6: Issue, verify, and hash anonymous visitor tokens

**Files:**

- Create: `services/reactions/src/token.ts`
- Create: `services/reactions/test/token.test.ts`

- [ ] **Step 1: Write the complete token tests before implementation**

Create `services/reactions/test/token.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
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

function changedFirstCharacter(value: string): string {
  const first = value.charAt(0) === 'A' ? 'B' : 'A';
  return `${first}${value.slice(1)}`;
}

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
    const verified = await verifyVisitorToken(
      secret,
      issued.token,
    );
    expect(verified.visitorHash).toBe(issued.visitorHash);
    expect(verified.visitorHash).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it.each([
    'v2.payload.signature',
    'v1.short.signature',
    'v1.payload.signature.extra',
    'v1.===========================================.bad',
    `v1.${'A'.repeat(43)}.${'A'.repeat(42)}`,
  ])('rejects malformed token %s', async (token) => {
    await expect(
      verifyVisitorToken(secret, token),
    ).rejects.toMatchObject({
      status: 401,
      code: 'invalid_token',
    });
  });

  it.each(['payload', 'signature'])(
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
      ).rejects.toMatchObject({
        code: 'invalid_token',
        status: 401,
      });
    },
  );

  it('rejects a signature made with another secret', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );
    await expect(
      verifyVisitorToken(otherSecret, issued.token),
    ).rejects.toMatchObject({
      code: 'invalid_token',
      status: 401,
    });
  });

  it('rejects padded non-canonical base64url', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );
    const segments = issued.token.split('.');
    await expect(verifyVisitorToken(
      secret,
      `${segments[0]}.${segments[1]}=.${segments[2]}`,
    )).rejects.toMatchObject({
      code: 'invalid_token',
      status: 401,
    });
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

  it('uses crypto.subtle.verify for signature verification', async () => {
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
    verifySpy.mockRestore();
  });
});

describe('HMAC configuration', () => {
  it('rejects a short secret while issuing a token', async () => {
    await expect(issueVisitorToken(
      'short-secret',
      () => visitorBytes,
    )).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });

  it('rejects a short secret while verifying a token', async () => {
    const issued = await issueVisitorToken(
      secret,
      () => visitorBytes,
    );
    await expect(
      verifyVisitorToken('short-secret', issued.token),
    ).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });

  it('rejects a short secret while deriving an issue key', async () => {
    await expect(createIssueRateLimitKey(
      'short-secret',
      '203.0.113.4',
    )).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });

  it('rejects random sources that do not return 32 bytes', async () => {
    await expect(issueVisitorToken(
      secret,
      () => new Uint8Array(31),
    )).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });
});

describe('token-issue rate-limit keys', () => {
  it('derives an opaque issue key without returning the raw IP', async () => {
    const key = await createIssueRateLimitKey(secret, '203.0.113.4');
    expect(key).toMatch(/^issue:[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain('203.0.113.4');
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
    ).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });
});
```

There is intentionally no expiry test: the approved anonymous token does not
expire. Secret rotation invalidates identity and must not be routine.

- [ ] **Step 2: Run RED**

```bash
npm run test:worker -- services/reactions/test/token.test.ts
```

Expected: FAIL because `token.ts` is missing.

- [ ] **Step 3: Implement the exact token envelope**

Create `services/reactions/src/token.ts` with these constants and labels:

```ts
import { ApiError } from './http';

const TOKEN_VERSION = 'v1';
const TOKEN_LABEL = 'visitor-token:v1\0';
const ISSUE_LABEL = 'issue-ip\0';
const TOKEN_BYTES = 32;
const BASE64URL_SHA256_LENGTH = 43;

export interface VisitorIdentity {
  token: string;
  visitorHash: string;
}

const textEncoder = new TextEncoder();

function internalConfigurationError(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'The reaction service is not configured',
  );
}

function invalidToken(): ApiError {
  return new ApiError(401, 'invalid_token', 'Invalid visitor token');
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + 0x8000),
    );
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function decodeCanonicalBase64Url(
  value: string,
  expectedLength: number,
): Uint8Array {
  if (
    value.length !== expectedLength ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw invalidToken();
  }

  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(
      value.replace(/-/g, '+').replace(/_/g, '/') + padding,
    );
  } catch {
    throw invalidToken();
  }

  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  if (encodeBase64Url(bytes) !== value) {
    throw invalidToken();
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const secretBytes = textEncoder.encode(secret);
  if (secretBytes.byteLength < 32) {
    throw internalConfigurationError();
  }
  return crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(
  key: CryptoKey,
  value: string,
): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)),
  );
}

async function hashVisitor(bytes: Uint8Array): Promise<string> {
  return encodeBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  );
}

function defaultRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function issueVisitorToken(
  secret: string,
  randomBytes: () => Uint8Array = defaultRandomBytes,
): Promise<VisitorIdentity> {
  const visitorBytes = randomBytes();
  if (visitorBytes.byteLength !== TOKEN_BYTES) {
    throw internalConfigurationError();
  }

  const payload = encodeBase64Url(visitorBytes);
  const key = await importHmacKey(secret);
  const signature = encodeBase64Url(
    await sign(key, `${TOKEN_LABEL}${payload}`),
  );
  return {
    token: `${TOKEN_VERSION}.${payload}.${signature}`,
    visitorHash: await hashVisitor(visitorBytes),
  };
}

export async function verifyVisitorToken(
  secret: string,
  token: string,
): Promise<{ visitorHash: string }> {
  const segments = token.split('.');
  if (
    segments.length !== 3 ||
    segments[0] !== TOKEN_VERSION ||
    segments[1].length !== BASE64URL_SHA256_LENGTH ||
    segments[2].length !== BASE64URL_SHA256_LENGTH
  ) {
    throw invalidToken();
  }

  const visitorBytes = decodeCanonicalBase64Url(
    segments[1],
    BASE64URL_SHA256_LENGTH,
  );
  const signature = decodeCanonicalBase64Url(
    segments[2],
    BASE64URL_SHA256_LENGTH,
  );
  if (visitorBytes.byteLength !== TOKEN_BYTES || signature.byteLength !== 32) {
    throw invalidToken();
  }

  const key = await importHmacKey(secret);
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    textEncoder.encode(`${TOKEN_LABEL}${segments[1]}`),
  );
  if (!verified) {
    throw invalidToken();
  }
  return { visitorHash: await hashVisitor(visitorBytes) };
}

export async function createIssueRateLimitKey(
  secret: string,
  ip: string,
): Promise<string> {
  if (ip.length === 0) {
    throw internalConfigurationError();
  }
  const key = await importHmacKey(secret);
  return `issue:${encodeBase64Url(await sign(key, `${ISSUE_LABEL}${ip}`))}`;
}
```

Use browser/Worker APIs only; do not import Node `Buffer` or a crypto package.
The only spreads above operate on chunks capped at 32 KiB and therefore do not
overflow the argument limit.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:worker -- services/reactions/test/token.test.ts
npm run reactions:typecheck
git add services/reactions/src/token.ts services/reactions/test/token.test.ts
git commit -m "feat: sign anonymous reaction visitors"
```

Expected: all token and rate-key tests pass without exposing raw identities.

### Task 7: Validate and cache the deployed target manifest fail-closed

**Files:**

- Create: `services/reactions/src/manifest.ts`
- Create: `services/reactions/test/manifest.test.ts`

- [ ] **Step 1: Write the manifest verifier tests**

Create `services/reactions/test/manifest.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createManifestVerifier } from '../src/manifest';

const manifestUrl =
  'https://kybee.github.io/reaction-targets.json';
const validManifest = {
  version: 1,
  targets: ['side:booster', 'work:samsung-metrics'],
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asFetch(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe('manifest fetching and validation', () => {
  it('caches a copied membership set without exposing mutation', async () => {
    const source = {
      version: 1,
      targets: ['side:booster', 'work:samsung-metrics'],
    };
    const fetchImpl = vi.fn(asFetch(async () =>
      jsonResponse(source)
    ));
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl,
      now: () => 0,
    });

    await verifier.assertKnown(['side:booster']);
    source.targets.push('work:added-after-fetch');
    await expect(verifier.assertKnown([
      'work:added-after-fetch',
    ])).rejects.toMatchObject({
      code: 'target_not_found',
      status: 404,
    });
    await expect(verifier.assertKnown([
      'work:samsung-metrics',
    ])).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses fail-closed fetch options', async () => {
    const fetchImpl = vi.fn(asFetch(async () =>
      jsonResponse(validManifest)
    ));
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl,
      now: () => 0,
    });
    await verifier.assertKnown(['side:booster']);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(manifestUrl),
      {
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
    );
  });

  it('reuses through 299,999 ms and refreshes at 300,000 ms', async () => {
    let now = 0;
    const fetchImpl = vi.fn(asFetch(async () =>
      jsonResponse(validManifest)
    ));
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl,
      now: () => now,
    });
    await verifier.assertKnown(['side:booster']);
    now = 299_999;
    await verifier.assertKnown(['side:booster']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 300_000;
    await verifier.assertKnown(['side:booster']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight refresh between callers', async () => {
    let now = 0;
    let calls = 0;
    const refresh = deferred<Response>();
    const fetchImpl = vi.fn(asFetch(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(validManifest)
        : refresh.promise;
    }));
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl,
      now: () => now,
    });
    await verifier.assertKnown(['side:booster']);
    now = 300_000;
    const first = verifier.assertKnown(['side:booster']);
    const second = verifier.assertKnown([
      'work:samsung-metrics',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    refresh.resolve(jsonResponse(validManifest));
    await expect(Promise.all([first, second]))
      .resolves.toEqual([undefined, undefined]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not serve stale data after a failed refresh', async () => {
    let now = 0;
    let calls = 0;
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: asFetch(async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(validManifest)
          : jsonResponse({ error: true }, 503);
      }),
      now: () => now,
    });
    await verifier.assertKnown(['side:booster']);
    now = 300_000;
    await expect(verifier.assertKnown([
      'side:booster',
    ])).rejects.toMatchObject({
      code: 'manifest_unavailable',
      status: 503,
    });
  });

  it('does not cache a failed first fetch', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(asFetch(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: true }, 502)
        : jsonResponse(validManifest);
    }));
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl,
      now: () => 0,
    });
    await expect(verifier.assertKnown([
      'side:booster',
    ])).rejects.toMatchObject({
      code: 'manifest_unavailable',
      status: 503,
    });
    await expect(verifier.assertKnown([
      'side:booster',
    ])).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an HTTP URL without fetching it', async () => {
    const fetchImpl = vi.fn(asFetch(async () =>
      jsonResponse(validManifest)
    ));
    const verifier = createManifestVerifier({
      manifestUrl:
        'http://kybee.github.io/reaction-targets.json',
      fetchImpl,
    });
    await expect(verifier.assertKnown([
      'side:booster',
    ])).rejects.toMatchObject({
      code: 'manifest_unavailable',
      status: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-2xx response', jsonResponse(validManifest, 500)],
    ['malformed JSON', new Response('{', { status: 200 })],
    ['a primitive', jsonResponse(null)],
    ['the wrong version', jsonResponse({
      version: 2,
      targets: validManifest.targets,
    })],
    ['extra keys', jsonResponse({
      version: 1,
      targets: validManifest.targets,
      generatedAt: '2026-07-26',
    })],
    ['a non-array target collection', jsonResponse({
      version: 1,
      targets: 'side:booster',
    })],
    ['a non-string target', jsonResponse({
      version: 1,
      targets: [1],
    })],
    ['an invalid target ID', jsonResponse({
      version: 1,
      targets: ['invalid'],
    })],
    ['duplicate targets', jsonResponse({
      version: 1,
      targets: ['side:booster', 'side:booster'],
    })],
    ['unsorted targets', jsonResponse({
      version: 1,
      targets: ['work:samsung-metrics', 'side:booster'],
    })],
    ['more than 100 targets', jsonResponse({
      version: 1,
      targets: Array.from(
        { length: 101 },
        (_, index) =>
          `work:project-${index.toString().padStart(3, '0')}`,
      ),
    })],
  ] as const)(
    'maps %s to manifest_unavailable',
    async (_name, response) => {
      const verifier = createManifestVerifier({
        manifestUrl,
        fetchImpl: asFetch(async () => response.clone()),
      });
      await expect(verifier.assertKnown([
        'side:booster',
      ])).rejects.toMatchObject({
        code: 'manifest_unavailable',
        status: 503,
      });
    },
  );

  it('returns 404 for a validly shaped absent target', async () => {
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl: asFetch(async () =>
        jsonResponse(validManifest)
      ),
    });
    await expect(verifier.assertKnown([
      'work:not-deployed',
    ])).rejects.toMatchObject({
      code: 'target_not_found',
      status: 404,
    });
  });

  it('accepts a deleted target only until cache expiry', async () => {
    let now = 0;
    let calls = 0;
    const fetchImpl = vi.fn(asFetch(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(validManifest)
        : jsonResponse({
          version: 1,
          targets: ['work:samsung-metrics'],
        });
    }));
    const verifier = createManifestVerifier({
      manifestUrl,
      fetchImpl,
      now: () => now,
    });
    await verifier.assertKnown(['side:booster']);
    now = 299_999;
    await expect(verifier.assertKnown([
      'side:booster',
    ])).resolves.toBeUndefined();
    now = 300_000;
    await expect(verifier.assertKnown([
      'side:booster',
    ])).rejects.toMatchObject({
      code: 'target_not_found',
      status: 404,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:worker -- services/reactions/test/manifest.test.ts
```

Expected: FAIL because `manifest.ts` is missing.

- [ ] **Step 3: Implement an injectable five-minute verifier**

Create `services/reactions/src/manifest.ts` with:

```ts
import {
  MAX_BOOTSTRAP_TARGETS,
  type ReactionTargetId,
} from '../../../src/lib/reactions/contracts';
import { assertReactionTargetId } from '../../../src/lib/reactions/targets';
import { ApiError } from './http';

const MANIFEST_TTL_MS = 300_000;

export interface ManifestVerifier {
  assertKnown(targets: readonly ReactionTargetId[]): Promise<void>;
}

interface CachedManifest {
  expiresAt: number;
  targets: ReadonlySet<ReactionTargetId>;
}

function manifestUnavailable(): ApiError {
  return new ApiError(
    503,
    'manifest_unavailable',
    'The reaction target list is unavailable',
  );
}

function targetNotFound(): ApiError {
  return new ApiError(
    404,
    'target_not_found',
    'Reaction target was not found',
  );
}

function parseManifest(value: unknown): ReadonlySet<ReactionTargetId> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw manifestUnavailable();
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== 'targets' ||
    keys[1] !== 'version' ||
    record.version !== 1 ||
    !Array.isArray(record.targets)
  ) {
    throw manifestUnavailable();
  }

  const targets: ReactionTargetId[] = [];
  for (const valueTarget of record.targets) {
    if (typeof valueTarget !== 'string') {
      throw manifestUnavailable();
    }
    try {
      assertReactionTargetId(valueTarget);
    } catch {
      throw manifestUnavailable();
    }
    const previous = targets.at(-1);
    if (previous !== undefined && previous >= valueTarget) {
      throw manifestUnavailable();
    }
    targets.push(valueTarget);
  }
  if (targets.length > MAX_BOOTSTRAP_TARGETS) {
    throw manifestUnavailable();
  }
  return new Set(targets);
}

export function createManifestVerifier(options: {
  manifestUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): ManifestVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cache: CachedManifest | undefined;
  let refreshPromise: Promise<CachedManifest> | undefined;

  async function refresh(): Promise<CachedManifest> {
    let url: URL;
    try {
      url = new URL(options.manifestUrl);
    } catch {
      throw manifestUnavailable();
    }
    if (url.protocol !== 'https:') {
      throw manifestUnavailable();
    }

    let response: Response;
    try {
      const requestInit = {
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      } as const;
      response = await fetchImpl(url, requestInit);
    } catch {
      throw manifestUnavailable();
    }
    if (!response.ok) {
      throw manifestUnavailable();
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw manifestUnavailable();
    }
    const nextCache = {
      expiresAt: now() + MANIFEST_TTL_MS,
      targets: parseManifest(value),
    };
    cache = nextCache;
    return nextCache;
  }

  async function current(): Promise<CachedManifest> {
    if (cache && now() < cache.expiresAt) {
      return cache;
    }
    if (!refreshPromise) {
      refreshPromise = refresh().finally(() => {
        refreshPromise = undefined;
      });
    }
    return refreshPromise;
  }

  return {
    async assertKnown(targets) {
      const manifest = await current();
      for (const target of targets) {
        if (!manifest.targets.has(target)) {
          throw targetNotFound();
        }
      }
    },
  };
}
```

Create only one verifier per Worker isolate in Task 9; do not create a fresh
cache for every request.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:worker -- services/reactions/test/manifest.test.ts
npm run reactions:typecheck
git add services/reactions/src/manifest.ts \
  services/reactions/test/manifest.test.ts
git commit -m "feat: validate deployed reaction targets"
```

Expected: cache timing, concurrent refresh, deletion, 404, and fail-closed 503
tests all pass.

### Task 8: Implement zero-filled bootstrap and atomic idempotent D1 writes

**Files:**

- Create: `services/reactions/src/repository.ts`
- Create: `services/reactions/test/repository.test.ts`

- [ ] **Step 1: Write repository integration tests against local D1**

Create `services/reactions/test/repository.test.ts`. These tests use the
migrated local D1 binding directly and do not mock SQL:

```ts
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  bootstrapReactions,
  setReaction,
} from '../src/repository';

async function insertReaction(
  targetId: string,
  emoji: string,
  visitorHash: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO reactions (target_id, emoji, visitor_hash)
    VALUES (?, ?, ?)
  `).bind(targetId, emoji, visitorHash).run();
}

async function reactionRows(): Promise<Array<{
  emoji: string;
  target_id: string;
  visitor_hash: string;
}>> {
  const result = await env.DB.prepare(`
    SELECT target_id, emoji, visitor_hash
    FROM reactions
    ORDER BY target_id, emoji, visitor_hash
  `).all<{
    emoji: string;
    target_id: string;
    visitor_hash: string;
  }>();
  return result.results;
}

describe('bootstrapReactions', () => {
  it('returns all four zero counts for every requested target', async () => {
    await expect(bootstrapReactions(
      env.DB,
      ['work:samsung-metrics', 'side:booster'],
      'visitor-a',
    )).resolves.toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
        selected: [],
      },
      'side:booster': {
        counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
        selected: [],
      },
    });
  });

  it('counts another visitor without selecting it', async () => {
    await insertReaction(
      'side:booster',
      '🎉',
      'visitor-other',
    );
    await expect(bootstrapReactions(
      env.DB,
      ['side:booster'],
      'visitor-current',
    )).resolves.toEqual({
      'side:booster': {
        counts: { '👍': 0, '🔥': 0, '🎉': 1, '👏': 0 },
        selected: [],
      },
    });
  });

  it('returns selections in approved emoji order', async () => {
    await insertReaction(
      'work:samsung-metrics',
      '🔥',
      'visitor-a',
    );
    await insertReaction(
      'work:samsung-metrics',
      '👍',
      'visitor-a',
    );
    await insertReaction(
      'work:samsung-metrics',
      '👏',
      'visitor-other',
    );
    await expect(bootstrapReactions(
      env.DB,
      ['work:samsung-metrics'],
      'visitor-a',
    )).resolves.toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 1, '🔥': 1, '🎉': 0, '👏': 1 },
        selected: ['👍', '🔥'],
      },
    });
  });

  it('returns only requested targets', async () => {
    await insertReaction('side:booster', '👍', 'visitor-a');
    await insertReaction(
      'work:samsung-metrics',
      '🔥',
      'visitor-a',
    );
    const snapshots = await bootstrapReactions(
      env.DB,
      ['work:samsung-metrics'],
      'visitor-a',
    );
    expect(snapshots).toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 0, '🔥': 1, '🎉': 0, '👏': 0 },
        selected: ['🔥'],
      },
    });
    expect(snapshots).not.toHaveProperty('side:booster');
  });
});

describe('setReaction', () => {
  it('keeps repeated active:true at one row and count one', async () => {
    const request = {
      targetId: 'side:booster' as const,
      emoji: '🔥' as const,
      active: true,
    };
    await expect(setReaction(
      env.DB,
      request,
      'visitor-a',
    )).resolves.toMatchObject({ active: true, count: 1 });
    await expect(setReaction(
      env.DB,
      request,
      'visitor-a',
    )).resolves.toMatchObject({ active: true, count: 1 });
    expect(await reactionRows()).toHaveLength(1);
  });

  it('keeps repeated active:false at count zero', async () => {
    await setReaction(env.DB, {
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    }, 'visitor-a');
    const remove = {
      targetId: 'side:booster' as const,
      emoji: '🔥' as const,
      active: false,
    };
    await expect(setReaction(
      env.DB,
      remove,
      'visitor-a',
    )).resolves.toMatchObject({ active: false, count: 0 });
    await expect(setReaction(
      env.DB,
      remove,
      'visitor-a',
    )).resolves.toMatchObject({ active: false, count: 0 });
    expect(await reactionRows()).toEqual([]);
  });

  it('stores different emoji as independent rows', async () => {
    await setReaction(env.DB, {
      targetId: 'work:samsung-metrics',
      emoji: '👍',
      active: true,
    }, 'visitor-a');
    await setReaction(env.DB, {
      targetId: 'work:samsung-metrics',
      emoji: '🔥',
      active: true,
    }, 'visitor-a');
    expect(await reactionRows()).toEqual([
      {
        target_id: 'work:samsung-metrics',
        emoji: '👍',
        visitor_hash: 'visitor-a',
      },
      {
        target_id: 'work:samsung-metrics',
        emoji: '🔥',
        visitor_hash: 'visitor-a',
      },
    ]);
  });

  it('counts two different visitors', async () => {
    const request = {
      targetId: 'side:booster' as const,
      emoji: '👏' as const,
      active: true,
    };
    await setReaction(env.DB, request, 'visitor-a');
    await expect(setReaction(
      env.DB,
      request,
      'visitor-b',
    )).resolves.toMatchObject({ active: true, count: 2 });
  });
});

it('rolls back the first statement when a D1 batch fails', async () => {
  const insert = env.DB.prepare(`
    INSERT INTO reactions (target_id, emoji, visitor_hash)
    VALUES (?, ?, ?)
  `).bind('work:samsung-metrics', '👍', 'visitor-a');
  const fail = env.DB.prepare(`
    INSERT INTO table_that_does_not_exist (value)
    VALUES (?)
  `).bind('force-rollback');

  await expect(env.DB.batch([insert, fail])).rejects.toThrow();
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM reactions
    WHERE target_id = ?
  `).bind('work:samsung-metrics').first<{ count: number }>();
  expect(row?.count).toBe(0);
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:worker -- services/reactions/test/repository.test.ts
```

Expected: FAIL because the repository module is missing.

- [ ] **Step 3: Implement bootstrap aggregation**

Create `services/reactions/src/repository.ts` and export:

```ts
import {
  REACTION_EMOJIS,
  createEmptyReactionCounts,
  type ReactionEmoji,
  type ReactionSnapshot,
  type ReactionTargetId,
  type SetReactionRequest,
  type SetReactionResponse,
} from '../../../src/lib/reactions/contracts';
import { ApiError } from './http';

interface AggregateRow {
  count: number | string;
  emoji: string;
  selected: number | string;
  target_id: string;
}

function internalDatabaseError(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'The reaction service could not read its data',
  );
}

function parseCount(value: unknown): number {
  const count =
    typeof value === 'string' && /^\d+$/u.test(value)
      ? Number(value)
      : value;
  if (
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw internalDatabaseError();
  }
  return count;
}

function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

export async function bootstrapReactions(
  db: D1Database,
  targets: readonly ReactionTargetId[],
  visitorHash: string,
): Promise<Record<ReactionTargetId, ReactionSnapshot>> {
  const snapshots = Object.fromEntries(
    targets.map((target) => [
      target,
      { counts: createEmptyReactionCounts(), selected: [] },
    ]),
  ) as Record<ReactionTargetId, ReactionSnapshot>;

  if (targets.length === 0) {
    return snapshots;
  }

  const targetPlaceholders = targets.map(() => '?').join(', ');
  const query = `
    SELECT
      target_id,
      emoji,
      COUNT(*) AS count,
      MAX(CASE WHEN visitor_hash = ? THEN 1 ELSE 0 END) AS selected
    FROM reactions
    WHERE target_id IN (${targetPlaceholders})
    GROUP BY target_id, emoji
    ORDER BY target_id, emoji
  `;
  const result = await db
    .prepare(query)
    .bind(visitorHash, ...targets)
    .all<AggregateRow>();

  for (const row of result.results) {
    const target = row.target_id as ReactionTargetId;
    const snapshot = snapshots[target];
    if (!snapshot || !isReactionEmoji(row.emoji)) {
      throw internalDatabaseError();
    }
    snapshot.counts[row.emoji] = parseCount(row.count);
    const selected = parseCount(row.selected);
    if (selected !== 0 && selected !== 1) {
      throw internalDatabaseError();
    }
    if (selected === 1) {
      snapshot.selected.push(row.emoji);
    }
  }

  for (const snapshot of Object.values(snapshots)) {
    snapshot.selected.sort(
      (left, right) =>
        REACTION_EMOJIS.indexOf(left) - REACTION_EMOJIS.indexOf(right),
    );
  }
  return snapshots;
}

export async function setReaction(
  db: D1Database,
  request: SetReactionRequest,
  visitorHash: string,
): Promise<SetReactionResponse> {
const mutation = request.active
  ? db.prepare(`
      INSERT OR IGNORE INTO reactions (target_id, emoji, visitor_hash)
      VALUES (?, ?, ?)
    `).bind(request.targetId, request.emoji, visitorHash)
  : db.prepare(`
      DELETE FROM reactions
      WHERE target_id = ? AND emoji = ? AND visitor_hash = ?
    `).bind(request.targetId, request.emoji, visitorHash);

const count = db.prepare(`
  SELECT COUNT(*) AS count
  FROM reactions
  WHERE target_id = ? AND emoji = ?
`).bind(request.targetId, request.emoji);

const [, countResult] = await db.batch([mutation, count]);

  const row = countResult.results[0] as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw internalDatabaseError();
  }
  return {
    ...request,
    count: parseCount(row.count),
  };
}
```

- [ ] **Step 4: Inspect the transaction boundary**

Confirm in the completed file that `db.batch([mutation, count])` is the only
mutation path and that no separate `run()` or `first()` call exists between
the write and count. This inspection is one action; the integration tests
prove the transaction behavior.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:worker -- services/reactions/test/repository.test.ts
npm run reactions:typecheck
git add services/reactions/src/repository.ts \
  services/reactions/test/repository.test.ts
git commit -m "feat: persist idempotent project reactions"
```

Expected: all real-D1 integration tests pass, including duplicate prevention
and rollback behavior.

### Task 9: Assemble the Worker routes, rate limits, and error mapping

**Files:**

- Create or replace: `services/reactions/src/index.ts`
- Create: `services/reactions/test/helpers.ts`
- Create: `services/reactions/test/worker.test.ts`

- [ ] **Step 1: Write end-to-end Worker tests with injected dependencies**

Create `services/reactions/test/helpers.ts`:

```ts
import { env as testBindings } from 'cloudflare:workers';
import { createExecutionContext } from 'cloudflare:test';
import type { Env } from '../src/env';

export const TEST_ORIGIN = 'https://kybee.github.io';
export const TEST_SECRET =
  '0123456789abcdef0123456789abcdef';
export const TEST_MANIFEST_URL =
  'https://kybee.github.io/reaction-targets.json';
export const FIXED_VISITOR_BYTES = Uint8Array.from(
  { length: 32 },
  (_, index) => index,
);
export const VALID_MANIFEST = {
  version: 1,
  targets: ['side:booster', 'work:samsung-metrics'],
} as const;

export interface RecordingRateLimiter {
  binding: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  keys: string[];
}

export function createRateLimiter(
  success = true,
): RecordingRateLimiter {
  const keys: string[] = [];
  return {
    keys,
    binding: {
      async limit(options) {
        keys.push(options.key);
        return { success };
      },
    },
  };
}

export function createTestEnv(options: {
  db?: D1Database;
  issueLimiter?: RecordingRateLimiter;
  manifestUrl?: string;
  writeLimiter?: RecordingRateLimiter;
} = {}): {
  env: Env;
  issueLimiter: RecordingRateLimiter;
  writeLimiter: RecordingRateLimiter;
} {
  const issueLimiter =
    options.issueLimiter ?? createRateLimiter();
  const writeLimiter =
    options.writeLimiter ?? createRateLimiter();
  return {
    env: {
      DB: options.db ?? testBindings.DB,
      ISSUE_RATE_LIMITER: issueLimiter.binding,
      REACTION_HMAC_SECRET: TEST_SECRET,
      REACTION_TARGET_MANIFEST_URL:
        options.manifestUrl ?? TEST_MANIFEST_URL,
      WRITE_RATE_LIMITER: writeLimiter.binding,
    },
    issueLimiter,
    writeLimiter,
  };
}

export function createManifestFetch(
  manifest: unknown = VALID_MANIFEST,
  status = 200,
): {
  calls: Array<{ init?: RequestInit; url: string }>;
  fetchImpl: typeof fetch;
} {
  const calls: Array<{ init?: RequestInit; url: string }> = [];
  const implementation = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      input instanceof Request ? input.url : String(input);
    calls.push({ init, url });
    return new Response(JSON.stringify(manifest), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return {
    calls,
    fetchImpl: implementation as typeof fetch,
  };
}

export function jsonRequest(
  method: 'POST' | 'PUT',
  pathname: string,
  body: unknown,
  options: {
    authorization?: string;
    contentType?: string;
    ip?: string;
    origin?: string;
  } = {},
): Request {
  const headers = new Headers({
    'CF-Connecting-IP': options.ip ?? '203.0.113.4',
    'Content-Type':
      options.contentType ?? 'application/json',
    Origin: options.origin ?? TEST_ORIGIN,
  });
  if (options.authorization !== undefined) {
    headers.set('Authorization', options.authorization);
  }
  return new Request(`https://api.example${pathname}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

export async function dispatchWorker(
  worker: ExportedHandler<Env>,
  request: Request,
  bindings: Env,
): Promise<Response> {
  if (typeof worker.fetch !== 'function') {
    throw new TypeError('Expected a modules-format fetch handler');
  }
  return worker.fetch(
    request,
    bindings,
    createExecutionContext(),
  );
}

export async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
```

Create `services/reactions/test/worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type {
  ApiErrorResponse,
  BootstrapResponse,
  SetReactionResponse,
} from '../../../src/lib/reactions/contracts';
import { createReactionWorker } from '../src/index';
import { issueVisitorToken } from '../src/token';
import {
  FIXED_VISITOR_BYTES,
  TEST_ORIGIN,
  TEST_SECRET,
  VALID_MANIFEST,
  createManifestFetch,
  createRateLimiter,
  createTestEnv,
  dispatchWorker,
  jsonRequest,
  readJson,
} from './helpers';

function fixedRandomBytes(): Uint8Array {
  return FIXED_VISITOR_BYTES.slice();
}

async function signedToken(): Promise<string> {
  return (await issueVisitorToken(
    TEST_SECRET,
    fixedRandomBytes,
  )).token;
}

function expectJsonHeaders(
  response: Response,
  origin = TEST_ORIGIN,
): void {
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Content-Type')).toBe(
    'application/json; charset=utf-8',
  );
  expect(response.headers.get('Vary')).toBe('Origin');
  expect(response.headers.get(
    'Access-Control-Allow-Origin',
  )).toBe(origin);
}

describe('bootstrap route', () => {
  it('issues a token and returns exact zero-filled targets', async () => {
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    const worker = createReactionWorker({
      fetchImpl: manifest.fetchImpl,
      now: () => 0,
      randomBytes: fixedRandomBytes,
    });
    const response = await dispatchWorker(
      worker,
      jsonRequest('POST', '/v1/reactions/bootstrap', {
        targets: [
          'work:samsung-metrics',
          'side:booster',
        ],
      }),
      testEnv.env,
    );

    expect(response.status).toBe(200);
    expectJsonHeaders(response);
    const body = await readJson<BootstrapResponse>(response);
    expect(body.visitorToken).toMatch(
      /^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(body.reactions).toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
        selected: [],
      },
      'side:booster': {
        counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
        selected: [],
      },
    });
    expect(testEnv.issueLimiter.keys).toHaveLength(1);
    expect(testEnv.issueLimiter.keys[0]).toMatch(
      /^issue:[A-Za-z0-9_-]{43}$/,
    );
  });

  it('keeps a valid token and restores selections', async () => {
    const identity = await issueVisitorToken(
      TEST_SECRET,
      fixedRandomBytes,
    );
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    await testEnv.env.DB.prepare(`
      INSERT INTO reactions (target_id, emoji, visitor_hash)
      VALUES (?, ?, ?)
    `).bind(
      'side:booster',
      '🔥',
      identity.visitorHash,
    ).run();
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
      }),
      jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
        { authorization: `Bearer ${identity.token}` },
      ),
      testEnv.env,
    );

    expect(response.status).toBe(200);
    const body = await readJson<BootstrapResponse>(response);
    expect(body.visitorToken).toBe(identity.token);
    expect(body.reactions['side:booster']).toEqual({
      counts: { '👍': 0, '🔥': 1, '🎉': 0, '👏': 0 },
      selected: ['🔥'],
    });
    expect(testEnv.issueLimiter.keys).toEqual([]);
  });

  it('replaces a damaged token and applies the issue limit', async () => {
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    const damaged = `v1.${'A'.repeat(43)}.${'A'.repeat(43)}`;
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
        randomBytes: fixedRandomBytes,
      }),
      jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
        { authorization: `Bearer ${damaged}` },
      ),
      testEnv.env,
    );

    expect(response.status).toBe(200);
    const body = await readJson<BootstrapResponse>(response);
    expect(body.visitorToken).not.toBe(damaged);
    expect(testEnv.issueLimiter.keys).toHaveLength(1);
  });

  it('returns 429 when token issuance is denied', async () => {
    const manifest = createManifestFetch();
    const issueLimiter = createRateLimiter(false);
    const testEnv = createTestEnv({ issueLimiter });
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
        randomBytes: fixedRandomBytes,
      }),
      jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(429);
    expectJsonHeaders(response);
    expect(await readJson<ApiErrorResponse>(response))
      .toMatchObject({ error: { code: 'rate_limited' } });
    expect(manifest.calls).toHaveLength(0);
  });
});

describe('mutation route', () => {
  it('adds idempotently, then removes idempotently', async () => {
    const token = await signedToken();
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    const worker = createReactionWorker({
      fetchImpl: manifest.fetchImpl,
    });
    const authorization = `Bearer ${token}`;
    const add = {
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    };
    for (const expectedCount of [1, 1]) {
      const response = await dispatchWorker(
        worker,
        jsonRequest(
          'PUT',
          '/v1/reactions',
          add,
          { authorization },
        ),
        testEnv.env,
      );
      expect(response.status).toBe(200);
      expectJsonHeaders(response);
      expect(await readJson<SetReactionResponse>(response))
        .toMatchObject({ active: true, count: expectedCount });
    }

    const remove = {
      targetId: 'side:booster',
      emoji: '🔥',
      active: false,
    };
    for (const expectedCount of [0, 0]) {
      const response = await dispatchWorker(
        worker,
        jsonRequest(
          'PUT',
          '/v1/reactions',
          remove,
          { authorization },
        ),
        testEnv.env,
      );
      expect(await readJson<SetReactionResponse>(response))
        .toMatchObject({ active: false, count: expectedCount });
    }
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'Bearer v1.invalid.invalid'],
  ])('returns 401 for a %s token', async (_name, authorization) => {
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
      }),
      jsonRequest(
        'PUT',
        '/v1/reactions',
        {
          targetId: 'side:booster',
          emoji: '🔥',
          active: true,
        },
        { authorization },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(401);
    expectJsonHeaders(response);
    expect(await readJson<ApiErrorResponse>(response))
      .toMatchObject({ error: { code: 'invalid_token' } });
    expect(testEnv.writeLimiter.keys).toEqual([]);
  });

  it('rate-limits before manifest membership lookup', async () => {
    const manifest = createManifestFetch();
    const writeLimiter = createRateLimiter(false);
    const testEnv = createTestEnv({ writeLimiter });
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
      }),
      jsonRequest(
        'PUT',
        '/v1/reactions',
        {
          targetId: 'work:not-deployed',
          emoji: '🔥',
          active: true,
        },
        { authorization: `Bearer ${await signedToken()}` },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(429);
    expectJsonHeaders(response);
    expect(writeLimiter.keys[0]).toMatch(
      /^write:[A-Za-z0-9_-]{43}$/,
    );
    expect(manifest.calls).toHaveLength(0);
  });

  it('returns 404 for a validly shaped unknown target', async () => {
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
      }),
      jsonRequest(
        'PUT',
        '/v1/reactions',
        {
          targetId: 'work:not-deployed',
          emoji: '🔥',
          active: true,
        },
        { authorization: `Bearer ${await signedToken()}` },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(404);
    expectJsonHeaders(response);
    expect(await readJson<ApiErrorResponse>(response))
      .toMatchObject({ error: { code: 'target_not_found' } });
  });
});

describe('error mapping, preflight, and privacy', () => {
  it('returns 503 when the manifest is unavailable', async () => {
    const manifest = createManifestFetch({ error: true }, 503);
    const testEnv = createTestEnv();
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
        randomBytes: fixedRandomBytes,
      }),
      jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(503);
    expectJsonHeaders(response);
    expect(await readJson<ApiErrorResponse>(response))
      .toMatchObject({
        error: { code: 'manifest_unavailable' },
      });
  });

  it.each([
    ['missing', undefined],
    ['disallowed', 'https://evil.example'],
  ])('rejects a %s origin without granting CORS', async (_name, origin) => {
    const manifest = createManifestFetch();
    const testEnv = createTestEnv();
    const headers = new Headers({
      'Content-Type': 'application/json',
    });
    if (origin !== undefined) headers.set('Origin', origin);
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
      }),
      new Request(
        'https://api.example/v1/reactions/bootstrap',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            targets: ['side:booster'],
          }),
        },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(403);
    expect(response.headers.has(
      'Access-Control-Allow-Origin',
    )).toBe(false);
    expect(await readJson<ApiErrorResponse>(response))
      .toMatchObject({ error: { code: 'forbidden_origin' } });
  });

  it.each([
    [
      'unknown path',
      () => jsonRequest('POST', '/v1/unknown', {}),
      404,
    ],
    [
      'wrong bootstrap method',
      () => jsonRequest(
        'PUT',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
      ),
      400,
    ],
    [
      'wrong mutation method',
      () => jsonRequest('POST', '/v1/reactions', {}),
      400,
    ],
    [
      'wrong content type',
      () => jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
        { contentType: 'text/plain' },
      ),
      400,
    ],
    [
      'malformed body',
      () => new Request(
        'https://api.example/v1/reactions/bootstrap',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: TEST_ORIGIN,
          },
          body: '{"targets":',
        },
      ),
      400,
    ],
    [
      'oversized body',
      () => new Request(
        'https://api.example/v1/reactions/bootstrap',
        {
          method: 'POST',
          headers: {
            'Content-Length': '1',
            'Content-Type': 'application/json',
            Origin: TEST_ORIGIN,
          },
          body: JSON.stringify({
            padding: 'x'.repeat(16_385),
          }),
        },
      ),
      400,
    ],
  ] as const)(
    'returns bounded JSON for %s',
    async (_name, makeRequest, status) => {
      const manifest = createManifestFetch();
      const testEnv = createTestEnv();
      const response = await dispatchWorker(
        createReactionWorker({
          fetchImpl: manifest.fetchImpl,
        }),
        makeRequest(),
        testEnv.env,
      );
      expect(response.status).toBe(status);
      expectJsonHeaders(response);
      expect(await readJson<ApiErrorResponse>(response))
        .toMatchObject({ error: { code: 'invalid_request' } });
    },
  );

  it('maps repository exceptions to a generic 500', async () => {
    const brokenDb = {
      prepare() {
        throw new Error('private database connection detail');
      },
    } as unknown as D1Database;
    const manifest = createManifestFetch();
    const testEnv = createTestEnv({ db: brokenDb });
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
        randomBytes: fixedRandomBytes,
      }),
      jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(500);
    expectJsonHeaders(response);
    const body = await readJson<ApiErrorResponse>(response);
    expect(body).toEqual({
      error: {
        code: 'internal_error',
        message:
          'The reaction service could not complete the request',
      },
    });
    expect(JSON.stringify(body)).not.toContain('private database');
  });

  it('handles preflight without token, manifest, limiter, or D1 work', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('manifest fetch must not run');
    }) as unknown as typeof fetch;
    const issueLimiter = createRateLimiter(false);
    const writeLimiter = createRateLimiter(false);
    const brokenDb = new Proxy({} as D1Database, {
      get() {
        throw new Error('D1 must not be read');
      },
    });
    const testEnv = createTestEnv({
      db: brokenDb,
      issueLimiter,
      writeLimiter,
    });
    const response = await dispatchWorker(
      createReactionWorker({ fetchImpl }),
      new Request(
        'https://api.example/v1/reactions/bootstrap',
        {
          method: 'OPTIONS',
          headers: {
            Origin: TEST_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers':
              'Authorization, Content-Type',
          },
        },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(issueLimiter.keys).toEqual([]);
    expect(writeLimiter.keys).toEqual([]);
  });

  it('does not log tokens, IPs, hashes, authorization, or secrets', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const manifest = createManifestFetch(VALID_MANIFEST);
    const testEnv = createTestEnv();
    const response = await dispatchWorker(
      createReactionWorker({
        fetchImpl: manifest.fetchImpl,
        randomBytes: fixedRandomBytes,
      }),
      jsonRequest(
        'POST',
        '/v1/reactions/bootstrap',
        { targets: ['side:booster'] },
        {
          authorization:
            'Bearer deliberately-damaged-sensitive-token',
          ip: '198.51.100.42',
        },
      ),
      testEnv.env,
    );
    expect(response.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:worker -- services/reactions/test/worker.test.ts
```

Expected: FAIL because the temporary `src/index.ts` stub does not export
`createReactionWorker`.

- [ ] **Step 3: Implement the injectable Worker factory**

Create `services/reactions/src/index.ts` with:

```ts
import type {
  BootstrapResponse,
  ReactionTargetId,
} from '../../../src/lib/reactions/contracts';
import { getAllowedOrigin, handlePreflight } from './cors';
import type { Env } from './env';
import {
  ApiError,
  errorResponse,
  jsonResponse,
  readJsonObject,
} from './http';
import {
  createManifestVerifier,
  type ManifestVerifier,
} from './manifest';
import { bootstrapReactions, setReaction } from './repository';
import {
  createIssueRateLimitKey,
  issueVisitorToken,
  verifyVisitorToken,
  type VisitorIdentity,
} from './token';
import {
  parseBearerToken,
  parseBootstrapRequest,
  parseSetReactionRequest,
} from './validation';

interface WorkerOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  randomBytes?: () => Uint8Array;
}

function internalError(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'The reaction service could not complete the request',
  );
}

function isInvalidToken(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    error.code === 'invalid_token'
  );
}

export function createReactionWorker(
  options: WorkerOptions = {},
): ExportedHandler<Env> {
  const verifiers = new Map<string, ManifestVerifier>();

  function getVerifier(env: Env): ManifestVerifier {
    let verifier = verifiers.get(env.REACTION_TARGET_MANIFEST_URL);
    if (!verifier) {
      verifier = createManifestVerifier({
        manifestUrl: env.REACTION_TARGET_MANIFEST_URL,
        fetchImpl: options.fetchImpl,
        now: options.now,
      });
      verifiers.set(env.REACTION_TARGET_MANIFEST_URL, verifier);
    }
    return verifier;
  }

  async function applyRateLimit(
    limiter: Env['WRITE_RATE_LIMITER'],
    key: string,
  ): Promise<void> {
    const result = await limiter.limit({ key });
    if (!result.success) {
      throw new ApiError(
        429,
        'rate_limited',
        'Too many reaction requests',
      );
    }
  }

  async function bootstrapIdentity(
    request: Request,
    env: Env,
  ): Promise<VisitorIdentity> {
    const authorization = request.headers.get('Authorization');
    if (authorization !== null) {
      try {
        const token = parseBearerToken(authorization);
        const identity = await verifyVisitorToken(
          env.REACTION_HMAC_SECRET,
          token,
        );
        return { token, visitorHash: identity.visitorHash };
      } catch (error) {
        if (!isInvalidToken(error)) {
          throw error;
        }
      }
    }

    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) {
      throw internalError();
    }
    const issueKey = await createIssueRateLimitKey(
      env.REACTION_HMAC_SECRET,
      ip,
    );
    await applyRateLimit(env.ISSUE_RATE_LIMITER, issueKey);
    return issueVisitorToken(
      env.REACTION_HMAC_SECRET,
      options.randomBytes,
    );
  }

  return {
    async fetch(request, env) {
      let origin: string | undefined;
      try {
        origin = getAllowedOrigin(request);
        if (request.method === 'OPTIONS') {
          return handlePreflight(request);
        }

        const pathname = new URL(request.url).pathname;
        const isBootstrap = pathname === '/v1/reactions/bootstrap';
        const isMutation = pathname === '/v1/reactions';
        if (!isBootstrap && !isMutation) {
          throw new ApiError(
            404,
            'invalid_request',
            'Reaction route was not found',
          );
        }
        if (
          (isBootstrap && request.method !== 'POST') ||
          (isMutation && request.method !== 'PUT')
        ) {
          throw new ApiError(
            400,
            'invalid_request',
            'Reaction request method is invalid',
          );
        }

        const body = await readJsonObject(request);
        const verifier = getVerifier(env);

        if (isBootstrap) {
          const parsed = parseBootstrapRequest(body);
          const identity = await bootstrapIdentity(request, env);
          await verifier.assertKnown(parsed.targets);
          const response: BootstrapResponse = {
            visitorToken: identity.token,
            reactions: await bootstrapReactions(
              env.DB,
              parsed.targets,
              identity.visitorHash,
            ),
          };
          return jsonResponse(response, 200, origin);
        }

        const parsed = parseSetReactionRequest(body);
        const token = parseBearerToken(
          request.headers.get('Authorization'),
        );
        const identity = await verifyVisitorToken(
          env.REACTION_HMAC_SECRET,
          token,
        );
        await applyRateLimit(
          env.WRITE_RATE_LIMITER,
          `write:${identity.visitorHash}`,
        );
        await verifier.assertKnown([
          parsed.targetId as ReactionTargetId,
        ]);
        return jsonResponse(
          await setReaction(
            env.DB,
            parsed,
            identity.visitorHash,
          ),
          200,
          origin,
        );
      } catch (error) {
        return errorResponse(
          error instanceof ApiError ? error : internalError(),
          origin,
        );
      }
    },
  };
}

const worker = createReactionWorker();
export default worker;
```

`Env['WRITE_RATE_LIMITER']` and `Env['ISSUE_RATE_LIMITER']` deliberately share
the same structural type. The optional cast around `targetId` may be omitted
because the parser already returns `ReactionTargetId`; do not introduce a
different target type.

- [ ] **Step 4: Map errors without leaking internals**

Confirm the unknown-exception branch returns:

```json
{
  "error": {
    "code": "internal_error",
    "message": "The reaction service could not complete the request"
  }
}
```

Status is `500`. If the origin was valid, every error retains exact CORS and
`no-store`; a forbidden origin response must not grant an
`Access-Control-Allow-Origin`.

- [ ] **Step 5: Run the entire Worker suite and commit**

```bash
npm run test:worker
npm run reactions:typecheck
npm run reactions:dry-run
git add services/reactions/src/index.ts \
  services/reactions/test/helpers.ts \
  services/reactions/test/worker.test.ts
git commit -m "feat: expose shared reactions api"
```

Expected: all Worker/D1 tests pass and the dry run bundles without a network
deployment.

### Task 10: Add guarded production configuration, deployment, smoke tests, and operations docs

**Files:**

- Create: `scripts/validate-reactions-env.mjs`
- Create: `scripts/smoke-reactions-api.mjs`
- Create: `tests/reactions-env.test.mjs`
- Create: `tests/reactions-smoke.test.mjs`
- Create: `.github/workflows/reactions-deploy.yml`
- Create: `services/reactions/README.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `tests/workflows.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write complete production-URL validator tests and verify RED**

Create `tests/reactions-env.test.mjs`:

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  validateReactionsApiUrl,
} from '../scripts/validate-reactions-env.mjs';

const validatorScript = fileURLToPath(
  new URL('../scripts/validate-reactions-env.mjs', import.meta.url),
);

function runValidatorCli(args, valueMarker) {
  const env = Object.assign({}, process.env);
  delete env.PUBLIC_REACTIONS_API_URL;
  if (valueMarker.present) {
    env.PUBLIC_REACTIONS_API_URL = valueMarker.value;
  }
  return spawnSync(process.execPath, [validatorScript].concat(args), {
    encoding: 'utf8',
    env,
  });
}

test('accepts and normalizes a credential-free HTTPS origin', () => {
  assert.equal(
    validateReactionsApiUrl(
      'https://kybee-reactions-api.example.workers.dev/',
      { required: true },
    ),
    'https://kybee-reactions-api.example.workers.dev',
  );
  assert.equal(
    validateReactionsApiUrl(
      'https://api.example.com:8443',
      { required: true },
    ),
    'https://api.example.com:8443',
  );
});

for (const value of [undefined, null, '']) {
  test(`allows optional missing value ${String(value)}`, () => {
    assert.equal(
      validateReactionsApiUrl(value, { required: false }),
      undefined,
    );
  });

  test(`rejects required missing value ${String(value)}`, () => {
    assert.throws(
      () => validateReactionsApiUrl(value, { required: true }),
      /PUBLIC_REACTIONS_API_URL is required/u,
    );
  });
}

for (const [label, value, expectedMessage] of [
  [
    'non-string',
    42,
    /PUBLIC_REACTIONS_API_URL must be a string/u,
  ],
  [
    'leading whitespace',
    ' https://api.example.com',
    /must not contain surrounding whitespace/u,
  ],
  [
    'trailing whitespace',
    'https://api.example.com ',
    /must not contain surrounding whitespace/u,
  ],
  [
    'relative URL',
    'api.example.com',
    /must be an absolute URL/u,
  ],
  [
    'HTTP URL',
    'http://api.example.com',
    /must use HTTPS/u,
  ],
  [
    'FTP URL',
    'ftp://api.example.com',
    /must use HTTPS/u,
  ],
  [
    'username',
    'https://user@api.example.com',
    /must not contain credentials/u,
  ],
  [
    'password',
    'https://user:secret@api.example.com',
    /must not contain credentials/u,
  ],
  [
    'path',
    'https://api.example.com/v1',
    /must be an origin without a path/u,
  ],
  [
    'query',
    'https://api.example.com?query=1',
    /must not contain a query/u,
  ],
  [
    'fragment',
    'https://api.example.com/#fragment',
    /must not contain a fragment/u,
  ],
]) {
  test(`rejects ${label}`, () => {
    assert.throws(
      () => validateReactionsApiUrl(value, { required: true }),
      expectedMessage,
    );
  });
}

test('CLI permits an absent optional value and prints no configuration value', () => {
  const result = runValidatorCli([], { present: false });

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    'Reaction API URL configuration is valid.\n',
  );
  assert.equal(result.stderr, '');
});

test('CLI rejects an absent required value', () => {
  const result = runValidatorCli(
    ['--required'],
    { present: false },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(
    result.stderr,
    /PUBLIC_REACTIONS_API_URL is required/u,
  );
});

test('CLI accepts a required production origin without printing it', () => {
  const apiUrl =
    'https://kybee-reactions-api.example.workers.dev';
  const result = runValidatorCli(
    ['--required'],
    { present: true, value: apiUrl },
  );

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    'Reaction API URL configuration is valid.\n',
  );
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, new RegExp(apiUrl, 'u'));
});

test('CLI error does not echo credentials from an invalid URL', () => {
  const result = runValidatorCli(
    ['--required'],
    {
      present: true,
      value: 'https://user:super-secret@api.example.com',
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain credentials/u);
  assert.doesNotMatch(result.stderr, /super-secret/u);
});
```

```bash
node --test tests/reactions-env.test.mjs
```

Expected: FAIL because `scripts/validate-reactions-env.mjs` does not exist.

- [ ] **Step 2: Implement the URL validator and run its GREEN gate**

Create `scripts/validate-reactions-env.mjs`:

```js
import { pathToFileURL } from 'node:url';

function invalid(message) {
  throw new Error(`PUBLIC_REACTIONS_API_URL ${message}`);
}

export function validateReactionsApiUrl(
  value,
  { required = false } = {},
) {
  if (value === undefined || value === null || value === '') {
    if (required) invalid('is required');
    return undefined;
  }
  if (typeof value !== 'string') {
    invalid('must be a string');
  }
  if (value.trim() !== value) {
    invalid('must not contain surrounding whitespace');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    invalid('must be an absolute URL');
  }
  if (url.protocol !== 'https:') invalid('must use HTTPS');
  if (!url.hostname) invalid('must contain a host');
  if (url.username || url.password) {
    invalid('must not contain credentials');
  }
  if (url.pathname !== '/') {
    invalid('must be an origin without a path');
  }
  if (url.search) invalid('must not contain a query');
  if (url.hash) invalid('must not contain a fragment');
  return url.origin;
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  try {
    validateReactionsApiUrl(
      process.env.PUBLIC_REACTIONS_API_URL,
      { required: process.argv.includes('--required') },
    );
    console.log('Reaction API URL configuration is valid.');
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Invalid reaction API URL',
    );
    process.exitCode = 1;
  }
}
```

```bash
node --test tests/reactions-env.test.mjs
```

Expected: every validator function and CLI test passes.

- [ ] **Step 3: Write deterministic read-only smoke tests and verify RED**

Create `tests/reactions-smoke.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runSmokeCli,
  smokeReactionsApi,
} from '../scripts/smoke-reactions-api.mjs';

const API_URL = 'https://reactions.example.workers.dev';
const MANIFEST_URL =
  'https://kybee.github.io/reaction-targets.json';
const ORIGIN = 'https://kybee.github.io';
const TOKEN = `v1.${'a'.repeat(43)}.${'b'.repeat(43)}`;

function jsonResponse(value, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers,
  });
}

function validManifestResponse(
  targets = ['side:alpha', 'work:zeta'],
) {
  return jsonResponse({ version: 1, targets });
}

function validPreflightResponse(init = {}) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type',
    Vary: 'Accept-Encoding, Origin',
  });
  for (const name of init.omitHeaders ?? []) {
    headers.delete(name);
  }
  for (const [name, value] of Object.entries(
    init.headers ?? {},
  )) {
    headers.set(name, value);
  }
  return new Response(null, {
    status: init.status ?? 204,
    headers,
  });
}

function validBootstrapBody(target = 'side:alpha') {
  return {
    visitorToken: TOKEN,
    reactions: {
      [target]: {
        counts: {
          '👍': 2,
          '🔥': 1,
          '🎉': 0,
          '👏': 0,
        },
        selected: ['🔥'],
      },
    },
  };
}

function bootstrapResponse(body = validBootstrapBody(), init = {}) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': ORIGIN,
    'Cache-Control': 'no-store',
  });
  for (const name of init.omitHeaders ?? []) {
    headers.delete(name);
  }
  for (const [name, value] of Object.entries(
    init.headers ?? {},
  )) {
    headers.set(name, value);
  }
  return jsonResponse(
    body,
    {
      status: init.status ?? 200,
      headers,
    },
  );
}

function createFetchFixture(overrides = {}) {
  const calls = [];
  const manifest =
    overrides.manifest ?? (() => validManifestResponse());
  const preflight =
    overrides.preflight ?? (() => validPreflightResponse());
  const bootstrap =
    overrides.bootstrap ?? (() => bootstrapResponse());

  return {
    calls,
    fetchImpl: async (url, options = {}) => {
      const method = options.method ?? 'GET';
      calls.push({ method, options, url: String(url) });

      if (String(url) === MANIFEST_URL && method === 'GET') {
        return manifest({ method, options, url: String(url) });
      }
      if (
        String(url) === `${API_URL}/v1/reactions/bootstrap` &&
        method === 'OPTIONS'
      ) {
        return preflight({ method, options, url: String(url) });
      }
      if (
        String(url) === `${API_URL}/v1/reactions/bootstrap` &&
        method === 'POST'
      ) {
        return bootstrap({ method, options, url: String(url) });
      }
      throw new Error(`Unexpected smoke request: ${method} ${url}`);
    },
  };
}

function createFakeClock(start = 0) {
  let current = start;
  const controllers = new WeakMap();
  const timeoutDurations = [];

  return {
    delay: async (milliseconds) => {
      assert.ok(
        Number.isFinite(milliseconds) && milliseconds >= 0,
        'Expected a finite non-negative delay',
      );
      current += milliseconds;
    },
    hangUntilAbort(signal) {
      const record = controllers.get(signal);
      assert.ok(record, 'Expected an injected timeout signal');

      return new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(signal.reason),
          { once: true },
        );
        queueMicrotask(() => {
          current += record.milliseconds;
          record.controller.abort(
            new DOMException('Fake deadline reached', 'TimeoutError'),
          );
        });
      });
    },
    now: () => current,
    timeoutDurations,
    timeoutSignal(milliseconds) {
      const controller = new AbortController();
      controllers.set(controller.signal, {
        controller,
        milliseconds,
      });
      timeoutDurations.push(milliseconds);
      return controller.signal;
    },
  };
}

function smokeOptions(fixture, clock) {
  return {
    apiUrl: API_URL,
    manifestUrl: MANIFEST_URL,
    origin: ORIGIN,
    fetchImpl: fixture.fetchImpl,
    delay: clock.delay,
    now: clock.now,
    timeoutSignal: clock.timeoutSignal,
  };
}

function assertNoMutation(calls) {
  assert.equal(
    calls.some((call) => call.method === 'PUT'),
    false,
    'Production smoke must never mutate a reaction',
  );
}

test('selects the first sorted real target and validates preflight and bootstrap', async () => {
  const fixture = createFetchFixture();
  const clock = createFakeClock();

  const result = await smokeReactionsApi(
    smokeOptions(fixture, clock),
  );

  assert.deepEqual(result, { target: 'side:alpha' });
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(
    fixture.calls.map((call) => call.method),
    ['GET', 'OPTIONS', 'POST'],
  );

  const manifestCall = fixture.calls[0];
  assert.equal(manifestCall.url, MANIFEST_URL);
  assert.equal(manifestCall.options.cache, 'no-store');
  assert.deepEqual(manifestCall.options.headers, {
    Accept: 'application/json',
  });

  const preflightCall = fixture.calls[1];
  assert.deepEqual(preflightCall.options.headers, {
    Origin: ORIGIN,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers':
      'authorization, content-type',
  });

  const bootstrapCall = fixture.calls[2];
  assert.deepEqual(bootstrapCall.options.headers, {
    Origin: ORIGIN,
    'Content-Type': 'application/json',
  });
  assert.deepEqual(
    JSON.parse(bootstrapCall.options.body),
    { targets: ['side:alpha'] },
  );
  assertNoMutation(fixture.calls);
});

test('bounds manifest polling to 18 attempts without real sleep', async () => {
  const fixture = createFetchFixture({
    manifest: () =>
      new Response('not ready', { status: 503 }),
  });
  const clock = createFakeClock();

  await assert.rejects(
    smokeReactionsApi(smokeOptions(fixture, clock)),
    /Manifest returned 503/u,
  );

  assert.equal(fixture.calls.length, 18);
  assert.equal(clock.now(), 85_000);
  assertNoMutation(fixture.calls);
});

test('aborts a never-resolving manifest at the shared 90-second deadline', async () => {
  const clock = createFakeClock();
  const fixture = createFetchFixture({
    manifest: ({ options }) =>
      clock.hangUntilAbort(options.signal),
  });

  await assert.rejects(
    smokeReactionsApi(smokeOptions(fixture, clock)),
    /timed out/u,
  );

  assert.equal(clock.now(), 90_000);
  assert.deepEqual(clock.timeoutDurations, [90_000]);
  assert.equal(fixture.calls.length, 1);
  assertNoMutation(fixture.calls);
});

test('preflight receives only the deadline remaining after manifest polling', async () => {
  const clock = createFakeClock();
  let manifestAttempt = 0;
  const fixture = createFetchFixture({
    manifest: () => {
      manifestAttempt += 1;
      return manifestAttempt === 1
        ? new Response('not ready', { status: 503 })
        : validManifestResponse();
    },
    preflight: ({ options }) =>
      clock.hangUntilAbort(options.signal),
  });

  await assert.rejects(
    smokeReactionsApi(smokeOptions(fixture, clock)),
    /Fake deadline reached|timed out/u,
  );

  assert.equal(clock.now(), 90_000);
  assert.equal(clock.timeoutDurations.at(-1), 85_000);
  assert.deepEqual(
    fixture.calls.map((call) => call.method),
    ['GET', 'GET', 'OPTIONS'],
  );
  assertNoMutation(fixture.calls);
});

test('bootstrap receives only the deadline remaining after manifest polling', async () => {
  const clock = createFakeClock();
  let manifestAttempt = 0;
  const fixture = createFetchFixture({
    manifest: () => {
      manifestAttempt += 1;
      return manifestAttempt === 1
        ? new Response('not ready', { status: 503 })
        : validManifestResponse();
    },
    bootstrap: ({ options }) =>
      clock.hangUntilAbort(options.signal),
  });

  await assert.rejects(
    smokeReactionsApi(smokeOptions(fixture, clock)),
    /Fake deadline reached|timed out/u,
  );

  assert.equal(clock.now(), 90_000);
  assert.equal(clock.timeoutDurations.at(-1), 85_000);
  assert.deepEqual(
    fixture.calls.map((call) => call.method),
    ['GET', 'GET', 'OPTIONS', 'POST'],
  );
  assertNoMutation(fixture.calls);
});

for (const manifestUrl of [
  'http://kybee.github.io/reaction-targets.json',
  'https://user:password@kybee.github.io/reaction-targets.json',
]) {
  test(`rejects unsafe manifest URL before fetch: ${manifestUrl}`, async () => {
    const fixture = createFetchFixture();
    const clock = createFakeClock();

    await assert.rejects(
      smokeReactionsApi(
        Object.assign(smokeOptions(fixture, clock), {
          manifestUrl,
        }),
      ),
      /credential-free HTTPS URL/u,
    );

    assert.equal(fixture.calls.length, 0);
  });
}

test('rejects a 101-target manifest before preflight or bootstrap', async () => {
  const targets = Array.from(
    { length: 101 },
    (_, index) => `work:project-${index}`,
  );
  const fixture = createFetchFixture({
    manifest: () => validManifestResponse(targets),
  });
  const clock = createFakeClock();

  await assert.rejects(
    smokeReactionsApi(smokeOptions(fixture, clock)),
    /between 1 and 100 targets/u,
  );

  assert.equal(
    fixture.calls.every((call) => call.method === 'GET'),
    true,
  );
  assertNoMutation(fixture.calls);
});

for (const [label, overrides, expectedError] of [
  [
    'non-2xx manifest',
    {
      manifest: () =>
        new Response('unavailable', { status: 503 }),
    },
    /Manifest returned 503/u,
  ],
  [
    'malformed manifest JSON',
    {
      manifest: () =>
        new Response('{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    },
    /JSON|Unexpected end/u,
  ],
  [
    'unsorted manifest targets',
    {
      manifest: () =>
        validManifestResponse(['work:zeta', 'side:alpha']),
    },
    /unique and sorted/u,
  ],
  [
    'invalid manifest target',
    {
      manifest: () =>
        validManifestResponse(['work:Uppercase']),
    },
    /invalid target/u,
  ],
  [
    'preflight status other than 204',
    {
      preflight: () =>
        validPreflightResponse({ status: 200 }),
    },
    /Preflight must return 204/u,
  ],
  [
    'wrong preflight allow-origin',
    {
      preflight: () =>
        validPreflightResponse({
          headers: {
            'Access-Control-Allow-Origin':
              'https://example.com',
          },
        }),
    },
    /allow-origin/u,
  ],
  [
    'wrong preflight allow-methods',
    {
      preflight: () =>
        validPreflightResponse({
          headers: {
            'Access-Control-Allow-Methods':
              'POST, OPTIONS',
          },
        }),
    },
    /allow-methods/u,
  ],
  [
    'missing preflight header',
    {
      preflight: () =>
        validPreflightResponse({
          omitHeaders: [
            'Access-Control-Allow-Headers',
          ],
        }),
    },
    /allow-headers/u,
  ],
  [
    'missing preflight Vary origin',
    {
      preflight: () =>
        validPreflightResponse({
          headers: { Vary: 'Accept-Encoding' },
        }),
    },
    /vary on Origin/u,
  ],
  [
    'bootstrap status other than 200',
    {
      bootstrap: () =>
        bootstrapResponse(validBootstrapBody(), {
          status: 503,
        }),
    },
    /Bootstrap must return 200/u,
  ],
  [
    'missing bootstrap no-store header',
    {
      bootstrap: () =>
        bootstrapResponse(validBootstrapBody(), {
          omitHeaders: ['Cache-Control'],
        }),
    },
    /Bootstrap must be no-store/u,
  ],
  [
    'wrong bootstrap allow-origin',
    {
      bootstrap: () =>
        bootstrapResponse(validBootstrapBody(), {
          headers: {
            'Access-Control-Allow-Origin':
              'https://example.com',
          },
        }),
    },
    /Bootstrap allow-origin/u,
  ],
  [
    'invalid bootstrap token',
    {
      bootstrap: () =>
        bootstrapResponse(
          Object.assign(validBootstrapBody(), {
            visitorToken: 'not-a-token',
          }),
        ),
    },
    /token is invalid/u,
  ],
  [
    'wrong bootstrap target keys',
    {
      bootstrap: () =>
        bootstrapResponse(validBootstrapBody('work:zeta')),
    },
    /target keys are incorrect/u,
  ],
  [
    'missing bootstrap emoji count',
    {
      bootstrap: () => {
        const body = validBootstrapBody();
        delete body.reactions['side:alpha'].counts['👏'];
        return bootstrapResponse(body);
      },
    },
    /count keys are incorrect/u,
  ],
  [
    'non-integer bootstrap count',
    {
      bootstrap: () => {
        const body = validBootstrapBody();
        body.reactions['side:alpha'].counts['👍'] = 1.5;
        return bootstrapResponse(body);
      },
    },
    /count for 👍 is invalid/u,
  ],
  [
    'negative bootstrap count',
    {
      bootstrap: () => {
        const body = validBootstrapBody();
        body.reactions['side:alpha'].counts['👍'] = -1;
        return bootstrapResponse(body);
      },
    },
    /count for 👍 is invalid/u,
  ],
  [
    'duplicate selected reactions',
    {
      bootstrap: () => {
        const body = validBootstrapBody();
        body.reactions['side:alpha'].selected = ['🔥', '🔥'];
        return bootstrapResponse(body);
      },
    },
    /Selected reactions are invalid/u,
  ],
  [
    'unapproved selected reaction',
    {
      bootstrap: () => {
        const body = validBootstrapBody();
        body.reactions['side:alpha'].selected = ['💯'];
        return bootstrapResponse(body);
      },
    },
    /Selected reactions are invalid/u,
  ],
  [
    'selected reaction with zero count',
    {
      bootstrap: () => {
        const body = validBootstrapBody();
        body.reactions['side:alpha'].selected = ['👏'];
        return bootstrapResponse(body);
      },
    },
    /Selected reactions are invalid/u,
  ],
]) {
  test(`CLI exits nonzero for ${label}`, async () => {
    const fixture = createFetchFixture(overrides);
    const clock = createFakeClock();
    const stdout = [];
    const stderr = [];

    const exitCode = await runSmokeCli({
      env: {
        PUBLIC_REACTIONS_API_URL: API_URL,
        REACTION_TARGET_MANIFEST_URL: MANIFEST_URL,
      },
      fetchImpl: fixture.fetchImpl,
      delay: clock.delay,
      now: clock.now,
      timeoutSignal: clock.timeoutSignal,
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(stdout, []);
    assert.equal(stderr.length, 1);
    assert.match(stderr[0], expectedError);
    assertNoMutation(fixture.calls);
  });
}

test('CLI succeeds read-only and reports only the selected target', async () => {
  const fixture = createFetchFixture();
  const clock = createFakeClock();
  const stdout = [];
  const stderr = [];

  const exitCode = await runSmokeCli({
    env: {
      PUBLIC_REACTIONS_API_URL: API_URL,
      REACTION_TARGET_MANIFEST_URL: MANIFEST_URL,
    },
    fetchImpl: fixture.fetchImpl,
    delay: clock.delay,
    now: clock.now,
    timeoutSignal: clock.timeoutSignal,
    writeStdout: (line) => stdout.push(line),
    writeStderr: (line) => stderr.push(line),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    stdout,
    ['Reaction API smoke passed for side:alpha.'],
  );
  assert.deepEqual(stderr, []);
  assertNoMutation(fixture.calls);
});
```

`createFakeClock` is the shared helper for this test file. It advances only
when an injected delay runs or when a deliberately hanging request's injected
abort signal expires. Therefore the tests prove the deadline without wall
clock sleeps and can distinguish a single shared 90-second budget from a new
90-second timeout per request.

```bash
node --test tests/reactions-smoke.test.mjs
```

Expected: FAIL because `scripts/smoke-reactions-api.mjs` does not exist.

- [ ] **Step 4: Implement the bounded production smoke script**

Create `scripts/smoke-reactions-api.mjs`:

```js
import { pathToFileURL } from 'node:url';
import { validateReactionsApiUrl } from
  './validate-reactions-env.mjs';

const EMOJIS = ['👍', '🔥', '🎉', '👏'];
const TARGET_PATTERN =
  /^(work|side):[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_MANIFEST_TARGETS = 100;
const MAX_MANIFEST_ATTEMPTS = 18;
const MANIFEST_DELAY_MS = 5_000;
const SMOKE_DEADLINE_MS = 90_000;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeManifestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Reaction manifest URL must be absolute');
  }
  invariant(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash,
    'Reaction manifest URL must be a credential-free HTTPS URL',
  );
  return url.href;
}

function remainingMilliseconds(deadline, now) {
  const remaining = Math.floor(deadline - now());
  if (remaining <= 0) {
    throw new Error('Reaction API smoke timed out');
  }
  return remaining;
}

async function readManifest({
  manifestUrl,
  fetchImpl,
  delay,
  deadline,
  now,
  timeoutSignal,
}) {
  let lastError;

  for (
    let attempt = 0;
    attempt < MAX_MANIFEST_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const response = await fetchImpl(manifestUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: timeoutSignal(
          remainingMilliseconds(deadline, now),
        ),
      });
      invariant(
        response.ok,
        `Manifest returned ${response.status}`,
      );
      const manifest = await response.json();
      invariant(isRecord(manifest), 'Manifest must be an object');
      invariant(
        manifest.version === 1,
        'Manifest version must be 1',
      );
      invariant(
        Array.isArray(manifest.targets) &&
          manifest.targets.length > 0 &&
          manifest.targets.length <= MAX_MANIFEST_TARGETS,
        'Manifest must contain between 1 and 100 targets',
      );

      const targets = Array.from(manifest.targets);
      for (const target of targets) {
        invariant(
          typeof target === 'string' &&
            target.length <= 96 &&
            TARGET_PATTERN.test(target),
          'Manifest contains an invalid target',
        );
      }
      invariant(
        JSON.stringify(targets) ===
          JSON.stringify(
            Array.from(new Set(targets)).sort(),
          ),
        'Manifest targets must be unique and sorted',
      );
      return targets;
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= MAX_MANIFEST_ATTEMPTS) break;

      const remaining =
        remainingMilliseconds(deadline, now);
      await delay(Math.min(MANIFEST_DELAY_MS, remaining));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Manifest did not become available');
}

export async function smokeReactionsApi({
  apiUrl,
  manifestUrl =
    'https://kybee.github.io/reaction-targets.json',
  origin = 'https://kybee.github.io',
  fetchImpl = fetch,
  delay = (milliseconds) =>
    new Promise((resolve) =>
      setTimeout(resolve, milliseconds),
    ),
  now = () => performance.now(),
  timeoutSignal = (milliseconds) =>
    AbortSignal.timeout(milliseconds),
}) {
  const deadline = now() + SMOKE_DEADLINE_MS;
  const normalizedApiUrl = validateReactionsApiUrl(apiUrl, {
    required: true,
  });
  const normalizedManifestUrl =
    normalizeManifestUrl(manifestUrl);
  const targets = await readManifest({
    manifestUrl: normalizedManifestUrl,
    fetchImpl,
    delay,
    deadline,
    now,
    timeoutSignal,
  });
  const target = targets[0];
  const bootstrapUrl =
    `${normalizedApiUrl}/v1/reactions/bootstrap`;

  const preflight = await fetchImpl(bootstrapUrl, {
    method: 'OPTIONS',
    signal: timeoutSignal(
      remainingMilliseconds(deadline, now),
    ),
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers':
        'authorization, content-type',
    },
  });
  invariant(
    preflight.status === 204,
    'Preflight must return 204',
  );
  invariant(
    (await preflight.text()) === '',
    'Preflight body must be empty',
  );
  invariant(
    preflight.headers.get('Access-Control-Allow-Origin') ===
      origin,
    'Preflight allow-origin is incorrect',
  );
  invariant(
    preflight.headers.get('Access-Control-Allow-Methods') ===
      'POST, PUT, OPTIONS',
    'Preflight allow-methods is incorrect',
  );
  invariant(
    preflight.headers.get('Access-Control-Allow-Headers') ===
      'Authorization, Content-Type',
    'Preflight allow-headers is incorrect',
  );
  invariant(
    (preflight.headers.get('Vary') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .includes('origin'),
    'Preflight must vary on Origin',
  );

  const bootstrap = await fetchImpl(bootstrapUrl, {
    method: 'POST',
    signal: timeoutSignal(
      remainingMilliseconds(deadline, now),
    ),
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targets: [target] }),
  });
  invariant(
    bootstrap.status === 200,
    'Bootstrap must return 200',
  );
  invariant(
    bootstrap.headers.get('Cache-Control') === 'no-store',
    'Bootstrap must be no-store',
  );
  invariant(
    bootstrap.headers.get('Access-Control-Allow-Origin') ===
      origin,
    'Bootstrap allow-origin is incorrect',
  );

  const body = await bootstrap.json();
  invariant(isRecord(body), 'Bootstrap body must be an object');
  invariant(
    typeof body.visitorToken === 'string' &&
      /^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/u.test(
        body.visitorToken,
      ),
    'Bootstrap token is invalid',
  );
  invariant(
    isRecord(body.reactions),
    'Bootstrap reactions are invalid',
  );
  invariant(
    JSON.stringify(Object.keys(body.reactions).sort()) ===
      JSON.stringify([target]),
    'Bootstrap target keys are incorrect',
  );

  const snapshot = body.reactions[target];
  invariant(
    isRecord(snapshot),
    'Bootstrap snapshot is invalid',
  );
  invariant(
    isRecord(snapshot.counts),
    'Bootstrap counts are invalid',
  );
  invariant(
    JSON.stringify(Object.keys(snapshot.counts)) ===
      JSON.stringify(EMOJIS),
    'Bootstrap count keys are incorrect',
  );
  for (const emoji of EMOJIS) {
    invariant(
      Number.isSafeInteger(snapshot.counts[emoji]) &&
        snapshot.counts[emoji] >= 0,
      `Bootstrap count for ${emoji} is invalid`,
    );
  }
  invariant(
    Array.isArray(snapshot.selected),
    'Selected must be an array',
  );
  invariant(
    new Set(snapshot.selected).size ===
      snapshot.selected.length &&
      snapshot.selected.every(
        (emoji) =>
          EMOJIS.includes(emoji) &&
          snapshot.counts[emoji] >= 1,
      ),
    'Selected reactions are invalid',
  );

  return { target };
}

export async function runSmokeCli({
  env = process.env,
  fetchImpl = fetch,
  delay = (milliseconds) =>
    new Promise((resolve) =>
      setTimeout(resolve, milliseconds),
    ),
  now = () => performance.now(),
  timeoutSignal = (milliseconds) =>
    AbortSignal.timeout(milliseconds),
  writeStdout = (line) => console.log(line),
  writeStderr = (line) => console.error(line),
} = {}) {
  try {
    const { target } = await smokeReactionsApi({
      apiUrl: env.PUBLIC_REACTIONS_API_URL,
      manifestUrl:
        env.REACTION_TARGET_MANIFEST_URL ??
        'https://kybee.github.io/reaction-targets.json',
      fetchImpl,
      delay,
      now,
      timeoutSignal,
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

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  process.exitCode = await runSmokeCli();
}
```

The script contains no `PUT` branch and returns after the one bootstrap. The
manifest fetch, retry delays, preflight, and bootstrap all consume the same
monotonic deadline.

After both new Node test files exist, change the root `test` script in
`package.json` to:

```json
{
  "test": "node --test tests/content-validation.test.mjs tests/pages-config.test.mjs tests/workflows.test.mjs tests/reactions-env.test.mjs tests/reactions-smoke.test.mjs"
}
```

Changing a package script does not change dependency resolution, so
`package-lock.json` is not part of this Task 10 edit.

- [ ] **Step 5: Run validator and smoke tests GREEN**

```bash
node --test tests/reactions-smoke.test.mjs
node --test tests/reactions-env.test.mjs tests/reactions-smoke.test.mjs
```

Expected: all tests pass without network access or wall-clock delay, every
hanging-fetch case ends at fake time `90000`, and every recorded request set
contains no `PUT`.

- [ ] **Step 6: Write same-SHA workflow tests and verify RED**

Add these helpers beside `stepNamed` in `tests/workflows.test.mjs`:

```js
function stepIndex(job, name) {
  const index = job.steps.findIndex(
    (candidate) => candidate.name === name,
  );
  assert.notEqual(index, -1, `missing workflow step: ${name}`);
  return index;
}

function normalizedRun(step) {
  assert.equal(
    typeof step.run,
    'string',
    `Expected ${step.name ?? 'unnamed step'} to have a run command`,
  );
  return step.run.replace(/\s+/gu, ' ').trim();
}
```

Replace the existing final deploy test with these complete workflow tests:

```js
test('reactions deploy runs only after successful main Pages deployment or main manual dispatch', async () => {
  const workflow = await readWorkflow('reactions-deploy.yml');
  const deploy = workflow.jobs.deploy;

  assert.deepEqual(workflow.on, {
    workflow_run: {
      workflows: ['Deploy to GitHub Pages'],
      types: ['completed'],
    },
    workflow_dispatch: null,
  });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'production-reactions',
    'cancel-in-progress': false,
  });
  assert.equal(deploy.environment, 'production-reactions');
  assert.equal(deploy['runs-on'], 'ubuntu-latest');
  assert.equal(deploy['timeout-minutes'], 10);
  assert.equal(
    deploy.if.replace(/\s+/gu, ' ').trim(),
    "(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
  );
});

test('reactions deploy checks out and verifies the exact Pages release SHA', async () => {
  const workflow = await readWorkflow('reactions-deploy.yml');
  const deploy = workflow.jobs.deploy;
  const checkout = stepUsing(deploy, 'actions/checkout@v4');
  const verifySha = stepNamed(deploy, 'Verify release SHA');

  assert.deepEqual(deploy.env, {
    CLOUDFLARE_API_TOKEN:
      '${{ secrets.CLOUDFLARE_API_TOKEN }}',
    CLOUDFLARE_ACCOUNT_ID:
      '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
    PUBLIC_REACTIONS_API_URL:
      '${{ vars.PUBLIC_REACTIONS_API_URL }}',
    RELEASE_SHA:
      '${{ github.event.workflow_run.head_sha || github.sha }}',
  });
  assert.deepEqual(checkout.with, {
    ref: '${{ env.RELEASE_SHA }}',
    'persist-credentials': false,
  });
  assert.equal(
    normalizedRun(verifySha),
    'test "$(git rev-parse HEAD)" = "$RELEASE_SHA"',
  );
  assert.ok(
    deploy.steps.indexOf(checkout) <
      deploy.steps.indexOf(verifySha),
  );
});

test('reactions deploy verifies code before ordered remote migration and deploy operations', async () => {
  const deploy = (
    await readWorkflow('reactions-deploy.yml')
  ).jobs.deploy;
  const setupNode = stepUsing(deploy, 'actions/setup-node@v4');

  assert.deepEqual(setupNode.with, {
    'node-version': '20',
    cache: 'npm',
  });
  assert.equal(
    normalizedRun(stepNamed(deploy, 'Install dependencies')),
    'npm ci',
  );
  assert.equal(
    normalizedRun(stepNamed(deploy, 'Test Worker')),
    'npm run test:worker',
  );
  assert.equal(
    normalizedRun(stepNamed(deploy, 'Typecheck Worker')),
    'npm run reactions:typecheck',
  );
  assert.equal(
    normalizedRun(
      stepNamed(deploy, 'Validate production API URL'),
    ),
    'node scripts/validate-reactions-env.mjs --required',
  );

  const orderedNames = [
    'Test Worker',
    'Typecheck Worker',
    'Validate production API URL',
    'List pending D1 migrations',
    'Apply D1 migrations',
    'Deploy Worker',
    'Smoke production API',
  ];
  const orderedIndexes = orderedNames.map((name) =>
    stepIndex(deploy, name),
  );
  assert.deepEqual(
    orderedIndexes,
    Array.from(orderedIndexes).sort((left, right) => left - right),
  );

  assert.equal(
    normalizedRun(
      stepNamed(deploy, 'List pending D1 migrations'),
    ),
    'npx --no-install wrangler d1 migrations list kybee-reactions --remote --config services/reactions/wrangler.jsonc',
  );
  assert.equal(
    normalizedRun(stepNamed(deploy, 'Apply D1 migrations')),
    'npx --no-install wrangler d1 migrations apply kybee-reactions --remote --config services/reactions/wrangler.jsonc',
  );
  assert.equal(
    normalizedRun(stepNamed(deploy, 'Deploy Worker')),
    'npx --no-install wrangler deploy --config services/reactions/wrangler.jsonc',
  );
  assert.equal(
    normalizedRun(stepNamed(deploy, 'Smoke production API')),
    'node scripts/smoke-reactions-api.mjs',
  );
});

test('reactions deploy has no destructive D1 command or inline secret expression', async () => {
  const workflow = await readWorkflow('reactions-deploy.yml');
  const runCommands = workflow.jobs.deploy.steps
    .filter((step) => typeof step.run === 'string')
    .map(normalizedRun)
    .join('\n');

  assert.doesNotMatch(
    runCommands,
    /\bwrangler\s+d1\s+execute\b/iu,
  );
  assert.doesNotMatch(
    runCommands,
    /\b(?:delete|reset|drop|truncate)\b/iu,
  );
  assert.doesNotMatch(
    runCommands,
    /\$\{\{\s*secrets\./u,
  );
  assert.doesNotMatch(
    JSON.stringify(workflow),
    /REACTION_HMAC_SECRET/u,
  );
  assert.match(
    workflow.jobs.deploy.env.CLOUDFLARE_API_TOKEN,
    /^\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}$/u,
  );
  assert.match(
    workflow.jobs.deploy.env.CLOUDFLARE_ACCOUNT_ID,
    /^\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}$/u,
  );
});

test('Pages deploy validates the public API variable before the complete Astro verification build', async () => {
  const workflow = await readWorkflow('deploy.yml');
  const build = workflow.jobs.build;
  const action = stepUsing(build, 'withastro/action@v3');
  const validator = stepNamed(
    build,
    'Validate production reactions API',
  );

  assert.deepEqual(build.env, {
    PUBLIC_REACTIONS_API_URL:
      '${{ vars.PUBLIC_REACTIONS_API_URL }}',
  });
  assert.equal(
    normalizedRun(validator),
    'node scripts/validate-reactions-env.mjs --required',
  );
  assert.ok(
    build.steps.indexOf(validator) <
      build.steps.indexOf(action),
  );
  assert.deepEqual(action.with, {
    'node-version': '20',
    'build-cmd': 'npm run verify',
  });
  assert.deepEqual(workflow.permissions, {
    contents: 'read',
    pages: 'write',
    'id-token': 'write',
  });
  assert.equal(workflow.jobs.deploy.needs, 'build');
  assert.equal(
    stepUsing(workflow.jobs.deploy, 'actions/deploy-pages@v4').id,
    'deployment',
  );
});

test('content-check keeps the required verify job name', async () => {
  const workflow = await readWorkflow('content-check.yml');

  assert.deepEqual(Object.keys(workflow.jobs), ['verify']);
  assert.equal(workflow.jobs.verify['runs-on'], 'ubuntu-latest');
  assert.equal(
    workflow.jobs.verify.steps.some(
      (step) => step.run === 'npm run verify',
    ),
    true,
  );
});
```

The tests inspect parsed YAML, not substrings alone. They lock the Pages
workflow name that drives `workflow_run`, the successful-main gate, the
triggering workflow's `head_sha`, SHA verification after checkout,
least-privilege permissions, production environment, non-cancelling
concurrency, exact migration/deploy/smoke order, secret provenance, and the
absence of destructive D1 commands.

```bash
node --test tests/workflows.test.mjs
```

Expected: FAIL with `ENOENT` for
`.github/workflows/reactions-deploy.yml`; after that file is first created,
the same command remains RED until `deploy.yml` contains the required
production variable and validator step.

- [ ] **Step 7: Implement the Pages-sequenced Worker and production Pages workflows**

Create `.github/workflows/reactions-deploy.yml`:

```yaml
name: Deploy Reactions Worker

on:
  workflow_run:
    workflows: ["Deploy to GitHub Pages"]
    types: [completed]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: production-reactions
  cancel-in-progress: false

jobs:
  deploy:
    if: >-
      (github.event_name == 'workflow_run' &&
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.head_branch == 'main') ||
      (github.event_name == 'workflow_dispatch' &&
      github.ref == 'refs/heads/main')
    environment: production-reactions
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      PUBLIC_REACTIONS_API_URL: ${{ vars.PUBLIC_REACTIONS_API_URL }}
      RELEASE_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ env.RELEASE_SHA }}
          persist-credentials: false
      - name: Verify release SHA
        run: test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Test Worker
        run: npm run test:worker
      - name: Typecheck Worker
        run: npm run reactions:typecheck
      - name: Validate production API URL
        run: node scripts/validate-reactions-env.mjs --required
      - name: List pending D1 migrations
        run: >-
          npx --no-install wrangler d1 migrations list kybee-reactions
          --remote --config services/reactions/wrangler.jsonc
      - name: Apply D1 migrations
        run: >-
          npx --no-install wrangler d1 migrations apply kybee-reactions
          --remote --config services/reactions/wrangler.jsonc
      - name: Deploy Worker
        run: >-
          npx --no-install wrangler deploy
          --config services/reactions/wrangler.jsonc
      - name: Smoke production API
        run: node scripts/smoke-reactions-api.mjs
```

Replace `.github/workflows/deploy.yml` with:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      PUBLIC_REACTIONS_API_URL: ${{ vars.PUBLIC_REACTIONS_API_URL }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Validate production reactions API
        run: node scripts/validate-reactions-env.mjs --required
      - name: Build with Astro
        uses: withastro/action@v3
        with:
          node-version: "20"
          build-cmd: npm run verify

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

The Worker workflow never invokes `wrangler d1 execute`; remote database
changes are migration-list and migration-apply only. Worker tests, Worker
typechecking, and public-URL validation finish before the first remote
operation. The read-only smoke runs only after migration and deployment.

- [ ] **Step 8: Run the complete workflow test gate GREEN**

```bash
node --test tests/workflows.test.mjs
```

Expected: every existing Pages CMS workflow test and every new
Pages-to-Worker deployment invariant passes.

- [ ] **Step 9: Document local, deploy, secret, and rollback operations**

Create `services/reactions/README.md`:

````markdown
# Shared project reactions Worker

This Worker is the only write boundary between the public portfolio and the
`kybee-reactions` D1 database. The browser receives an opaque signed visitor
token; D1 stores only its SHA-256 visitor hash plus target, emoji, and creation
time. Never log an IP, User-Agent, email, raw visitor ID, bearer token,
visitor hash, or secret.

## Checked-in versus secret configuration

- `wrangler.jsonc` contains the public manifest URL, rate-limit bindings, and
  non-secret D1 database UUID.
- `REACTION_HMAC_SECRET` is a Cloudflare Worker secret containing at least 32
  random bytes. It is never committed or placed in GitHub.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are environment-scoped
  GitHub secrets in `production-reactions`.
- `PUBLIC_REACTIONS_API_URL` is a public GitHub repository variable.

Rotating `REACTION_HMAC_SECRET` invalidates every existing browser token and
changes the derived visitor identity. Rotate it only as an incident response,
not during routine deployment.

## Local verification

From the repository root:

```bash
npm ci
npm run test:worker
npm run reactions:typecheck
npm run reactions:dry-run
npm run reactions:migrate:local
npm run verify
```

The Vitest configuration supplies a test-only secret and local D1 database.
Do not create a real `.dev.vars` file merely to run the automated suite.

## One-time production provisioning

Run this only while `wrangler.jsonc` has no production `d1_databases` block:

```bash
npx --no-install wrangler login
npx --no-install wrangler whoami
npx --no-install wrangler d1 create kybee-reactions \
  --binding DB \
  --location apac \
  --update-config \
  --config services/reactions/wrangler.jsonc
npx --no-install wrangler d1 migrations list kybee-reactions \
  --remote \
  --config services/reactions/wrangler.jsonc
npx --no-install wrangler d1 migrations apply kybee-reactions \
  --remote \
  --config services/reactions/wrangler.jsonc
openssl rand -hex 32 | \
  npx --no-install wrangler secret put REACTION_HMAC_SECRET \
    --config services/reactions/wrangler.jsonc
npx --no-install wrangler deploy --strict \
  --config services/reactions/wrangler.jsonc
```

`wrangler secret put` immediately publishes a secret-bearing version. The
following strict deploy publishes the final checked-in code/config version.
Commit only the generated D1 UUID; inspect the diff before committing.

Create the GitHub environment and enter CI secrets interactively:

```bash
gh api --method PUT \
  repos/KYBee/KYBee.github.io/environments/production-reactions
gh secret set CLOUDFLARE_API_TOKEN --env production-reactions
gh secret set CLOUDFLARE_ACCOUNT_ID --env production-reactions
```

Set `PUBLIC_REACTIONS_API_URL` from the exact HTTPS origin printed by Wrangler.
Never guess a Worker origin, account ID, token, or database UUID.

## Routine deployment and smoke

The Worker workflow runs only after the same commit's GitHub Pages deployment
succeeds. It lists and applies additive migrations, deploys the Worker, and
runs a read-only bootstrap smoke in that order.

To dispatch and watch the checked-in workflow from `main`:

```bash
gh workflow run reactions-deploy.yml --ref main
RUN_ID="$(
  gh run list \
    --workflow reactions-deploy.yml \
    --branch main \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId'
)"
gh run watch "$RUN_ID" --exit-status
PUBLIC_REACTIONS_API_URL="$(
  gh variable get PUBLIC_REACTIONS_API_URL
)" node scripts/smoke-reactions-api.mjs
```

The smoke script may issue a signed token but never calls `PUT` and never
creates a reaction row.

## Migration and rollback rules

- Never edit a migration after it has been applied remotely.
- Every new migration is additive and backward-compatible with the previously
  deployed Worker.
- Never use `wrangler d1 execute`, reset, drop, or delete as a deployment or
  rollback mechanism.
- If a migration succeeds and deployment fails, fix forward or redeploy a
  known-good Worker commit that remains compatible with the expanded schema.
- A Worker rollback redeploys a reviewed full commit SHA that is an ancestor
  of `main`; D1 is not rolled back.
- A frontend rollback reverts only the UI commit and leaves Worker/D1 data
  intact.
- Use D1 recovery only after explicit approval and after stating the recovery
  point and possible loss window.

## References

- [Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)
- [Workers Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
- [D1 testing and migrations](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [Rate Limiting bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
````

- [ ] **Step 10: Run full Phase-A verification and commit**

```bash
npm run verify
git add .github/workflows/deploy.yml \
  .github/workflows/reactions-deploy.yml \
  scripts/validate-reactions-env.mjs \
  scripts/smoke-reactions-api.mjs \
  tests/reactions-env.test.mjs \
  tests/reactions-smoke.test.mjs \
  tests/workflows.test.mjs \
  services/reactions/README.md \
  package.json package-lock.json
git commit -m "ci: deploy persistent reactions safely"
```

Expected: the repository's required `verify` pipeline now includes frontend
contract tests, local Worker/D1 tests, Worker typecheck/bundle, the existing
content checks, Astro build, and site-output tests.

### Task 11: Provision D1/Worker and publish Phase A before exposing UI

**Files:**

- Modify automatically, then inspect:
  `services/reactions/wrangler.jsonc`
- Verify remotely:
  `https://kybee.github.io/reaction-targets.json`
- Verify remotely: the deployed Worker URL

This task changes Cloudflare and GitHub state. During execution, pause only
when browser login, an API token, or an explicit PR merge authorization is
actually required. Never invent an account ID, database UUID, API token,
Worker subdomain, or secret.

- [ ] **Step 1: Re-run the complete local gate**

```bash
npm ci
npm run verify
git status --short
```

Expected: all checks pass. The only uncommitted change should be none.

- [ ] **Step 2: Authenticate and inspect the target Cloudflare account**

```bash
npx --no-install wrangler login
npx --no-install wrangler whoami
```

Expected: the intended Cloudflare account is shown. Confirm namespace IDs
`2026072601` and `2026072602` are not reused by another rate-limit binding in
that account before continuing.

- [ ] **Step 3: Create D1 and let Wrangler write the real binding**

```bash
npx --no-install wrangler d1 create kybee-reactions \
  --binding DB \
  --location apac \
  --update-config \
  --config services/reactions/wrangler.jsonc
```

Expected: Wrangler adds a `d1_databases` entry whose binding is `DB`, database
name is `kybee-reactions`, database ID exactly matches the UUID printed by the
create command, and migrations directory is `migrations`. If Wrangler omits
only the migrations directory, add this exact property to that generated
entry:

```jsonc
{
  "migrations_dir": "migrations"
}
```

```bash
git diff -- services/reactions/wrangler.jsonc
npx --no-install wrangler d1 list
```

Expected: the same real UUID appears in config and the account listing.

- [ ] **Step 4: Apply the additive migration remotely**

```bash
npx --no-install wrangler d1 migrations list kybee-reactions \
  --remote \
  --config services/reactions/wrangler.jsonc
npx --no-install wrangler d1 migrations apply kybee-reactions \
  --remote \
  --config services/reactions/wrangler.jsonc
```

Expected: `0001_create_reactions.sql` is applied once. Do not use
`d1 execute`, reset, or delete.

- [ ] **Step 5: Create the required Worker secret without exposing it**

Run:

```bash
openssl rand -hex 32 | \
  npx --no-install wrangler secret put REACTION_HMAC_SECRET \
    --config services/reactions/wrangler.jsonc
```

Expected: Wrangler confirms the secret was stored. `wrangler secret put`
creates and immediately deploys a secret-bearing Worker version; record this
as the first external deployment. The random value is not shown in terminal
output, shell history, Git diff, or a file.

- [ ] **Step 6: Deploy the final code/config version and verify preflight**

```bash
npx --no-install wrangler deploy --strict \
  --config services/reactions/wrangler.jsonc
```

Copy the exact deployed HTTPS origin from Wrangler's output, then run this
prompt and paste only that origin:

```bash
set -euo pipefail
read -r "REACTIONS_PRODUCTION_ORIGIN?Worker HTTPS origin: "
PUBLIC_REACTIONS_API_URL="$REACTIONS_PRODUCTION_ORIGIN" \
  node scripts/validate-reactions-env.mjs --required
curl --fail-with-body --silent --show-error \
  -X OPTIONS \
  -H 'Origin: https://kybee.github.io' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization, content-type' \
  -D - \
  -o /dev/null \
  "$REACTIONS_PRODUCTION_ORIGIN/v1/reactions/bootstrap"
gh variable set PUBLIC_REACTIONS_API_URL \
  --body "$REACTIONS_PRODUCTION_ORIGIN"
```

Expected: `204`, exact allowed origin, `Vary: Origin`, and approved
methods/headers, followed by creation of the public repository variable.
Bootstrap may still be `503` until Phase A publishes the manifest, which is
expected.

- [ ] **Step 7: Create the environment-scoped GitHub deployment values**

Create the environment:

```bash
gh api --method PUT \
  repos/KYBee/KYBee.github.io/environments/production-reactions
```

Create a least-privilege Cloudflare API token for only the target account's
Worker Scripts and D1 edit/deploy operations. When prompted, set values without
placing them in command arguments:

```bash
gh secret set CLOUDFLARE_API_TOKEN --env production-reactions
gh secret set CLOUDFLARE_ACCOUNT_ID --env production-reactions
```

This creates environment-scoped secrets but does not claim a reviewer gate.
If the repository owner separately configures a required reviewer, retain it.
Verify names, never values:

```bash
gh secret list --env production-reactions
gh variable list
```

- [ ] **Step 8: Commit the real D1 binding**

```bash
npm run verify
git add services/reactions/wrangler.jsonc
git commit -m "chore: bind production reactions database"
```

Expected: the only new value is the non-secret real D1 UUID.

- [ ] **Step 9: Review and publish the Phase-A branch**

Use the `requesting-code-review` skill, address findings, and rerun
`npm run verify`. Then use the `finishing-a-development-branch` skill to push
the branch and open a draft PR that explicitly says:

- Phase A publishes no visible reaction controls;
- D1 starts empty;
- Worker bootstrap is fail-closed until Pages publishes the manifest;
- migrations are additive;
- Phase B follows only after the production smoke succeeds.

Do not merge unless the user has authorized the merge for this implementation
run.

- [ ] **Step 10: After authorized merge, wait for both production workflows**

Inspect GitHub Actions until:

1. GitHub Pages publishes `/reaction-targets.json`;
2. the Worker workflow applies no unexpected migrations;
3. the Worker deploy completes;
4. the bounded production smoke bootstrap succeeds.

Run a final independent read-only check:

```bash
curl --fail-with-body --silent --show-error \
  https://kybee.github.io/reaction-targets.json
PUBLIC_REACTIONS_API_URL="$(gh variable get PUBLIC_REACTIONS_API_URL)" \
  node scripts/smoke-reactions-api.mjs
```

Expected: the content-derived manifest targets and zero-filled reaction
snapshots. No visible portfolio markup has changed yet.

- [ ] **Step 11: Start Phase B from the published main**

Fetch the verified merge and create a fresh UI branch/worktree using the
`using-git-worktrees` skill:

Fetch `origin/main`, then let that skill create
`feat/shared-project-reactions-ui` in a clean sibling worktree. Do not switch a
dirty worktree in place. Confirm `PUBLIC_REACTIONS_API_URL` is still present as
a GitHub repository variable before implementing visible controls.

## Phase B — accessible project UI and browser behavior

### Task 12: Replace fake counts with hidden-until-bootstrap accessible markup

**Files:**

- Create: `src/components/ReactionControls.astro`
- Create: `src/styles/reactions.css`
- Modify: `src/components/Workspace.astro`
- Modify: `tests/site-output.test.mjs`

- [ ] **Step 1: Add failing production-output assertions**

In the existing `findTags` helper in `tests/site-output.test.mjs`, add the
opening-tag position to its return value:

```js
function findTags(html, tagName) {
  const escapedTagName = escapeRegExp(tagName);
  const tagPattern = new RegExp(
    `<${escapedTagName}(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>`,
    'gi',
  );

  return Array.from(html.matchAll(tagPattern), (match) => ({
    attributes: parseQuotedAttributes(match[0]),
    end: match.index + match[0].length,
    source: match[0],
    start: match.index,
  }));
}
```

Add these HTML helpers after `findTags`:

```js
function hasAttribute(tag, attributeName) {
  const pattern = new RegExp(
    `\\s${escapeRegExp(attributeName)}(?:\\s*=|(?=\\s|/?>))`,
    'i',
  );
  return pattern.test(tag.source);
}

function hasClass(tag, className) {
  return (tag.attributes.class ?? '')
    .split(/\s+/u)
    .includes(className);
}

function extractElementHtml(html, openingTag, tagName) {
  const escapedTagName = escapeRegExp(tagName);
  const tagPattern = new RegExp(
    `<\\/?${escapedTagName}(?=[\\s>])(?:[^>"']|"[^"]*"|'[^']*')*>`,
    'gi',
  );
  tagPattern.lastIndex = openingTag.start;
  let depth = 0;

  for (
    let match = tagPattern.exec(html);
    match !== null;
    match = tagPattern.exec(html)
  ) {
    if (/^<\//u.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(
          openingTag.start,
          match.index + match[0].length,
        );
      }
    } else if (!/\/>$/u.test(match[0])) {
      depth += 1;
    }
  }

  assert.fail(`Expected ${openingTag.source} to have a closing tag`);
}

function sectionHtml(html, id) {
  const sectionTag = findTags(html, 'section').find(
    (tag) => tag.attributes.id === id,
  );
  assert.ok(sectionTag, `Expected #${id}`);
  return extractElementHtml(html, sectionTag, 'section');
}

function renderedReactionTargets(html) {
  const affectedHtml = [
    sectionHtml(html, 'work-projects'),
    sectionHtml(html, 'side-projects'),
  ].join('\n');
  return Array.from(
    affectedHtml.matchAll(/data-reaction-target="([^"]+)"/gu),
    (match) => match[1],
  ).sort();
}

function reactionMessages(html) {
  const affectedHtml = [
    sectionHtml(html, 'work-projects'),
    sectionHtml(html, 'side-projects'),
  ].join('\n');
  return findTags(affectedHtml, 'div')
    .filter((tag) => tag.attributes['data-reaction-target'])
    .map((tag) => ({
      html: extractElementHtml(affectedHtml, tag, 'div'),
      target: tag.attributes['data-reaction-target'],
    }));
}

function assertReactionControls(message, pagePath) {
  const controlTags = findTags(message.html, 'div').filter((tag) =>
    hasAttribute(tag, 'data-reaction-controls'),
  );
  assert.equal(
    controlTags.length,
    1,
    `Expected one reaction control for ${message.target} in ${pagePath}`,
  );
  const controls = controlTags[0];
  const controlsHtml = extractElementHtml(
    message.html,
    controls,
    'div',
  );
  assert.ok(
    hasAttribute(controls, 'hidden'),
    `Expected initially hidden controls for ${message.target}`,
  );

  const openers = findTags(controlsHtml, 'button').filter((tag) =>
    hasAttribute(tag, 'data-reaction-opener'),
  );
  assert.equal(
    openers.length,
    1,
    `Expected one opener for ${message.target}`,
  );
  const opener = openers[0];
  assert.equal(opener.attributes.type, 'button');
  assert.ok(opener.attributes['aria-label']);
  assert.equal(opener.attributes['aria-expanded'], 'false');
  assert.ok(opener.attributes['aria-controls']);

  const panels = findTags(controlsHtml, 'div').filter((tag) =>
    hasAttribute(tag, 'data-reaction-panel'),
  );
  assert.equal(
    panels.length,
    1,
    `Expected one action panel for ${message.target}`,
  );
  const panel = panels[0];
  assert.equal(panel.attributes.id, opener.attributes['aria-controls']);
  assert.ok(hasAttribute(panel, 'hidden'));
  const panelHtml = extractElementHtml(controlsHtml, panel, 'div');
  const actionButtons = findTags(panelHtml, 'button');

  assert.deepEqual(
    actionButtons.map(
      (button) => button.attributes['data-reaction-emoji'],
    ),
    ['👍', '🔥', '🎉', '👏'],
  );
  for (const button of actionButtons) {
    assert.equal(button.attributes.type, 'button');
    assert.ok(button.attributes['aria-label']);
    assert.equal(button.attributes['aria-pressed'], 'false');
    assert.ok(
      hasAttribute(button, 'disabled'),
      `Expected ${button.attributes['data-reaction-emoji']} disabled before bootstrap`,
    );
  }

  const countChipButtons = findTags(controlsHtml, 'button').filter(
    (tag) =>
      hasAttribute(tag, 'data-reaction-count-chip') ||
      hasClass(tag, 'reaction-count-chip'),
  );
  assert.equal(
    countChipButtons.length,
    0,
    `Expected no server-rendered count chips for ${message.target}`,
  );

  const metadataPills = findTags(message.html, 'span').filter(
    (tag) => hasClass(tag, 'tag-pill') || hasClass(tag, 'badge-pill'),
  );
  for (const pill of metadataPills) {
    assert.equal(
      controlsHtml.includes(pill.source),
      false,
      `Expected project metadata outside hidden controls for ${message.target}`,
    );
  }
}

function assertReactionChannelStatus(section, channel, pagePath) {
  const statuses = findTags(section, 'div').filter(
    (tag) =>
      tag.attributes['data-reaction-channel-status'] === channel,
  );
  assert.equal(
    statuses.length,
    1,
    `Expected one ${channel} bootstrap region in ${pagePath}`,
  );
  const status = statuses[0];
  assert.ok(hasAttribute(status, 'hidden'));
  assert.ok(status.attributes['data-bootstrap-error']);
  assert.ok(status.attributes['data-retrying']);

  const statusHtml = extractElementHtml(section, status, 'div');
  const retryButtons = findTags(statusHtml, 'button').filter((tag) =>
    hasAttribute(tag, 'data-reaction-retry'),
  );
  assert.equal(retryButtons.length, 1);
  assert.equal(retryButtons[0].attributes.type, 'button');

  const liveStatuses = findTags(statusHtml, 'span').filter((tag) =>
    hasAttribute(tag, 'data-reaction-bootstrap-status'),
  );
  assert.equal(liveStatuses.length, 1);
  assert.equal(liveStatuses[0].attributes['aria-live'], 'polite');
}
```

Add these tests:

```js
test('reaction targets in both languages exactly match the built manifest', async () => {
  const [koHtml, enHtml, manifest] = await Promise.all([
    readFile('dist/index.html', 'utf8'),
    readFile('dist/en/index.html', 'utf8'),
    readFile('dist/reaction-targets.json', 'utf8').then(JSON.parse),
  ]);

  assert.deepEqual(
    renderedReactionTargets(koHtml),
    manifest.targets,
  );
  assert.deepEqual(
    renderedReactionTargets(enHtml),
    manifest.targets,
  );

  for (const [pagePath, html] of [
    ['dist/index.html', koHtml],
    ['dist/en/index.html', enHtml],
  ]) {
    const work = sectionHtml(html, 'work-projects');
    const side = sectionHtml(html, 'side-projects');
    const outsideAffectedChannels = html
      .replace(work, '')
      .replace(side, '');
    assert.equal(
      findTags(outsideAffectedChannels, 'div').filter((tag) =>
        hasAttribute(tag, 'data-reaction-target'),
      ).length,
      0,
      `Expected reaction targets only in project channels for ${pagePath}`,
    );
    assertReactionChannelStatus(work, 'work', pagePath);
    assertReactionChannelStatus(side, 'side', pagePath);
  }
});

test('reaction controls are hidden, accessible, and empty before bootstrap', async () => {
  for (const pagePath of ['dist/index.html', 'dist/en/index.html']) {
    const html = await readFile(pagePath, 'utf8');
    const messages = reactionMessages(html);
    const manifest = JSON.parse(
      await readFile('dist/reaction-targets.json', 'utf8'),
    );

    assert.equal(messages.length, manifest.targets.length);
    for (const message of messages) {
      assertReactionControls(message, pagePath);
    }
  }
});

test('fake reaction decorations are absent from production output', async () => {
  const output = (
    await Promise.all([
      readFile('dist/index.html', 'utf8'),
      readFile('dist/en/index.html', 'utf8'),
    ])
  ).join('\n');

  assert.doesNotMatch(output, /reaction-pill/u);
  assert.doesNotMatch(output, /reactionSets/u);
  for (const fakeCount of [
    '🔥 5',
    '👍 2',
    '🎉 3',
    '💯 1',
    '🚀 4',
    '👏 2',
    '✅ 3',
    '👍 1',
  ]) {
    const [emoji, count] = fakeCount.split(' ');
    assert.doesNotMatch(
      output,
      new RegExp(`${escapeRegExp(emoji)}\\s*${count}`, 'u'),
      `Expected fake reaction ${fakeCount} to be removed`,
    );
  }
});
```

These assertions derive the target set and message count from
`dist/reaction-targets.json`. Adding, removing, or reordering a valid Pages CMS
project does not require a test edit.

- [ ] **Step 2: Build and verify RED**

```bash
npm run build
node --test --test-name-pattern='reaction controls|reaction targets|fake reaction' \
  tests/site-output.test.mjs
```

Expected: FAIL because current output still contains hardcoded decorative
reactions and has no accessible controls.

- [ ] **Step 3: Create the reusable reaction markup**

Create `src/components/ReactionControls.astro`:

```astro
---
import { REACTION_EMOJIS, type ReactionTargetId } from
  '../lib/reactions/contracts';

interface Props {
  targetId: ReactionTargetId;
  projectName: string;
  openLabel: string;
  actionLabel: string;
  countLabel: string;
  writeError: string;
}

const {
  targetId,
  projectName,
  openLabel,
  actionLabel,
  countLabel,
  writeError,
} = Astro.props;
const controlId = `reactions-${targetId.replace(':', '-')}`;
---

<div
  class="reaction-controls"
  data-reaction-controls
  data-reaction-project-name={projectName}
  data-reaction-count-label={countLabel}
  data-reaction-write-error={writeError}
  hidden
>
  <button
    class="reaction-launcher"
    type="button"
    aria-label={`${openLabel}: ${projectName}`}
    aria-expanded="false"
    aria-controls={controlId}
    data-reaction-opener
  >
    <span aria-hidden="true">☺+</span>
  </button>
  <div
    id={controlId}
    class="reaction-action-bar"
    role="group"
    aria-label={`${openLabel}: ${projectName}`}
    data-reaction-panel
    hidden
  >
    {REACTION_EMOJIS.map((emoji) => (
      <button
        type="button"
        class="reaction-action"
        data-reaction-emoji={emoji}
        aria-label={`${projectName}: ${emoji} ${actionLabel}`}
        aria-pressed="false"
        disabled
      >
        <span aria-hidden="true">{emoji}</span>
      </button>
    ))}
  </div>
  <div
    class="reaction-counts"
    data-reaction-counts
    aria-label={`${projectName} ${openLabel}`}
  ></div>
  <span
    class="reaction-write-status"
    data-reaction-write-status
    role="status"
    aria-live="polite"
  ></span>
</div>
```

Do not place tags, tech pills, or badges inside this component.

- [ ] **Step 4: Preserve entry IDs and share the exact work selection**

Replace the existing Astro/content and component imports at the top of
`Workspace.astro` with:

```astro
import { getCollection } from 'astro:content';
import Avatar from './Avatar.astro';
import ReactionControls from './ReactionControls.astro';
import {
  compareEntryOrder,
  getCurrentProjectEntries,
  groupProjectEntries,
} from '../lib/project-groups';
import { toReactionTargetId } from '../lib/reactions/targets';
import '../styles/reactions.css';
```

Delete the local `byOrder` helper. Replace the contiguous block beginning
with `const about = aboutEntries[0].data;` and ending immediately before
`const initials = 'YB';` with:

```ts
const about = aboutEntries[0].data;
const projects = [...projectEntries].sort(compareEntryOrder);
const sideProjects = [...sideProjectEntries].sort(compareEntryOrder);
const education = [...educationEntries]
  .sort(compareEntryOrder)
  .map((entry) => entry.data)[0];
const certifications = [...certEntries]
  .sort(compareEntryOrder)
  .map((entry) => entry.data);
const skills = [...skillEntries]
  .sort(compareEntryOrder)
  .map((entry) => entry.data);

const projectGroups = groupProjectEntries(projects);
const workProjectEntries = getCurrentProjectEntries(projects);
const firstJob = projects[0]?.data;
```

This exact replacement removes the local `ProjectData` and `ProjectGroup`
types, the hand-written grouping loop, `samsungItems`, and the complete
`reactionSets` constant while retaining the existing non-project data shapes.

In both `copy.ko` and `copy.en`, replace the existing `previews` object with
this entry-aware version:

```ts
previews: {
  experience: projectGroups
    .map((group) => group.company)
    .join(' · '),
  'work-projects': workProjectEntries
    .slice(0, 2)
    .map((entry) => entry.data.title)
    .join(' · '),
  'side-projects': sideProjects
    .slice(0, 2)
    .map((entry) => entry.data.name)
    .join(' · '),
  skills: skills.map((group) => group.category).join(' · '),
  education: education?.detail ?? '',
},
```

Replace the complete `{projectGroups.map(...)}` expression in the
`#experience` message with:

```astro
{projectGroups.map((group, groupIndex) => (
  <div class="job-group">
    <div class="job-header">
      <p class="job-company">{group.company}</p>
      <p class="job-role">{formatRole(group.role)}</p>
      <p class="job-meta">
        {group.period}
        {group.location ? ` · ${group.location}` : ''}
      </p>
    </div>
    {groupIndex === 0 ? (
      <p class="message-summary">{about.work}</p>
    ) : (
      group.items.map((entry) => {
        const item = entry.data;
        return (
          <>
            {item.summary && (
              <p class="message-summary">{item.summary}</p>
            )}
            {item.tags.length > 0 && (
              <div class="reactions">
                {item.tags.map((tag) => (
                  <span class="tag-pill">{tag}</span>
                ))}
              </div>
            )}
          </>
        );
      })
    )}
  </div>
))}
```

Keep both existing `workProjectsContext` expressions based on `firstJob`.
Step 6 below replaces the complete work and side-project map expressions, so
no data-only project reference remains after these two steps.

- [ ] **Step 5: Add localized reaction copy**

Add the same shape under `copy.ko` and `copy.en`:

```ts
reactions: {
  open: '리액션 열기',
  action: '리액션 추가 또는 취소',
  countLabel: '{emoji} 리액션 {count}개, 추가 또는 취소',
  bootstrapError: '리액션을 불러오지 못했어요.',
  retry: '리액션 다시 시도',
  retrying: '리액션을 다시 불러오는 중이에요.',
  writeError: '리액션을 저장하지 못했어요. 다시 눌러 주세요.',
},
```

```ts
reactions: {
  open: 'Open reactions',
  action: 'add or remove reaction',
  countLabel: '{emoji}, {count} reactions, add or remove',
  bootstrapError: 'Reactions could not be loaded.',
  retry: 'Retry reactions',
  retrying: 'Loading reactions again.',
  writeError: 'The reaction was not saved. Please try again.',
},
```

Use the existing `const t = copy[lang]` rather than introducing another
translation source.

- [ ] **Step 6: Render targets only for current work and all side projects**

For each work message:

```astro
{workProjectEntries.map((entry) => {
  const item = entry.data;
  const targetId = toReactionTargetId('projects', entry.id);
  const projectName = item.title ?? item.company;
  return (
    <div
      class="message reaction-message"
      data-reaction-target={targetId}
      tabindex="-1"
    >
      <div class="avatar"><Avatar initials={initials} size={44} /></div>
      <div class="message-body">
        <div class="message-meta">
          <span class="message-author">{about.name}</span>
          <span class="message-time">
            {item.company} · {item.period}
          </span>
        </div>
        {item.title && <p class="message-title">{item.title}</p>}
        {item.summary && <p class="message-summary">{item.summary}</p>}
        {item.bullets && (
          <ul class="message-bullets">
            {item.bullets.map((bullet) => <li>{bullet}</li>)}
          </ul>
        )}
        {item.metric && (
          <blockquote class="quote-block">{item.metric}</blockquote>
        )}
        <div class="reactions">
          <ReactionControls
            targetId={targetId}
            projectName={projectName}
            openLabel={t.reactions.open}
            actionLabel={t.reactions.action}
            countLabel={t.reactions.countLabel}
            writeError={t.reactions.writeError}
          />
          {item.tags.map((tag) => (
            <span class="tag-pill">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
})}
```

Render side projects with this exact map body:

```astro
{sideProjects.map((entry) => {
  const project = entry.data;
  const targetId = toReactionTargetId('sideProjects', entry.id);
  return (
    <div
      class="message reaction-message"
      data-reaction-target={targetId}
      tabindex="-1"
    >
      <div class="avatar"><Avatar initials={initials} size={44} /></div>
      <div class="message-body">
        <div class="message-meta">
          <span class="message-author">{about.name}</span>
        </div>
        <p class="message-title">
          {project.url ? (
            <a href={project.url} target="_blank" rel="noopener">
              {project.name}
            </a>
          ) : project.name}
        </p>
        <p class="message-summary">{project.description}</p>
        <div class="reactions">
          <ReactionControls
            targetId={targetId}
            projectName={project.name}
            openLabel={t.reactions.open}
            actionLabel={t.reactions.action}
            countLabel={t.reactions.countLabel}
            writeError={t.reactions.writeError}
          />
          <span class="tag-pill">{project.tech}</span>
          {project.badge && (
            <span class="badge-pill">{project.badge}</span>
          )}
        </div>
      </div>
    </div>
  );
})}
```

Always render the `.reactions` metadata row for a reaction target, even if a
work project has no metric or tags. Do not add reaction target attributes to
experience, skills, or education messages.

After the messages in each affected channel, add one region:

```astro
<div
  class="reaction-channel-status"
  data-reaction-channel-status="work"
  data-bootstrap-error={t.reactions.bootstrapError}
  data-retrying={t.reactions.retrying}
  hidden
>
  <span data-reaction-bootstrap-status aria-live="polite"></span>
  <button type="button" data-reaction-retry>
    {t.reactions.retry}
  </button>
</div>
```

Use `side` for the side-project channel.

- [ ] **Step 7: Add token-based reaction styling**

Create `src/styles/reactions.css`. Use existing variables only. Required
rules:

```css
.reaction-message {
  position: relative;
}

.reaction-controls:not([hidden]) {
  display: contents;
}

.reaction-launcher,
.reaction-action-bar {
  position: absolute;
  z-index: 3;
  top: calc(var(--space-3) * -1);
}

.reaction-launcher {
  right: var(--space-2);
  opacity: 0;
  pointer-events: none;
}

.reaction-message:hover .reaction-launcher,
.reaction-message:focus-within .reaction-launcher,
.reaction-message.is-reaction-open .reaction-launcher {
  opacity: 1;
  pointer-events: auto;
}

.reaction-action-bar:not([hidden]) {
  display: inline-flex;
  right: calc(var(--space-2) + 2.5rem);
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}

.reaction-launcher,
.reaction-action,
.reaction-count-chip,
.reaction-channel-status button {
  border: 1px solid var(--border);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font: inherit;
  line-height: 1;
  touch-action: manipulation;
}

.reaction-launcher {
  min-width: 2rem;
  min-height: 2rem;
  padding: var(--space-1) var(--space-2);
  font-size: var(--fs-xs);
}

.reaction-action {
  min-width: 2rem;
  min-height: 2rem;
  padding: var(--space-1);
  font-size: var(--fs-sm);
}

.reaction-count-chip,
.reaction-channel-status button {
  min-height: 1.75rem;
  padding: 2px var(--space-2);
  font-size: var(--fs-xs);
}

.reaction-action[aria-pressed='true'],
.reaction-count-chip[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-dim);
}

.reaction-action:focus-visible,
.reaction-count-chip:focus-visible,
.reaction-launcher:focus-visible,
.reaction-channel-status button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.reaction-counts {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.reaction-counts:empty {
  display: none;
}

.reaction-write-status:empty {
  display: none;
}

.reaction-write-status:not(:empty) {
  display: block;
  flex-basis: 100%;
  margin-top: var(--space-1);
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  line-height: var(--lh-body);
}

.reaction-channel-status:not([hidden]) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: var(--content-max-width);
  margin: 0 0 var(--space-block) calc(44px + var(--space-3));
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.reaction-action:disabled,
.reaction-count-chip:disabled {
  cursor: wait;
  opacity: 0.6;
}

@media (max-width: 767px) {
  .reaction-launcher,
  .reaction-action-bar {
    top: calc(var(--space-2) * -1);
  }

  .reaction-action-bar:not([hidden]) {
    right: calc(var(--space-1) + 2.5rem);
  }

  .reaction-channel-status:not([hidden]) {
    margin-left: 0;
  }
}
```

Retain the existing `.reactions`, `.tag-pill`, and `.badge-pill` rules. Remove
only `.reaction-pill` from the shared pill selector. The visible
`.reaction-write-status:not(:empty)` is also announced through `role=status`;
do not convert it to a visually hidden utility. Native `[hidden]` wins because
every author display rule is guarded with `:not([hidden])`.

- [ ] **Step 8: Build, run GREEN, and commit**

```bash
npm run build
node --test --test-name-pattern='reaction controls|reaction targets|fake reaction' \
  tests/site-output.test.mjs
npm run test:site
git add src/components/ReactionControls.astro \
  src/components/Workspace.astro \
  src/styles/reactions.css \
  tests/site-output.test.mjs
git commit -m "feat: replace fake project reactions"
```

Expected: the real controls exist but remain hidden and disabled because
bootstrap wiring has not been added yet. Existing tags, badges, links, and
project text are unchanged.

### Task 13: Implement one-panel desktop, keyboard, and mobile interaction

**Files:**

- Create: `src/scripts/reactions/interaction-controller.ts`
- Test/Create: `tests/reactions/fixtures.ts`
- Test/Create: `tests/reactions/interaction-controller.test.ts`

- [ ] **Step 1: Create the shared DOM/data fixture and interaction tests**

Create `tests/reactions/fixtures.ts`:

```ts
import {
  REACTION_EMOJIS,
  createEmptyReactionCounts,
  type BootstrapResponse,
  type ReactionEmoji,
  type ReactionSnapshot,
  type ReactionTargetId,
} from '../../src/lib/reactions/contracts';

export const TEST_VISITOR_TOKEN =
  `v1.${'a'.repeat(43)}.${'b'.repeat(43)}`;

export interface ControllableMediaQueryList extends MediaQueryList {
  setMatches(matches: boolean): void;
}

export function createMediaQueryList(
  initialMatches: boolean,
): ControllableMediaQueryList {
  const eventTarget = new EventTarget();
  let matches = initialMatches;
  let onchange: ((event: MediaQueryListEvent) => void) | null = null;
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(hover: hover) and (pointer: fine)',
    get onchange() {
      return onchange;
    },
    set onchange(
      listener: ((event: MediaQueryListEvent) => void) | null,
    ) {
      onchange = listener;
    },
    addListener(listener: (event: MediaQueryListEvent) => void) {
      eventTarget.addEventListener('change', listener as EventListener);
    },
    removeListener(listener: (event: MediaQueryListEvent) => void) {
      eventTarget.removeEventListener('change', listener as EventListener);
    },
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      eventTarget.addEventListener(type, listener, options);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      eventTarget.removeEventListener(type, listener, options);
    },
    dispatchEvent(event: Event) {
      return eventTarget.dispatchEvent(event);
    },
    setMatches(nextMatches: boolean) {
      if (matches === nextMatches) return;
      matches = nextMatches;
      const event = new Event('change') as MediaQueryListEvent;
      eventTarget.dispatchEvent(event);
      onchange?.(event);
    },
  };
  return mediaQuery as ControllableMediaQueryList;
}

export function createReactionMessage(options: {
  target: ReactionTargetId;
  controlsHidden?: boolean;
  actionsDisabled?: boolean;
  title?: string;
}): HTMLElement {
  const {
    target,
    controlsHidden = false,
    actionsDisabled = false,
    title = target,
  } = options;
  const id = `reactions-${target.replace(':', '-')}`;
  const message = document.createElement('article');
  message.className = 'reaction-message';
  message.dataset.reactionTarget = target;
  message.tabIndex = -1;
  message.innerHTML = `
    <p class="message-title">
      <a href="https://example.com/${target.replace(':', '-')}">${title}</a>
    </p>
    <p class="message-summary">Ordinary project summary</p>
    <div class="reactions">
      <div data-reaction-controls data-reaction-project-name="${title}"
        data-reaction-count-label="{emoji} reaction count {count}"
        data-reaction-write-error="The reaction was not saved."
        ${controlsHidden ? 'hidden' : ''}>
        <button type="button" data-reaction-opener
          aria-label="Open reactions: ${title}" aria-expanded="false"
          aria-controls="${id}">Open</button>
        <div id="${id}" data-reaction-panel role="group" hidden>
          ${REACTION_EMOJIS.map(
            (emoji) => `<button type="button" data-reaction-emoji="${emoji}"
              aria-pressed="false" ${actionsDisabled ? 'disabled' : ''}>
              ${emoji}</button>`,
          ).join('')}
        </div>
        <div data-reaction-counts></div>
        <span data-reaction-write-status role="status"
          aria-live="polite"></span>
      </div>
      <span class="tag-pill">TypeScript</span>
      <span class="badge-pill">Featured</span>
    </div>
  `;
  return message;
}

export interface ReactionPageFixture {
  root: HTMLElement;
  messages: Record<'workAlpha' | 'workBeta' | 'sideBooster', HTMLElement>;
  targets: ReactionTargetId[];
  regions: HTMLElement[];
}

export function createReactionPageFixture(): ReactionPageFixture {
  document.body.innerHTML = '';
  const root = document.createElement('main');
  const work = document.createElement('section');
  const side = document.createElement('section');
  work.id = 'work-projects';
  side.id = 'side-projects';
  const workAlpha = createReactionMessage({
    target: 'work:alpha', title: 'Alpha',
    controlsHidden: true, actionsDisabled: true,
  });
  const workBeta = createReactionMessage({
    target: 'work:beta', title: 'Beta',
    controlsHidden: true, actionsDisabled: true,
  });
  const sideBooster = createReactionMessage({
    target: 'side:booster', title: 'Booster',
    controlsHidden: true, actionsDisabled: true,
  });
  work.append(workAlpha, workBeta, createChannelStatus('work'));
  side.append(sideBooster, createChannelStatus('side'));
  root.append(work, side);
  document.body.append(root);
  return {
    root,
    messages: { workAlpha, workBeta, sideBooster },
    targets: ['work:alpha', 'work:beta', 'side:booster'],
    regions: [
      requiredElement(work, '[data-reaction-channel-status]'),
      requiredElement(side, '[data-reaction-channel-status]'),
    ],
  };
}

export function createChannelStatus(channel: string): HTMLElement {
  const region = document.createElement('div');
  region.dataset.reactionChannelStatus = channel;
  region.dataset.bootstrapError = `Could not load ${channel} reactions.`;
  region.dataset.retrying = `Retrying ${channel} reactions.`;
  region.hidden = true;
  region.innerHTML = `
    <span data-reaction-bootstrap-status aria-live="polite"></span>
    <button type="button" data-reaction-retry>Retry reactions</button>
  `;
  return region;
}

export function snapshot(
  counts: Partial<Record<ReactionEmoji, number>> = {},
  selected: ReactionEmoji[] = [],
): ReactionSnapshot {
  return {
    counts: { ...createEmptyReactionCounts(), ...counts },
    selected: [...selected],
  };
}

export function bootstrapResponse(
  targets: readonly ReactionTargetId[],
  snapshots: Partial<Record<ReactionTargetId, ReactionSnapshot>> = {},
  visitorToken = TEST_VISITOR_TOKEN,
): BootstrapResponse {
  return {
    visitorToken,
    reactions: Object.fromEntries(
      targets.map((target) => [
        target,
        snapshots[target] ?? snapshot(),
      ]),
    ) as Record<ReactionTargetId, ReactionSnapshot>,
  };
}

export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected fixture element: ${selector}`);
  return element;
}

export function actionButton(
  message: ParentNode,
  emoji: ReactionEmoji,
): HTMLButtonElement {
  return requiredElement(message, `[data-reaction-emoji="${emoji}"]`);
}

export function countChip(
  message: ParentNode,
  emoji: ReactionEmoji,
): HTMLButtonElement | null {
  return message.querySelector(
    `[data-reaction-count-emoji="${emoji}"]`,
  );
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
```

Create `tests/reactions/interaction-controller.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReactionInteractionController } from
  '../../src/scripts/reactions/interaction-controller';
import {
  actionButton,
  countChip,
  createMediaQueryList,
  createReactionMessage,
  flushAsyncWork,
  requiredElement,
  type ControllableMediaQueryList,
} from './fixtures';

describe('reaction interaction controller', () => {
  let first: HTMLElement;
  let second: HTMLElement;
  let hover: ControllableMediaQueryList;
  let controller: ReturnType<typeof createReactionInteractionController>;

  beforeEach(() => {
    document.body.innerHTML = '';
    first = createReactionMessage({
      target: 'work:first', title: 'First project',
    });
    second = createReactionMessage({
      target: 'side:second', title: 'Second project',
    });
    document.body.append(first, second);
    hover = createMediaQueryList(true);
    controller = createReactionInteractionController({
      root: document, hoverMediaQuery: hover,
    });
  });

  afterEach(() => {
    controller.destroy();
    document.body.innerHTML = '';
  });

  const panel = (message: ParentNode) =>
    requiredElement<HTMLElement>(message, '[data-reaction-panel]');
  const opener = (message: ParentNode) =>
    requiredElement<HTMLButtonElement>(message, '[data-reaction-opener]');
  const summary = (message: ParentNode) =>
    requiredElement<HTMLElement>(message, '.message-summary');
  const enter = (message: HTMLElement) =>
    message.dispatchEvent(new Event('pointerenter'));
  const leave = (message: HTMLElement) =>
    message.dispatchEvent(new Event('pointerleave'));
  const expectOpen = (message: HTMLElement, expected: boolean) => {
    expect(message.classList.contains('is-reaction-open')).toBe(expected);
    expect(opener(message).getAttribute('aria-expanded')).toBe(
      String(expected),
    );
    expect(panel(message).hidden).toBe(!expected);
  };

  it('opens only the fine-pointer message under the pointer', () => {
    enter(first);
    expectOpen(first, true);
    expectOpen(second, false);
  });

  it('closes the previous panel when another message opens', () => {
    enter(first);
    enter(second);
    expectOpen(first, false);
    expectOpen(second, true);
  });

  it('keeps a panel open on pointerleave while it contains focus', () => {
    enter(first);
    actionButton(first, '👍').focus();
    leave(first);
    expectOpen(first, true);
    opener(second).focus();
    leave(first);
    expectOpen(first, false);
  });

  it('opens on keyboard focusin', () => {
    opener(first).focus();
    expectOpen(first, true);
  });

  it('Escape closes, restores launcher focus, and does not reopen', async () => {
    const firstOpener = opener(first);
    firstOpener.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushAsyncWork();
    expectOpen(first, false);
    expect(document.activeElement).toBe(firstOpener);
    expect(firstOpener.hidden).toBe(false);
    expect(getComputedStyle(firstOpener).visibility).not.toBe('hidden');
  });

  it('keeps closed panel actions outside the rendered tab sequence', () => {
    const firstPanel = panel(first);
    expect(firstPanel.hidden).toBe(true);
    expect(firstPanel.querySelectorAll('button')).toHaveLength(4);
    expect(
      [...firstPanel.querySelectorAll('button')].every(
        (button) => button.closest('[hidden]') === firstPanel,
      ),
    ).toBe(true);
  });

  it('opens and focuses a hoverless message from ordinary content', () => {
    hover.setMatches(false);
    summary(first).click();
    expectOpen(first, true);
    expect(document.activeElement).toBe(first);
  });

  it('closes an open hoverless message on its second content tap', async () => {
    hover.setMatches(false);
    summary(first).click();
    await flushAsyncWork();
    summary(first).click();
    expectOpen(first, false);
  });

  it('closes the mobile panel on an outside pointerdown', () => {
    hover.setMatches(false);
    summary(first).click();
    document.body.dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    expectOpen(first, false);
  });

  it.each([
    ['project link', '.message-title a'],
    ['tag', '.tag-pill'],
    ['badge', '.badge-pill'],
    ['opener', '[data-reaction-opener]'],
    ['action', '[data-reaction-emoji="👍"]'],
    ['count chip', '[data-reaction-count-emoji="👍"]'],
  ])('does not treat a %s tap as a mobile message toggle', async (
    _label,
    selector,
  ) => {
    hover.setMatches(false);
    requiredElement(first, '[data-reaction-counts]').insertAdjacentHTML(
      'beforeend',
      '<button type="button" data-reaction-count-emoji="👍">👍 1</button>',
    );
    expect(countChip(first, '👍')).not.toBeNull();
    summary(first).click();
    await flushAsyncWork();
    requiredElement<HTMLElement>(first, selector).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expectOpen(first, true);
  });

  it('destroy removes listeners and closes the active panel', () => {
    enter(first);
    controller.destroy();
    expectOpen(first, false);
    enter(second);
    opener(second).focus();
    summary(second).click();
    expectOpen(second, false);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:frontend -- \
  tests/reactions/interaction-controller.test.ts
```

Expected: FAIL because the controller module is missing.

- [ ] **Step 3: Implement explicit open-state control**

Create `src/scripts/reactions/interaction-controller.ts`:

```ts
export interface ReactionInteractionController {
  destroy(): void;
  close(): void;
}

export function createReactionInteractionController(options: {
  root: ParentNode;
  hoverMediaQuery?: MediaQueryList;
}): ReactionInteractionController {
  const { root } = options;
  const hoverMediaQuery =
    options.hoverMediaQuery ??
    window.matchMedia('(hover: hover) and (pointer: fine)');
  const messages = [
    ...root.querySelectorAll<HTMLElement>(
      '.reaction-message[data-reaction-target]',
    ),
  ];
  const hovered = new Set<HTMLElement>();
  const cleanups: Array<() => void> = [];
  let activeMessage: HTMLElement | null = null;
  let suppressFocusOpen = false;

  const parts = (message: HTMLElement) => {
    const controls = message.querySelector<HTMLElement>(
      '[data-reaction-controls]',
    );
    const opener = message.querySelector<HTMLButtonElement>(
      '[data-reaction-opener]',
    );
    const panel = message.querySelector<HTMLElement>(
      '[data-reaction-panel]',
    );
    if (!controls || !opener || !panel) return undefined;
    return { controls, opener, panel };
  };

  const closeMessage = (message: HTMLElement) => {
    const elements = parts(message);
    if (!elements) return;
    message.classList.remove('is-reaction-open');
    elements.opener.setAttribute('aria-expanded', 'false');
    elements.panel.hidden = true;
    if (activeMessage === message) activeMessage = null;
  };

  const close = () => {
    if (activeMessage) closeMessage(activeMessage);
  };

  const open = (message: HTMLElement) => {
    const elements = parts(message);
    if (!elements || elements.controls.hidden) return;
    if (activeMessage && activeMessage !== message) {
      closeMessage(activeMessage);
    }
    activeMessage = message;
    message.classList.add('is-reaction-open');
    elements.opener.setAttribute('aria-expanded', 'true');
    elements.panel.hidden = false;
  };

  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };

  for (const message of messages) {
    const elements = parts(message);
    if (!elements) continue;

    listen(message, 'pointerenter', () => {
      hovered.add(message);
      if (hoverMediaQuery.matches) open(message);
    });
    listen(message, 'pointerleave', () => {
      hovered.delete(message);
      if (
        hoverMediaQuery.matches &&
        !message.contains(document.activeElement)
      ) {
        closeMessage(message);
      }
    });
    listen(message, 'focusin', () => {
      if (!suppressFocusOpen) open(message);
    });
    listen(message, 'focusout', () => {
      queueMicrotask(() => {
        if (
          activeMessage === message &&
          !hovered.has(message) &&
          !message.contains(document.activeElement)
        ) {
          closeMessage(message);
        }
      });
    });
    listen(elements.opener, 'click', () => open(message));
    listen(message, 'click', (event) => {
      if (hoverMediaQuery.matches) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          'a, button, input, select, textarea, [role="button"], ' +
            '.tag-pill, .badge-pill, [data-reaction-ignore]',
        )
      ) {
        return;
      }

      const shouldOpen = activeMessage !== message;
      suppressFocusOpen = true;
      message.focus({ preventScroll: true });
      if (shouldOpen) open(message);
      else closeMessage(message);
      queueMicrotask(() => {
        suppressFocusOpen = false;
      });
    });
  }

  listen(document, 'keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape') return;
    if (!activeMessage) return;
    const opener = parts(activeMessage)?.opener;
    suppressFocusOpen = true;
    close();
    opener?.focus({ preventScroll: true });
    queueMicrotask(() => {
      suppressFocusOpen = false;
    });
  });

  listen(document, 'pointerdown', (event) => {
    if (hoverMediaQuery.matches || !activeMessage) return;
    const target = event.target;
    if (target instanceof Node && !activeMessage.contains(target)) close();
  });

  listen(hoverMediaQuery, 'change', close);

  return {
    close,
    destroy() {
      close();
      hovered.clear();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
```

Do not infer open state from CSS `:hover`; DOM/ARIA state is authoritative.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:frontend -- \
  tests/reactions/interaction-controller.test.ts
git add src/scripts/reactions/interaction-controller.ts \
  tests/reactions/fixtures.ts \
  tests/reactions/interaction-controller.test.ts
git commit -m "feat: add responsive reaction panel interactions"
```

Expected: desktop hover, keyboard focus/Escape, and mobile tap tests pass.

### Task 14: Add a no-retry API client and resilient visitor-token storage

**Files:**

- Create: `src/scripts/reactions/api-client.ts`
- Create: `src/scripts/reactions/token-store.ts`
- Test/Create: `tests/reactions/api-client.test.ts`
- Test/Reuse: `tests/reactions/fixtures.ts`

- [ ] **Step 1: Write transport and storage tests**

Create `tests/reactions/api-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  ReactionHttpError,
  createReactionApi,
} from '../../src/scripts/reactions/api-client';
import {
  VISITOR_TOKEN_STORAGE_KEY,
  createVisitorTokenStore,
} from '../../src/scripts/reactions/token-store';
import { TEST_VISITOR_TOKEN } from './fixtures';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const createFetch = (response: Response) =>
  vi.fn<typeof fetch>().mockResolvedValue(response);

describe('reaction API client', () => {
  it('posts bootstrap JSON once to the normalized endpoint without a token', async () => {
    const response = {
      visitorToken: TEST_VISITOR_TOKEN,
      reactions: {},
    };
    const fetchImpl = createFetch(jsonResponse(response));
    const api = createReactionApi(
      'https://reactions.example:443/',
      fetchImpl,
    );

    await expect(
      api.bootstrap({ targets: ['work:alpha'] }),
    ).resolves.toEqual(response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe(
      'https://reactions.example/v1/reactions/bootstrap',
    );
    expect(init?.method).toBe('POST');
    expect(init?.cache).toBe('no-store');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      targets: ['work:alpha'],
    });
  });

  it('adds exactly one Bearer header when bootstrap receives a token', async () => {
    const fetchImpl = createFetch(jsonResponse({
      visitorToken: TEST_VISITOR_TOKEN,
      reactions: {},
    }));
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await api.bootstrap({ targets: [] }, TEST_VISITOR_TOKEN);
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe(
      `Bearer ${TEST_VISITOR_TOKEN}`,
    );
  });

  it('puts desired final state once and never sends a toggle field', async () => {
    const response = {
      targetId: 'side:booster' as const,
      emoji: '🔥' as const,
      active: true,
      count: 2,
    };
    const fetchImpl = createFetch(jsonResponse(response));
    const api = createReactionApi(
      'http://127.0.0.1:4321',
      fetchImpl,
    );
    await expect(api.setReaction({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    }, TEST_VISITOR_TOKEN)).resolves.toEqual(response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4321/v1/reactions');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    });
    expect(String(init?.body)).not.toContain('toggle');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Bearer ${TEST_VISITOR_TOKEN}`,
    );
  });

  it('preserves status and a parsed API code on non-2xx JSON', async () => {
    const fetchImpl = createFetch(jsonResponse({
      error: { code: 'rate_limited', message: 'Slow down' },
    }, 429));
    const api = createReactionApi('https://reactions.example', fetchImpl);
    const error = await api.bootstrap({ targets: ['work:alpha'] })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ReactionHttpError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses an undefined API code for malformed non-2xx JSON', async () => {
    const fetchImpl = createFetch(
      new Response('not-json', { status: 500 }),
    );
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await expect(
      api.bootstrap({ targets: ['work:alpha'] }),
    ).rejects.toMatchObject({ status: 500, code: undefined });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed success JSON', async () => {
    const fetchImpl = createFetch(
      new Response('not-json', { status: 200 }),
    );
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await expect(
      api.bootstrap({ targets: ['work:alpha'] }),
    ).rejects.toThrow('invalid JSON');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['network failure', new TypeError('offline')],
    ['rate limit', new ReactionHttpError(429, 'rate_limited')],
  ])('does not retry a %s', async (_label, failure) => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const api = createReactionApi('https://reactions.example', fetchImpl);
    await expect(api.setReaction({
      targetId: 'side:booster',
      emoji: '👏',
      active: false,
    }, TEST_VISITOR_TOKEN)).rejects.toBe(failure);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    '',
    ' https://reactions.example',
    'https://reactions.example ',
    'not a URL',
    'ftp://reactions.example',
    'http://reactions.example',
    'https://user:pass@reactions.example',
    'https://reactions.example/api',
    'https://reactions.example/?version=1',
    'https://reactions.example/#fragment',
    'http://localhost.evil.example:4321',
  ])('rejects invalid API base URL %j', (baseUrl) => {
    expect(() =>
      createReactionApi(baseUrl, vi.fn<typeof fetch>()),
    ).toThrow();
  });

  it.each([
    'https://reactions.example',
    'https://reactions.example/',
    'http://localhost:4321',
    'http://127.0.0.1:4321/',
  ])('accepts API origin %s', (baseUrl) => {
    expect(() =>
      createReactionApi(baseUrl, vi.fn<typeof fetch>()),
    ).not.toThrow();
  });
});

describe('visitor token storage', () => {
  it('uses one stable key for reads and writes', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(TEST_VISITOR_TOKEN),
      setItem: vi.fn(),
    };
    const store = createVisitorTokenStore(storage);
    expect(store.get()).toBe(TEST_VISITOR_TOKEN);
    store.set(TEST_VISITOR_TOKEN);
    expect(storage.getItem).toHaveBeenCalledWith(
      VISITOR_TOKEN_STORAGE_KEY,
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      VISITOR_TOKEN_STORAGE_KEY,
      TEST_VISITOR_TOKEN,
    );
  });

  it('catches unavailable storage reads and writes', () => {
    const storage = {
      getItem() {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem() {
        throw new DOMException('blocked', 'QuotaExceededError');
      },
    };
    const store = createVisitorTokenStore(storage);
    expect(store.get()).toBeUndefined();
    expect(() => store.set(TEST_VISITOR_TOKEN)).not.toThrow();
  });

  it.each(['', null])('does not expose or persist empty token %j', (value) => {
    const storage = {
      getItem: vi.fn().mockReturnValue(value),
      setItem: vi.fn(),
    };
    const store = createVisitorTokenStore(storage);
    expect(store.get()).toBeUndefined();
    store.set('');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:frontend -- tests/reactions/api-client.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the API client**

Create `src/scripts/reactions/api-client.ts`:

```ts
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
```

The generic cast is isolated at the transport boundary. The data controller
performs complete runtime validation before using any successful body.

- [ ] **Step 4: Implement safe token storage**

Create `src/scripts/reactions/token-store.ts`:

```ts
export const VISITOR_TOKEN_STORAGE_KEY =
  'kybee:project-reactions:visitor-token:v1';

export interface VisitorTokenStore {
  get(): string | undefined;
  set(token: string): void;
}

export function createVisitorTokenStore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): VisitorTokenStore {
  return {
    get() {
      try {
        const token = storage.getItem(VISITOR_TOKEN_STORAGE_KEY);
        return token && token.length > 0 ? token : undefined;
      } catch {
        return undefined;
      }
    },
    set(token) {
      if (token.length === 0) return;
      try {
        storage.setItem(VISITOR_TOKEN_STORAGE_KEY, token);
      } catch {
        // The controller keeps the token in memory for this page lifetime.
      }
    },
  };
}
```

Catch storage errors and return `undefined` from failed reads. Failed writes
are silent to the store but the data controller must retain the returned token
in memory.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:frontend -- tests/reactions/api-client.test.ts
git add src/scripts/reactions/api-client.ts \
  src/scripts/reactions/token-store.ts \
  tests/reactions/api-client.test.ts
git commit -m "feat: connect anonymous reaction client"
```

Expected: exact requests pass and no failure path retries automatically.

### Task 15: Bootstrap all targets once and perform per-emoji optimistic updates

**Files:**

- Create: `src/scripts/reactions/data-controller.ts`
- Test/Create: `tests/reactions/data-controller.test.ts`
- Test/Reuse: `tests/reactions/fixtures.ts`

- [ ] **Step 1: Write complete bootstrap, rendering, concurrency, and rollback tests**

Create `tests/reactions/data-controller.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  BootstrapResponse,
  ReactionEmoji,
  ReactionSnapshot,
  ReactionTargetId,
  SetReactionResponse,
} from '../../src/lib/reactions/contracts';
import {
  ReactionHttpError,
  type ReactionApi,
} from '../../src/scripts/reactions/api-client';
import { createReactionDataController } from
  '../../src/scripts/reactions/data-controller';
import type { VisitorTokenStore } from
  '../../src/scripts/reactions/token-store';
import {
  TEST_VISITOR_TOKEN,
  actionButton,
  bootstrapResponse,
  countChip,
  createChannelStatus,
  createReactionMessage,
  createReactionPageFixture,
  deferred,
  flushAsyncWork,
  requiredElement,
  snapshot,
  type ReactionPageFixture,
} from './fixtures';

const REPLACEMENT_TOKEN = `v1.${'c'.repeat(43)}.${'d'.repeat(43)}`;

function apiDouble(): {
  api: ReactionApi;
  bootstrap: Mock<ReactionApi['bootstrap']>;
  setReaction: Mock<ReactionApi['setReaction']>;
} {
  const bootstrap = vi.fn<ReactionApi['bootstrap']>();
  const setReaction = vi.fn<ReactionApi['setReaction']>();
  return { api: { bootstrap, setReaction }, bootstrap, setReaction };
}

function storeDouble(initial?: string): {
  store: VisitorTokenStore;
  get: Mock<VisitorTokenStore['get']>;
  set: Mock<VisitorTokenStore['set']>;
} {
  const get = vi.fn<VisitorTokenStore['get']>().mockReturnValue(initial);
  const set = vi.fn<VisitorTokenStore['set']>();
  return { store: { get, set }, get, set };
}

function successful(): Record<ReactionTargetId, ReactionSnapshot> {
  return {
    'work:alpha': snapshot({ '👍': 2, '🔥': 1 }, ['🔥']),
    'work:beta': snapshot(),
    'side:booster': snapshot({ '👏': 3 }, ['👏']),
  };
}

function statusText(region: ParentNode): string {
  return requiredElement<HTMLElement>(
    region,
    '[data-reaction-bootstrap-status]',
  ).textContent ?? '';
}

function expectAvailable(page: ReactionPageFixture, available: boolean) {
  for (const message of Object.values(page.messages)) {
    const controls = requiredElement<HTMLElement>(
      message,
      '[data-reaction-controls]',
    );
    expect(controls.hidden).toBe(!available);
    for (const action of controls.querySelectorAll<HTMLButtonElement>(
      '[data-reaction-emoji]',
    )) {
      expect(action.disabled).toBe(!available);
    }
  }
}

const invalidResponses: Array<
  [string, (response: BootstrapResponse) => void]
> = [
  ['missing target', (response) => {
    const reactions = response.reactions as Partial<
      Record<ReactionTargetId, ReactionSnapshot>
    >;
    delete reactions['work:beta'];
  }],
  ['extra target', (response) => {
    response.reactions['side:extra'] = snapshot();
  }],
  ['missing count', (response) => {
    delete (
      response.reactions['work:alpha'].counts as
        Partial<ReactionSnapshot['counts']>
    )['👏'];
  }],
  ['negative count', (response) => {
    response.reactions['work:alpha'].counts['👍'] = -1;
  }],
  ['non-integer count', (response) => {
    response.reactions['work:alpha'].counts['👍'] = 1.5;
  }],
  ['unknown selection', (response) => {
    response.reactions['work:alpha'].selected = ['💯' as ReactionEmoji];
  }],
  ['zero-count selection', (response) => {
    response.reactions['work:alpha'] = snapshot({}, ['👍']);
  }],
];

describe('reaction data bootstrap', () => {
  let page: ReactionPageFixture;

  beforeEach(() => {
    page = createReactionPageFixture();
  });

  it('sends unique targets in document order and replaces the stored token', async () => {
    requiredElement(document, '#side-projects').prepend(
      createReactionMessage({
        target: 'work:alpha',
        controlsHidden: true,
        actionsDisabled: true,
      }),
    );
    const api = apiDouble();
    const tokens = storeDouble(TEST_VISITOR_TOKEN);
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful(), REPLACEMENT_TOKEN),
    );
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: tokens.store,
    });
    await controller.bootstrap();
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(api.bootstrap).toHaveBeenCalledWith(
      { targets: page.targets },
      TEST_VISITOR_TOKEN,
    );
    expect(tokens.get).toHaveBeenCalledTimes(1);
    expect(tokens.set).toHaveBeenCalledWith(REPLACEMENT_TOKEN);
  });

  it('reveals controls and renders keyed positive localized chips', async () => {
    const api = apiDouble();
    const tokens = storeDouble();
    page.regions.forEach((region) => {
      region.hidden = false;
    });
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful()),
    );
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: tokens.store,
    });
    await controller.bootstrap();
    expectAvailable(page, true);
    expect(page.regions.every((region) => region.hidden)).toBe(true);
    const alpha = page.messages.workAlpha;
    expect([
      ...alpha.querySelectorAll<HTMLElement>(
        '[data-reaction-count-emoji]',
      ),
    ].map((chip) => chip.dataset.reactionCountEmoji))
      .toEqual(['👍', '🔥']);
    expect(countChip(alpha, '🎉')).toBeNull();
    expect(countChip(alpha, '👏')).toBeNull();
    expect(actionButton(alpha, '🔥').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(countChip(alpha, '🔥')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(countChip(alpha, '👍')?.getAttribute('aria-label')).toBe(
      'Alpha: 👍 reaction count 2',
    );
  });

  it('keeps the returned token in memory when storage throws', async () => {
    const api = apiDouble();
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful()),
    );
    api.setReaction.mockResolvedValue({
      targetId: 'side:booster', emoji: '🔥', active: true, count: 1,
    });
    const controller = createReactionDataController({
      root: page.root,
      api: api.api,
      tokenStore: {
        get: () => undefined,
        set: () => {
          throw new DOMException('blocked', 'QuotaExceededError');
        },
      },
    });
    await controller.bootstrap();
    actionButton(page.messages.sideBooster, '🔥').click();
    await flushAsyncWork();
    expect(api.setReaction).toHaveBeenCalledWith({
      targetId: 'side:booster', emoji: '🔥', active: true,
    }, TEST_VISITOR_TOKEN);
  });

  it.each(invalidResponses)('fails closed for %s', async (_label, corrupt) => {
    const api = apiDouble();
    const response = bootstrapResponse(page.targets, successful());
    corrupt(response);
    api.bootstrap.mockResolvedValue(response);
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    expectAvailable(page, false);
    expect(page.regions.every((region) => !region.hidden)).toBe(true);
  });

  it('preserves content and shows one localized retry row per channel', async () => {
    const api = apiDouble();
    api.bootstrap.mockRejectedValue(new TypeError('offline'));
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    expectAvailable(page, false);
    expect(page.regions).toHaveLength(2);
    for (const region of page.regions) {
      expect(region.hidden).toBe(false);
      expect(statusText(region)).toBe(region.dataset.bootstrapError);
    }
    expect(page.root.textContent).toContain('Ordinary project summary');
    expect(page.root.querySelectorAll('.tag-pill')).toHaveLength(3);
    expect(page.root.querySelectorAll('.badge-pill')).toHaveLength(3);
  });

  it('coalesces pending retries and enables both channels on success', async () => {
    const api = apiDouble();
    api.bootstrap.mockRejectedValueOnce(new TypeError('offline'));
    const pending = deferred<BootstrapResponse>();
    api.bootstrap.mockReturnValueOnce(pending.promise);
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    requiredElement<HTMLButtonElement>(
      page.regions[0], '[data-reaction-retry]',
    ).click();
    requiredElement<HTMLButtonElement>(
      page.regions[1], '[data-reaction-retry]',
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(api.bootstrap).toHaveBeenCalledTimes(2);
    pending.resolve(bootstrapResponse(page.targets, successful()));
    await pending.promise;
    await flushAsyncWork();
    expectAvailable(page, true);
    expect(page.regions.every((region) => region.hidden)).toBe(true);
  });
});

describe('reaction data mutations', () => {
  let page: ReactionPageFixture;
  let api: ReturnType<typeof apiDouble>;
  let controller: ReturnType<typeof createReactionDataController>;

  beforeEach(async () => {
    page = createReactionPageFixture();
    api = apiDouble();
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful()),
    );
    controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
  });

  it('optimistically updates and locks only the pending target/emoji', () => {
    const pending = deferred<SetReactionResponse>();
    api.setReaction.mockReturnValueOnce(pending.promise);
    const message = page.messages.sideBooster;
    const action = actionButton(message, '🔥');
    action.click();
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(action.getAttribute('aria-pressed')).toBe('true');
    expect(countChip(message, '🔥')?.textContent).toBe('🔥 1');
    expect(action.disabled).toBe(true);
    expect(action.getAttribute('aria-busy')).toBe('true');
    expect(countChip(message, '🔥')?.disabled).toBe(true);
    expect(api.setReaction).toHaveBeenCalledTimes(1);
  });

  it('removes a zero chip and moves focus to the opener', async () => {
    controller.destroy();
    page = createReactionPageFixture();
    api = apiDouble();
    api.bootstrap.mockResolvedValue(bootstrapResponse(page.targets, {
      ...successful(),
      'side:booster': snapshot({ '👏': 1 }, ['👏']),
    }));
    controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    const pending = deferred<SetReactionResponse>();
    api.setReaction.mockReturnValueOnce(pending.promise);
    const message = page.messages.sideBooster;
    const chip = countChip(message, '👏');
    const opener = requiredElement<HTMLButtonElement>(
      message, '[data-reaction-opener]',
    );
    if (!chip) throw new Error('Expected selected chip');
    chip.focus();
    chip.click();
    expect(countChip(message, '👏')).toBeNull();
    expect(document.activeElement).toBe(opener);
    pending.resolve({
      targetId: 'side:booster', emoji: '👏', active: false, count: 0,
    });
    await pending.promise;
    await flushAsyncWork();
  });

  it('allows another emoji and rolls back without overwriting its success', async () => {
    const thumbs = deferred<SetReactionResponse>();
    const fire = deferred<SetReactionResponse>();
    api.setReaction.mockImplementation((request) =>
      request.emoji === '👍' ? thumbs.promise : fire.promise
    );
    const message = page.messages.workBeta;
    actionButton(message, '👍').click();
    actionButton(message, '🔥').click();
    expect(api.setReaction).toHaveBeenCalledTimes(2);
    fire.resolve({
      targetId: 'work:beta', emoji: '🔥', active: true, count: 4,
    });
    await fire.promise;
    await flushAsyncWork();
    thumbs.reject(new TypeError('offline'));
    await thumbs.promise.catch(() => undefined);
    await flushAsyncWork();
    expect(countChip(message, '👍')).toBeNull();
    expect(countChip(message, '🔥')?.textContent).toBe('🔥 4');
    expect(actionButton(message, '🔥').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('reconciles server state without replacing or defocusing a chip', async () => {
    const pending = deferred<SetReactionResponse>();
    api.setReaction.mockReturnValueOnce(pending.promise);
    const message = page.messages.workAlpha;
    const before = countChip(message, '👍');
    if (!before) throw new Error('Expected existing count chip');
    before.focus();
    actionButton(message, '👍').click();
    pending.resolve({
      targetId: 'work:alpha', emoji: '👍', active: false, count: 7,
    });
    await pending.promise;
    await flushAsyncWork();
    const after = countChip(message, '👍');
    expect(after).toBe(before);
    expect(after?.textContent).toBe('👍 7');
    expect(after?.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(before);
  });

  it('restores one failed emoji and announces a nearby status', async () => {
    api.setReaction.mockRejectedValueOnce(new TypeError('offline'));
    const message = page.messages.workAlpha;
    actionButton(message, '👍').click();
    expect(countChip(message, '👍')?.textContent).toBe('👍 3');
    await flushAsyncWork();
    expect(countChip(message, '👍')?.textContent).toBe('👍 2');
    expect(actionButton(message, '👍').getAttribute('aria-pressed')).toBe(
      'false',
    );
    const status = requiredElement<HTMLElement>(
      message, '[data-reaction-write-status]',
    );
    expect(status.hidden).toBe(false);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('The reaction was not saved.');
  });

  it('does not retry a 429 write failure', async () => {
    api.setReaction.mockRejectedValueOnce(
      new ReactionHttpError(429, 'rate_limited'),
    );
    actionButton(page.messages.workBeta, '🎉').click();
    await flushAsyncWork();
    expect(api.setReaction).toHaveBeenCalledTimes(1);
    expect(countChip(page.messages.workBeta, '🎉')).toBeNull();
  });

  it('destroy removes delegated mutation and retry handlers', () => {
    controller.destroy();
    actionButton(page.messages.workAlpha, '👍').click();
    page.regions.forEach((region) =>
      requiredElement<HTMLButtonElement>(
        region, '[data-reaction-retry]',
      ).click()
    );
    expect(api.setReaction).not.toHaveBeenCalled();
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });
});

describe('reaction target limit', () => {
  const largeFixture = (size: number) => {
    document.body.innerHTML = '';
    const root = document.createElement('main');
    const targets = Array.from(
      { length: size },
      (_, index) => `work:project-${index}` as ReactionTargetId,
    );
    targets.forEach((target) => root.append(createReactionMessage({
      target, controlsHidden: true, actionsDisabled: true,
    })));
    const region = createChannelStatus('work');
    root.append(region);
    document.body.append(root);
    return { root, targets, region };
  };

  it('rejects 101 locally but sends exactly 100 once', async () => {
    const tooMany = largeFixture(101);
    const rejectedApi = apiDouble();
    const rejected = createReactionDataController({
      root: tooMany.root,
      api: rejectedApi.api,
      tokenStore: storeDouble().store,
    });
    await rejected.bootstrap();
    expect(rejectedApi.bootstrap).not.toHaveBeenCalled();
    expect(tooMany.region.hidden).toBe(false);

    const maximum = largeFixture(100);
    const acceptedApi = apiDouble();
    acceptedApi.bootstrap.mockResolvedValue(
      bootstrapResponse(maximum.targets),
    );
    const accepted = createReactionDataController({
      root: maximum.root,
      api: acceptedApi.api,
      tokenStore: storeDouble().store,
    });
    await accepted.bootstrap();
    expect(acceptedApi.bootstrap).toHaveBeenCalledTimes(1);
    expect(acceptedApi.bootstrap).toHaveBeenCalledWith(
      { targets: maximum.targets },
      undefined,
    );
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:frontend -- tests/reactions/data-controller.test.ts
```

Expected: FAIL because the data controller is missing.

- [ ] **Step 3: Implement strict bootstrap state**

Create `src/scripts/reactions/data-controller.ts`:

```ts
import {
  MAX_BOOTSTRAP_TARGETS,
  REACTION_EMOJIS,
  type BootstrapResponse,
  type ReactionEmoji,
  type ReactionSnapshot,
  type ReactionTargetId,
  type SetReactionResponse,
} from '../../lib/reactions/contracts';
import type { ReactionApi } from './api-client';
import type { VisitorTokenStore } from './token-store';

export interface ReactionDataController {
  bootstrap(): Promise<void>;
  destroy(): void;
}

export function createReactionDataController(options: {
  root: Document | HTMLElement;
  api: ReactionApi;
  tokenStore: VisitorTokenStore;
}): ReactionDataController {
  const { root, api, tokenStore } = options;
  const targetElements = [
    ...root.querySelectorAll<HTMLElement>('[data-reaction-target]'),
  ];
  const targets = [
    ...new Set(
      targetElements.map((element) => {
        const target = element.dataset.reactionTarget;
        if (!target) throw new TypeError('Missing reaction target');
        return target as ReactionTargetId;
      }),
    ),
  ];
  const channelRegions = [
    ...root.querySelectorAll<HTMLElement>(
      '[data-reaction-channel-status]',
    ),
  ];
  const stateByTarget = new Map<ReactionTargetId, ReactionSnapshot>();
  const pendingKeys = new Set<string>();
  let bootstrapPromise: Promise<void> | undefined;
  let bootstrapFailed = false;
  let destroyed = false;
  let visitorToken: string | undefined;

  try {
    visitorToken = tokenStore.get();
  } catch {
    visitorToken = undefined;
  }

  const keyFor = (target: ReactionTargetId, emoji: ReactionEmoji) =>
    `${target}\0${emoji}`;

  const isRecord = (
    value: unknown,
  ): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  const isEmoji = (value: string): value is ReactionEmoji =>
    (REACTION_EMOJIS as readonly string[]).includes(value);

  const copySnapshot = (
    value: unknown,
  ): ReactionSnapshot => {
    if (!isRecord(value)) throw new TypeError('Invalid reaction snapshot');
    const keys = Object.keys(value).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== 'counts' ||
      keys[1] !== 'selected' ||
      !isRecord(value.counts) ||
      !Array.isArray(value.selected)
    ) {
      throw new TypeError('Invalid reaction snapshot');
    }

    const rawCounts = value.counts;
    const rawSelected = value.selected;
    const countKeys = Object.keys(rawCounts);
    if (
      countKeys.length !== REACTION_EMOJIS.length ||
      !REACTION_EMOJIS.every((emoji) => countKeys.includes(emoji))
    ) {
      throw new TypeError('Invalid reaction counts');
    }

    const counts = Object.fromEntries(
      REACTION_EMOJIS.map((emoji) => {
        const count = rawCounts[emoji];
        if (
          typeof count !== 'number' ||
          !Number.isSafeInteger(count) ||
          count < 0
        ) {
          throw new TypeError('Invalid reaction count');
        }
        return [emoji, count];
      }),
    ) as ReactionSnapshot['counts'];

    const selected = rawSelected.map((emoji) => {
      if (typeof emoji !== 'string' || !isEmoji(emoji)) {
        throw new TypeError('Invalid selected reaction');
      }
      return emoji;
    });
    if (
      new Set(selected).size !== selected.length ||
      selected.some((emoji) => counts[emoji] === 0)
    ) {
      throw new TypeError('Invalid selected reactions');
    }
    selected.sort(
      (left, right) =>
        REACTION_EMOJIS.indexOf(left) - REACTION_EMOJIS.indexOf(right),
    );
    return { counts, selected };
  };

  const validateBootstrap = (
    value: BootstrapResponse,
  ): {
    token: string;
    snapshots: Map<ReactionTargetId, ReactionSnapshot>;
  } => {
    if (
      !isRecord(value) ||
      typeof value.visitorToken !== 'string' ||
      !/^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/u.test(
        value.visitorToken,
      ) ||
      !isRecord(value.reactions)
    ) {
      throw new TypeError('Invalid bootstrap response');
    }
    const responseTargets = Object.keys(value.reactions).sort();
    if (
      JSON.stringify(responseTargets) !==
      JSON.stringify([...targets].sort())
    ) {
      throw new TypeError('Bootstrap targets do not match the page');
    }
    return {
      token: value.visitorToken,
      snapshots: new Map(
        targets.map((target) => [
          target,
          copySnapshot(value.reactions[target]),
        ]),
      ),
    };
  };

  const elementsFor = (target: ReactionTargetId) =>
    targetElements.filter(
      (element) => element.dataset.reactionTarget === target,
    );

  const setPressed = (
    snapshot: ReactionSnapshot,
    emoji: ReactionEmoji,
    active: boolean,
  ) => {
    snapshot.selected = active
      ? [...new Set([...snapshot.selected, emoji])].sort(
          (left, right) =>
            REACTION_EMOJIS.indexOf(left) -
            REACTION_EMOJIS.indexOf(right),
        )
      : snapshot.selected.filter((selected) => selected !== emoji);
  };

  const renderTarget = (target: ReactionTargetId) => {
    const snapshot = stateByTarget.get(target);
    if (!snapshot) return;

    for (const message of elementsFor(target)) {
      const controls = message.querySelector<HTMLElement>(
        '[data-reaction-controls]',
      );
      const counts = message.querySelector<HTMLElement>(
        '[data-reaction-counts]',
      );
      if (!controls || !counts) continue;

      const actions = new Map<ReactionEmoji, HTMLButtonElement>();
      for (const action of controls.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-emoji]',
      )) {
        const emoji = action.dataset.reactionEmoji;
        if (emoji && isEmoji(emoji)) actions.set(emoji, action);
      }

      for (const emoji of REACTION_EMOJIS) {
        const action = actions.get(emoji);
        if (!action) continue;
        const selected = snapshot.selected.includes(emoji);
        const pending = pendingKeys.has(keyFor(target, emoji));
        action.setAttribute('aria-pressed', String(selected));
        action.disabled = pending;
        if (pending) action.setAttribute('aria-busy', 'true');
        else action.removeAttribute('aria-busy');
      }

      const opener = message.querySelector<HTMLButtonElement>(
        '[data-reaction-opener]',
      );
      const existingChips = new Map<ReactionEmoji, HTMLButtonElement>();
      for (const chip of counts.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-count-emoji]',
      )) {
        const emoji = chip.dataset.reactionCountEmoji;
        if (emoji && isEmoji(emoji)) existingChips.set(emoji, chip);
      }
      const projectName = controls.dataset.reactionProjectName ?? '';
      const countLabel =
        controls.dataset.reactionCountLabel ??
        '{emoji} {count}';

      REACTION_EMOJIS.forEach((emoji, index) => {
        const count = snapshot.counts[emoji];
        let chip = existingChips.get(emoji);
        if (count === 0) {
          if (
            chip &&
            chip.ownerDocument.activeElement === chip
          ) {
            opener?.focus({ preventScroll: true });
          }
          chip?.remove();
          return;
        }

        if (!chip) {
          chip = message.ownerDocument.createElement('button');
          chip.type = 'button';
          chip.className = 'reaction-count-chip';
          chip.dataset.reactionCountEmoji = emoji;
          const nextChip = REACTION_EMOJIS
            .slice(index + 1)
            .map((nextEmoji) => existingChips.get(nextEmoji))
            .find((candidate) => candidate?.isConnected);
          counts.insertBefore(chip, nextChip ?? null);
          existingChips.set(emoji, chip);
        }

        const pending = pendingKeys.has(keyFor(target, emoji));
        chip.textContent = `${emoji} ${count}`;
        chip.setAttribute(
          'aria-pressed',
          String(snapshot.selected.includes(emoji)),
        );
        const localizedCount = countLabel
          .replace('{emoji}', emoji)
          .replace('{count}', String(count));
        chip.setAttribute(
          'aria-label',
          projectName
            ? `${projectName}: ${localizedCount}`
            : localizedCount,
        );
        chip.disabled = pending;
        if (pending) chip.setAttribute('aria-busy', 'true');
        else chip.removeAttribute('aria-busy');
      });
    }
  };

  const setControlsAvailable = (available: boolean) => {
    for (const message of targetElements) {
      const controls = message.querySelector<HTMLElement>(
        '[data-reaction-controls]',
      );
      if (!controls) continue;
      controls.hidden = !available;
      for (const action of controls.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-emoji]',
      )) {
        action.disabled = !available;
      }
    }
  };

  const showBootstrapFailure = () => {
    bootstrapFailed = true;
    setControlsAvailable(false);
    for (const region of channelRegions) {
      region.hidden = false;
      const status = region.querySelector<HTMLElement>(
        '[data-reaction-bootstrap-status]',
      );
      if (status) {
        status.textContent = region.dataset.bootstrapError ?? '';
      }
      const retry = region.querySelector<HTMLButtonElement>(
        '[data-reaction-retry]',
      );
      if (retry) retry.disabled = false;
    }
  };

  const setRetrying = () => {
    if (!bootstrapFailed) return;
    for (const region of channelRegions) {
      region.hidden = false;
      const status = region.querySelector<HTMLElement>(
        '[data-reaction-bootstrap-status]',
      );
      if (status) status.textContent = region.dataset.retrying ?? '';
      const retry = region.querySelector<HTMLButtonElement>(
        '[data-reaction-retry]',
      );
      if (retry) retry.disabled = true;
    }
  };

  const hideRetry = () => {
    bootstrapFailed = false;
    for (const region of channelRegions) {
      region.hidden = true;
      const status = region.querySelector<HTMLElement>(
        '[data-reaction-bootstrap-status]',
      );
      if (status) status.textContent = '';
      const retry = region.querySelector<HTMLButtonElement>(
        '[data-reaction-retry]',
      );
      if (retry) retry.disabled = false;
    }
  };

  const bootstrap = (): Promise<void> => {
    if (destroyed || targets.length === 0) return Promise.resolve();
    if (targets.length > MAX_BOOTSTRAP_TARGETS) {
      showBootstrapFailure();
      return Promise.resolve();
    }
    if (bootstrapPromise) return bootstrapPromise;
    setRetrying();

    const request = (async () => {
      try {
        const response = await api.bootstrap(
          { targets },
          visitorToken,
        );
        if (destroyed) return;
        const validated = validateBootstrap(response);
        visitorToken = validated.token;
        try {
          tokenStore.set(validated.token);
        } catch {
          // The in-memory token remains authoritative for this page.
        }
        stateByTarget.clear();
        for (const [target, snapshot] of validated.snapshots) {
          stateByTarget.set(target, snapshot);
        }
        setControlsAvailable(true);
        for (const target of targets) renderTarget(target);
        hideRetry();
      } catch {
        if (!destroyed) showBootstrapFailure();
      }
    })();

    bootstrapPromise = request.finally(() => {
      bootstrapPromise = undefined;
    });
    return bootstrapPromise;
  };

  const validateMutation = (
    value: SetReactionResponse,
    target: ReactionTargetId,
    emoji: ReactionEmoji,
  ) => {
    if (
      !isRecord(value) ||
      value.targetId !== target ||
      value.emoji !== emoji ||
      typeof value.active !== 'boolean' ||
      typeof value.count !== 'number' ||
      !Number.isSafeInteger(value.count) ||
      value.count < 0 ||
      (value.active && value.count === 0)
    ) {
      throw new TypeError('Invalid reaction response');
    }
    return { active: value.active, count: value.count };
  };

  const mutate = async (
    message: HTMLElement,
    target: ReactionTargetId,
    emoji: ReactionEmoji,
  ) => {
    const snapshot = stateByTarget.get(target);
    if (!snapshot || !visitorToken) return;
    const pendingKey = keyFor(target, emoji);
    if (pendingKeys.has(pendingKey)) return;

    const previous = {
      count: snapshot.counts[emoji],
      selected: snapshot.selected.includes(emoji),
    };
    const desiredActive = !previous.selected;
    const status = message.querySelector<HTMLElement>(
      '[data-reaction-write-status]',
    );
    if (status) status.textContent = '';

    pendingKeys.add(pendingKey);
    snapshot.counts[emoji] = Math.max(
      0,
      previous.count + (desiredActive ? 1 : -1),
    );
    setPressed(snapshot, emoji, desiredActive);
    renderTarget(target);

    try {
      const response = validateMutation(
        await api.setReaction(
          { targetId: target, emoji, active: desiredActive },
          visitorToken,
        ),
        target,
        emoji,
      );
      if (destroyed) return;
      snapshot.counts[emoji] = response.count;
      setPressed(snapshot, emoji, response.active);
    } catch {
      if (destroyed) return;
      snapshot.counts[emoji] = previous.count;
      setPressed(snapshot, emoji, previous.selected);
      if (status) {
        const controls = message.querySelector<HTMLElement>(
          '[data-reaction-controls]',
        );
        status.textContent = controls?.dataset.reactionWriteError ?? '';
      }
    } finally {
      pendingKeys.delete(pendingKey);
      if (!destroyed) renderTarget(target);
    }
  };

  const handleClick = (event: Event) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    const button = eventTarget.closest<HTMLButtonElement>(
      '[data-reaction-emoji], [data-reaction-count-emoji]',
    );
    const message = button?.closest<HTMLElement>(
      '[data-reaction-target]',
    );
    if (!button || !message || !root.contains(button)) return;
    const target = message.dataset.reactionTarget as
      | ReactionTargetId
      | undefined;
    const emoji =
      button.dataset.reactionEmoji ??
      button.dataset.reactionCountEmoji;
    if (!target || !emoji || !isEmoji(emoji)) return;
    void mutate(message, target, emoji);
  };

  const handleRetry = (event: Event) => {
    const eventTarget = event.target;
    if (
      eventTarget instanceof Element &&
      eventTarget.closest('[data-reaction-retry]')
    ) {
      void bootstrap();
    }
  };

  root.addEventListener('click', handleClick);
  root.addEventListener('click', handleRetry);

  return {
    bootstrap,
    destroy() {
      destroyed = true;
      root.removeEventListener('click', handleClick);
      root.removeEventListener('click', handleRetry);
      pendingKeys.clear();
    },
  };
}
```

- [ ] **Step 4: Inspect deterministic rendering**

Confirm the completed `renderTarget` iterates `REACTION_EMOJIS`, omits zero
chips, uses real buttons, reuses localized action labels, and disables only a
pending target/emoji pair.

- [ ] **Step 5: Inspect per-emoji rollback**

Confirm `mutate` snapshots only one emoji, never clones/replaces the whole
project state on failure, never retries, and lets a different emoji proceed
while one is pending.

- [ ] **Step 6: Inspect retry and cleanup**

Confirm both retry buttons call the same `bootstrapPromise`, failed bootstrap
keeps project content intact, and `destroy()` removes both delegated
listeners.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm run test:frontend -- tests/reactions/data-controller.test.ts
npm run test:frontend
git add src/scripts/reactions/data-controller.ts \
  tests/reactions/data-controller.test.ts
git commit -m "feat: bootstrap and update shared reactions"
```

Expected: bootstrap, retry, optimistic reconciliation, storage failure, and
per-emoji rollback tests all pass.

### Task 16: Initialize reactions only with a valid build-time API URL

**Files:**

- Create: `src/scripts/reactions/index.ts`
- Test/Create: `tests/reactions/index.test.ts`
- Test/Reuse: `tests/reactions/fixtures.ts`
- Modify: `src/components/Workspace.astro`
- Modify: `src/env.d.ts`
- Modify: `tests/site-output.test.mjs`

- [ ] **Step 1: Write initialization tests**

Create `tests/reactions/index.test.ts`:

```ts
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { createReactionApi, type ReactionApi } from
  '../../src/scripts/reactions/api-client';
import type { ReactionDataController } from
  '../../src/scripts/reactions/data-controller';
import { initReactions, type InitDependencies } from
  '../../src/scripts/reactions';
import {
  createReactionInteractionController,
  type ReactionInteractionController,
} from '../../src/scripts/reactions/interaction-controller';
import {
  createVisitorTokenStore,
  type VisitorTokenStore,
} from '../../src/scripts/reactions/token-store';
import {
  createMediaQueryList,
  createReactionMessage,
  flushAsyncWork,
  requiredElement,
} from './fixtures';

interface Harness {
  dependencies: InitDependencies;
  fetchImpl: Mock<typeof fetch>;
  api: ReactionApi;
  tokenStore: VisitorTokenStore;
  createApi: Mock<InitDependencies['createApi']>;
  createData: Mock<InitDependencies['createData']>;
  createInteraction: Mock<InitDependencies['createInteraction']>;
  createTokenStore: Mock<InitDependencies['createTokenStore']>;
  bootstrap: Mock<ReactionDataController['bootstrap']>;
  destroyData: Mock<ReactionDataController['destroy']>;
  destroyInteraction: Mock<ReactionInteractionController['destroy']>;
}

function harness(): Harness {
  const fetchImpl = vi.fn<typeof fetch>();
  const api: ReactionApi = {
    bootstrap: vi.fn(),
    setReaction: vi.fn(),
  };
  const bootstrap = vi
    .fn<ReactionDataController['bootstrap']>()
    .mockResolvedValue(undefined);
  const destroyData = vi.fn<ReactionDataController['destroy']>();
  const destroyInteraction =
    vi.fn<ReactionInteractionController['destroy']>();
  const data = { bootstrap, destroy: destroyData };
  const interaction = {
    close: vi.fn(),
    destroy: destroyInteraction,
  };
  const tokenStore = {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  };
  const createApi = vi.fn<InitDependencies['createApi']>((baseUrl) => {
    createReactionApi(baseUrl, fetchImpl);
    return api;
  });
  const createData = vi
    .fn<InitDependencies['createData']>()
    .mockReturnValue(data);
  const createInteraction = vi
    .fn<InitDependencies['createInteraction']>()
    .mockReturnValue(interaction);
  const createTokenStore = vi
    .fn<InitDependencies['createTokenStore']>()
    .mockReturnValue(tokenStore);
  return {
    dependencies: {
      createApi, createData, createInteraction, createTokenStore,
    },
    fetchImpl,
    api,
    tokenStore,
    createApi,
    createData,
    createInteraction,
    createTokenStore,
    bootstrap,
    destroyData,
    destroyInteraction,
  };
}

function installHiddenMessage(): HTMLElement {
  document.body.innerHTML = '';
  const message = createReactionMessage({
    target: 'work:hidden',
    controlsHidden: true,
    actionsDisabled: true,
  });
  document.body.append(message);
  return message;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('reaction initializer', () => {
  it.each([
    undefined,
    '',
    '   ',
    'not a URL',
    'https://user:pass@reactions.example',
    'https://reactions.example/path',
    'https://reactions.example?query=1',
    'https://reactions.example#fragment',
    'http://reactions.example',
  ])('gracefully does nothing for invalid URL %j', async (apiUrl) => {
    const message = installHiddenMessage();
    const test = harness();
    const handle = await initReactions({
      apiUrl,
      root: document,
      dependencies: test.dependencies,
    });
    expect(handle).toBeUndefined();
    expect(test.createData).not.toHaveBeenCalled();
    expect(test.createInteraction).not.toHaveBeenCalled();
    expect(test.createTokenStore).not.toHaveBeenCalled();
    expect(test.bootstrap).not.toHaveBeenCalled();
    expect(test.fetchImpl).not.toHaveBeenCalled();
    expect(requiredElement<HTMLElement>(
      message,
      '[data-reaction-controls]',
    ).hidden).toBe(true);
    message.dispatchEvent(new Event('pointerenter'));
    expect(requiredElement<HTMLElement>(
      message,
      '[data-reaction-panel]',
    ).hidden).toBe(true);
  });

  it.each([
    'https://reactions.example',
    'https://reactions.example/',
    'http://localhost:4321',
    'http://127.0.0.1:4321/',
  ])('creates every dependency once and bootstraps for %s', async (apiUrl) => {
    installHiddenMessage();
    const test = harness();
    const handle = await initReactions({
      apiUrl,
      root: document,
      dependencies: test.dependencies,
    });
    expect(handle).toBeDefined();
    expect(test.createApi).toHaveBeenCalledTimes(1);
    expect(test.createApi).toHaveBeenCalledWith(apiUrl);
    expect(test.createTokenStore).toHaveBeenCalledTimes(1);
    expect(test.createInteraction).toHaveBeenCalledTimes(1);
    expect(test.createInteraction).toHaveBeenCalledWith({
      root: document,
    });
    expect(test.createData).toHaveBeenCalledTimes(1);
    expect(test.createData).toHaveBeenCalledWith({
      root: document,
      api: test.api,
      tokenStore: test.tokenStore,
    });
    expect(test.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('does not open controls that are still hidden', async () => {
    const message = installHiddenMessage();
    const test = harness();
    const hover = createMediaQueryList(false);
    test.createInteraction.mockImplementation(({ root }) =>
      createReactionInteractionController({
        root,
        hoverMediaQuery: hover,
      })
    );
    const handle = await initReactions({
      apiUrl: 'https://reactions.example',
      root: document,
      dependencies: test.dependencies,
    });
    requiredElement<HTMLElement>(message, '.message-summary').click();
    await flushAsyncWork();
    expect(requiredElement<HTMLElement>(
      message,
      '[data-reaction-panel]',
    ).hidden).toBe(true);
    expect(message.classList.contains('is-reaction-open')).toBe(false);
    handle?.destroy();
  });

  it('destroys both controllers exactly once', async () => {
    installHiddenMessage();
    const test = harness();
    const handle = await initReactions({
      apiUrl: 'https://reactions.example',
      root: document,
      dependencies: test.dependencies,
    });
    handle?.destroy();
    handle?.destroy();
    expect(test.destroyData).toHaveBeenCalledTimes(1);
    expect(test.destroyInteraction).toHaveBeenCalledTimes(1);
  });

  it('uses safe storage and bootstraps when localStorage access throws', async () => {
    installHiddenMessage();
    const test = harness();
    const root = {
      get defaultView() {
        return {
          get localStorage(): Storage {
            throw new DOMException('blocked', 'SecurityError');
          },
        };
      },
    } as unknown as Document;
    test.createTokenStore.mockImplementation((storage) => {
      expect(storage.getItem('ignored')).toBeNull();
      expect(() =>
        storage.setItem('ignored', 'ignored'),
      ).not.toThrow();
      return createVisitorTokenStore(storage);
    });
    const handle = await initReactions({
      apiUrl: 'https://reactions.example',
      root,
      dependencies: test.dependencies,
    });
    expect(handle).toBeDefined();
    expect(test.createTokenStore).toHaveBeenCalledTimes(1);
    expect(test.bootstrap).toHaveBeenCalledTimes(1);
    const dataOptions = test.createData.mock.calls[0][0];
    expect(dataOptions.root).toBe(root);
    expect(dataOptions.api).toBe(test.api);
    expect(dataOptions.tokenStore).toEqual(expect.any(Object));
  });
});
```

Also add this CMS-count-independent built-output test to
`tests/site-output.test.mjs`. It reuses `findTags` and `hasAttribute` from
Task 12 and never asserts a hashed asset filename:

```js
async function combinedReactionClientBundle() {
  const javascriptFiles = (await readdir('dist/_astro'))
    .filter((filename) => filename.endsWith('.js'))
    .sort();
  assert.ok(
    javascriptFiles.length > 0,
    'Expected at least one generated client bundle',
  );
  return (
    await Promise.all(
      javascriptFiles.map((filename) =>
        readFile(`dist/_astro/${filename}`, 'utf8'),
      ),
    )
  ).join('\n');
}

function checkedInD1DatabaseId(source) {
  const match =
    /"database_id"\s*:\s*"([0-9a-f-]+)"/iu.exec(source);
  assert.ok(match, 'Expected the checked-in production D1 binding');
  return match[1];
}

test('reaction client bundle is present without exposing private deployment values', async () => {
  const [koHtml, enHtml, clientBundle, wranglerConfig] =
    await Promise.all([
      readFile('dist/index.html', 'utf8'),
      readFile('dist/en/index.html', 'utf8'),
      combinedReactionClientBundle(),
      readFile('services/reactions/wrangler.jsonc', 'utf8'),
    ]);
  const output = `${koHtml}\n${enHtml}\n${clientBundle}`;

  assert.match(clientBundle, /\/v1\/reactions\/bootstrap/u);
  assert.match(
    clientBundle,
    /["'`]\/v1\/reactions["'`]/u,
  );

  for (const html of [koHtml, enHtml]) {
    const controls = findTags(html, 'div').filter((tag) =>
      hasAttribute(tag, 'data-reaction-controls'),
    );
    assert.ok(
      controls.length > 0,
      'Expected server-rendered reaction controls',
    );
    assert.equal(
      controls.every((tag) => hasAttribute(tag, 'hidden')),
      true,
      'Expected every control hidden before client bootstrap',
    );
  }

  assert.doesNotMatch(
    output,
    /Bearer\s+v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/u,
  );
  assert.doesNotMatch(output, /REACTION_HMAC_SECRET/u);
  assert.doesNotMatch(output, /CLOUDFLARE_ACCOUNT_ID/u);
  assert.doesNotMatch(
    output,
    /reaction-secret-must-not-ship/u,
  );
  assert.doesNotMatch(
    output,
    /cloudflare-account-must-not-ship/u,
  );
  assert.equal(
    output.includes(checkedInD1DatabaseId(wranglerConfig)),
    false,
    'Expected the D1 UUID to remain outside browser output',
  );
});
```

- [ ] **Step 2: Run RED**

```bash
npm run test:frontend -- tests/reactions/index.test.ts
REACTION_HMAC_SECRET=reaction-secret-must-not-ship \
  CLOUDFLARE_ACCOUNT_ID=cloudflare-account-must-not-ship \
  npm run build
node --test --test-name-pattern='reaction client bundle' \
  tests/site-output.test.mjs
```

Expected: the frontend test FAILS because `index.ts` is missing, and the
built-output test FAILS because no generated client bundle contains the
bootstrap and mutation endpoint literals yet.

- [ ] **Step 3: Implement the initializer**

Create `src/scripts/reactions/index.ts`:

```ts
import {
  createReactionApi,
  type ReactionApi,
} from './api-client';
import {
  createReactionDataController,
  type ReactionDataController,
} from './data-controller';
import {
  createReactionInteractionController,
  type ReactionInteractionController,
} from './interaction-controller';
import {
  createVisitorTokenStore,
  type VisitorTokenStore,
} from './token-store';

export interface ReactionsHandle {
  destroy(): void;
}

export interface InitDependencies {
  createApi(baseUrl: string): ReactionApi;
  createData(options: {
    root: Document;
    api: ReactionApi;
    tokenStore: VisitorTokenStore;
  }): ReactionDataController;
  createInteraction(options: {
    root: Document;
  }): ReactionInteractionController;
  createTokenStore(
    storage: Pick<Storage, 'getItem' | 'setItem'>,
  ): VisitorTokenStore;
}

const dependencies: InitDependencies = {
  createApi: createReactionApi,
  createData: createReactionDataController,
  createInteraction: createReactionInteractionController,
  createTokenStore: createVisitorTokenStore,
};

const unavailableStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => null,
  setItem: () => undefined,
};

export async function initReactions(options: {
  apiUrl?: string;
  root?: Document;
  dependencies?: InitDependencies;
}): Promise<ReactionsHandle | undefined> {
  const apiUrl = options.apiUrl;
  if (!apiUrl || apiUrl.trim().length === 0) return undefined;

  const root = options.root ?? document;
  const factories = options.dependencies ?? dependencies;
  let api: ReactionApi;
  try {
    api = factories.createApi(apiUrl);
  } catch {
    return undefined;
  }

  let storage: Pick<Storage, 'getItem' | 'setItem'> =
    unavailableStorage;
  try {
    storage = root.defaultView?.localStorage ?? unavailableStorage;
  } catch {
    storage = unavailableStorage;
  }

  const tokenStore = factories.createTokenStore(storage);
  const interactionController = factories.createInteraction({ root });
  const dataController = factories.createData({
    root,
    api,
    tokenStore,
  });
  void dataController.bootstrap().catch(() => undefined);

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dataController.destroy();
      interactionController.destroy();
    },
  };
}
```

The optional dependency object is an explicit unit-test seam and is not
passed by production. The interaction controller's `controls.hidden` guard
prevents a loading-time panel from opening. The defensive bootstrap catch
prevents unhandled rejection even if a future data-controller implementation
changes its current failure-swallowing behavior.

- [ ] **Step 4: Add the typed public environment value**

Replace/extend `src/env.d.ts`:

```ts
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_REACTIONS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: Initialize from the existing Astro client script**

At the top of the existing processed `<script>` in
`src/components/Workspace.astro`:

```ts
import { initReactions } from '../scripts/reactions';

void initReactions({
  apiUrl: import.meta.env.PUBLIC_REACTIONS_API_URL,
});
```

Keep theme, drawer, channel observer, and profile behavior unchanged. Do not
add a second inline script or expose the API URL as a secret; it is a public
origin.

- [ ] **Step 6: Confirm the built-output test boundary**

Keep the Step 1 built-output test unchanged. It proves the client bootstrap
and mutation code was bundled, controls remain server-hidden without a local
public API variable, injected non-public sentinel values do not ship, and the
checked-in D1 UUID is absent. The literal header name `Authorization` is
expected browser behavior and is deliberately not banned. Do not add a
hashed asset filename assertion.

- [ ] **Step 7: Run GREEN, complete verification, and commit**

```bash
npm run test:frontend -- tests/reactions/index.test.ts
npm run verify
git add src/scripts/reactions/index.ts \
  tests/reactions/index.test.ts \
  src/components/Workspace.astro \
  src/env.d.ts \
  tests/site-output.test.mjs
git commit -m "feat: enable production project reactions"
```

Expected: full verification passes with no local API variable, and production
will receive the already-configured repository variable.

### Task 17: Verify desktop, keyboard, mobile, localization, and failure behavior in a real browser

**Files:**

- Verify: `src/components/Workspace.astro`
- Verify: `src/styles/reactions.css`
- Verify: the production Worker/D1 through allowed localhost origin

Use the `playwright` skill for this task.

- [ ] **Step 1: Start Astro against the already healthy production Worker**

Retrieve the exact public variable and start local Astro:

```bash
REACTIONS_PRODUCTION_ORIGIN="$(gh variable get PUBLIC_REACTIONS_API_URL)"
PUBLIC_REACTIONS_API_URL="$REACTIONS_PRODUCTION_ORIGIN" \
  npm run dev -- --host 127.0.0.1
```

Expected: Astro serves `http://127.0.0.1:4321/`. Keep it running in a
background session and continue to send user-visible updates at least every
60 seconds.

- [ ] **Step 2: Verify desktop hover and single-panel behavior**

At 1440×900:

1. open `http://127.0.0.1:4321/#work-projects`;
2. wait for one bootstrap request and controls to become unhidden;
3. hover the first work project and assert its action panel is visible;
4. assert every other rendered target panel is hidden;
5. move directly to the second work project and assert only the second opens;
6. leave all project messages and assert the panel closes;
7. confirm the persistent count row shows only positive counts.

Capture one screenshot with a single hovered action bar.

- [ ] **Step 3: Verify keyboard accessibility**

With no mouse movement:

1. focus the first reaction opener;
2. assert the panel opens, `aria-expanded="true"`, and all four buttons are
   enabled;
3. activate `🔥` with Space;
4. assert the count/selected state changes immediately;
5. wait for the matching `PUT` response and for both relevant
   `aria-busy` attributes to disappear;
6. press `Escape`;
7. assert the panel closes and the still-visible launcher retains visible
   focus without reopening;
8. reopen and press `🔥` again;
9. wait for the cancellation `PUT` and pending state to clear.

At the end, assert the visitor no longer has `🔥` selected.
Run the selection/cancellation portion in `try/finally`; the `finally` block
must cancel and await any still-selected temporary reaction before closing the
context.

- [ ] **Step 4: Verify mobile tap behavior and exclusion targets**

At 390×844 with touch/hover disabled:

1. tap ordinary summary text and assert that one panel opens;
2. use a linked project to verify its link, and separately use a project with
   a badge to verify its badge, then verify a tech tag;
3. activate one previously unselected reaction button, assert message-tap
   handling does not toggle the panel, wait for the matching `PUT`, and wait
   for `aria-busy` to clear;
4. tap outside the message and assert the panel closes;
5. tap a second message and assert the first remains closed;
6. verify there is no horizontal overflow.

Capture one screenshot with a mobile action bar open.
Run the temporary reaction selection in `try/finally`; `finally` must reopen
the same target if needed, cancel the reaction when still selected, and await
the cancellation `PUT` plus pending-state clear before closing the context.

- [ ] **Step 5: Verify KO/EN shared state and refresh restoration**

Use one side-project target:

1. on Korean `/`, select `👏`;
2. wait for the matching `PUT` and pending state to clear;
3. reload and assert `👏` remains selected and count is at least one;
4. navigate to `/en/`;
5. find the same `data-reaction-target`, assert this visitor is still selected,
   and assert its displayed count is positive;
6. cancel `👏` and wait for the cancellation `PUT` plus pending-state clear;
7. return to Korean and reload; assert this visitor is no longer selected.

Do not assert an exact global count because real visitors may react
concurrently.
Run Steps 1–7 in `try/finally`; `finally` must navigate back to the same target,
cancel `👏` when this visitor is still selected, and await the cancellation
`PUT` plus pending-state clear before closing the context.

- [ ] **Step 6: Verify API failure isolation and retry**

In a separate browser context:

1. intercept and abort only the Worker bootstrap request;
2. reload;
3. assert portfolio text, links, tags, and badges remain usable;
4. assert controls/counts stay hidden and both channels show one retry row;
5. remove interception and activate one retry;
6. assert only one bootstrap occurs, both retry rows disappear, and controls
   work.

- [ ] **Step 7: Verify the no-JavaScript fallback**

Open one fresh desktop context with JavaScript disabled:

1. load `/` and `/en/`;
2. assert project text, links, tags, and badges remain present and usable;
3. assert no fake count, launcher, action bar, retry error, or empty reaction
   control is visible;
4. assert layout and navigation remain readable.

- [ ] **Step 8: Run automated gates again**

Stop the local server, then run:

```bash
npm run verify
git status --short
```

Expected: all tests pass and no screenshot, token, `.dev.vars`, Wrangler
state, or browser artifact is accidentally tracked.

### Task 18: Review, release Phase B, and prove data survives both deployment types

**Files:**

- Verify: all Phase-B changes
- Verify remotely: GitHub Pages production
- Verify remotely: Worker production
- Preserve remotely: D1 reaction rows

- [ ] **Step 1: Request code review and resolve findings**

Use the `requesting-code-review` skill against the Phase-B diff. Pay special
attention to:

- tags/badges outside hidden controls;
- per-emoji rather than whole-snapshot rollback;
- no auto retry of `PUT`;
- one explicit panel state;
- keyboard Escape focus guard;
- localStorage failure;
- no runtime secret;
- KO/EN target equality;
- no migration or workflow regression.

Implement valid fixes with focused RED/GREEN tests, then run:

```bash
npm run verify
git status --short
```

Expected: clean worktree and all checks passing.

- [ ] **Step 2: Publish a draft Phase-B PR**

Use the `finishing-a-development-branch` skill. The PR description must
include:

- exact UI behavior for desktop, keyboard, and mobile;
- anonymous token boundary;
- no realtime refresh;
- real data started at zero in Phase A;
- production Worker/manifest smoke evidence;
- automated verification results;
- desktop/mobile screenshots;
- rollback: revert UI without touching D1.

Do not merge without authorization for this implementation run.

- [ ] **Step 3: After authorized merge, monitor production**

Wait for:

- required `verify`;
- Pages build/deploy;
- the same-SHA Worker `workflow_run` that follows the successful Pages
  deployment.

Inspect failed checks with the applicable GitHub CI skill before changing
code. Do not repeatedly rerun an unexplained failure.

- [ ] **Step 4: Run production UI and API smoke checks**

Open `https://kybee.github.io` and `/en/` at desktop and mobile sizes. Repeat
one hover, keyboard, mobile outside-tap, and KO/EN target check. Run:

```bash
PUBLIC_REACTIONS_API_URL="$(gh variable get PUBLIC_REACTIONS_API_URL)" \
  node scripts/smoke-reactions-api.mjs
```

Expected: bootstrap passes, controls become visible only with real data, and
no fake count exists.

- [ ] **Step 5: Prove a selected reaction survives a Worker redeploy**

In one controlled browser profile:

1. select a previously unselected emoji on one target;
2. wait for its `PUT` response and `aria-busy` removal;
3. record only the target, emoji, and this browser's `aria-pressed=true` state;
4. dispatch the existing Worker deployment workflow for the same `main`
   commit;
5. wait for its migration list/apply, deploy, and read-only smoke to pass;
6. reload the browser and assert the same visitor remains selected.

Wrap Steps 1–6 and the next task in a browser-test `try/finally`. The `finally`
block must reload if necessary, cancel the temporary reaction when still
selected, wait for the cancellation `PUT` and pending-state clear, and report
any cleanup failure. Do not log or copy the visitor token.

- [ ] **Step 6: Prove it survives a Pages redeploy**

With the temporary selection still active:

1. dispatch the existing GitHub Pages deployment workflow for the same
   `main` commit;
2. wait for Pages deploy to finish;
3. reload and assert the selection still exists;
4. click the emoji again to cancel the temporary verification reaction;
5. wait for the cancellation `PUT` and `aria-busy` removal;
6. reload and assert this visitor is unselected.

The two redeploys must not reset, recreate, or migrate D1 destructively.

- [ ] **Step 7: Final completion evidence**

Report:

- Phase A and Phase B PR/merge URLs;
- production site and Worker origins;
- `npm run verify` result;
- production smoke result;
- desktop/mobile/keyboard verification;
- KO/EN shared-target verification;
- Worker and Pages redeploy persistence verification;
- confirmation that the temporary test reaction was canceled;
- confirmation that no secret or visitor identity was committed/logged.

If any required external approval remains, report that exact gate instead of
claiming completion.
