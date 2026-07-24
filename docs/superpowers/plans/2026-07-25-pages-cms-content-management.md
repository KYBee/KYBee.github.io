# Pages CMS Content Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the owner to sign in to hosted Pages CMS with GitHub, create/update/delete supported bilingual YAML content on `content/*` branches, validate it, and open a guarded pull request to `main`.

**Architecture:** Pages CMS reads a root `.pages.yml` that mirrors the six Astro content schemas. A dependency-light Node validator checks filename/language/order pairing rules before Astro builds. GitHub Actions validates every CMS branch head. Publishing dispatches the trusted workflow from `main`, fetches the exact observed content-branch head, rejects changes outside `src/content/`, and only then opens or reuses a matching pull request.

**Tech Stack:** Astro 4, Node.js 20, `node:test`, `yaml` 2.9, Pages CMS 2.x configuration, GitHub Actions, GitHub CLI

---

## Scope

This plan implements the content-management portion of
`docs/superpowers/specs/2026-07-24-portfolio-content-seo-font-design.md`.
SEO metadata, favicon/OG image, and Pretendard changes remain separate work.

The existing uncommitted experience-header redesign is intentionally carried
forward, with the user's additional decision that `# 경력` must not render
horizontal separators between companies.

### Task 1: Preserve the experience hierarchy and remove company separators

**Files:**
- Create: `tests/site-output.test.mjs`
- Modify: `src/components/Workspace.astro`
- Modify: `CLAUDE.md`
- Modify: `package.json`

- [x] **Step 1: Add a failing production-output test**

Create `tests/site-output.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const page of ['dist/index.html', 'dist/en/index.html']) {
  test(`${page} renders hierarchical jobs without separators`, async () => {
    const html = await readFile(page, 'utf8');
    assert.match(html, /class="job-header"/);
    assert.match(html, /class="job-company"/);
    assert.match(html, /class="job-role"/);
    assert.match(html, /class="job-meta"/);
    assert.doesNotMatch(html, /class="job-hr"/);
  });
}
```

Add the temporary runnable script:

```json
"test:site": "node --test tests/site-output.test.mjs"
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
npm run build && npm run test:site
```

Expected: both tests fail because the current branch still renders
`.job-divider` and `<hr class="job-hr">`.

- [x] **Step 3: Apply the existing hierarchy and the new no-divider rule**

In `Workspace.astro`, add:

```ts
const formatRole = (role: string) => role.replace(/\s*\(([^)]+)\)\s*$/, ' · $1');
```

Use only `firstJob.company` for both experience topics. Render every group as:

```astro
<div class="job-group">
  <div class="job-header">
    <p class="job-company">{group.company}</p>
    <p class="job-role">{formatRole(group.role)}</p>
    <p class="job-meta">
      {group.period}{group.location ? ` · ${group.location}` : ''}
    </p>
  </div>
  {gi === 0 ? (
    <p class="message-summary">{about.work}</p>
  ) : (
    group.items.map((item) => (
      <>
        {item.summary && <p class="message-summary">{item.summary}</p>}
        {item.tags.length > 0 && (
          <div class="reactions">
            {item.tags.map((tag) => (
              <span class="tag-pill">{tag}</span>
            ))}
          </div>
        )}
      </>
    ))
  )}
</div>
```

Do not render an `<hr>` between groups. Remove the unused `.job-hr` and
`.job-divider` styles, and add:

```css
.job-header {
  max-width: var(--content-max-width);
  margin: 0 0 var(--space-tight);
}

.job-company {
  color: var(--text);
  font-size: var(--fs-title-md);
  font-weight: 700;
}

.job-role {
  color: var(--text-secondary);
  font-size: var(--fs-bullet);
  font-weight: 400;
  margin-top: 2px;
}

.job-meta {
  color: var(--text-muted);
  font-size: var(--fs-xs);
  margin-top: 2px;
}
```

Update `CLAUDE.md` to document the three-line hierarchy and explicitly state
that company groups have no separator line.

- [x] **Step 4: Run the build-output test and verify GREEN**

Run:

```bash
npm run build && npm run test:site
```

Expected: 2 tests pass.

- [x] **Step 5: Commit**

```bash
git add CLAUDE.md src/components/Workspace.astro package.json tests/site-output.test.mjs
git commit -m "refactor: simplify experience hierarchy"
```

### Task 2: Implement bilingual content validation

**Files:**
- Create: `scripts/lib/content-validation.mjs`
- Create: `tests/content-validation.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Install the direct YAML dependency**

Run:

```bash
npm install --save-dev yaml@2.9.0
```

Expected: `yaml` appears in `devDependencies` and the lockfile changes.

- [x] **Step 2: Write failing validator tests**

Create `tests/content-validation.test.mjs` using `node:test`, temporary
directories from `node:fs/promises.mkdtemp`, and this public API:

```js
import { validateContentRoot } from '../scripts/lib/content-validation.mjs';

const errors = await validateContentRoot(contentRoot);
assert.deepEqual(errors, []);
```

The fixture helper must create all six directories and a minimal valid set:

```text
about/ko.yaml
about/en.yaml
projects/current.ko.yaml
projects/current.en.yaml
sideProjects/demo.ko.yaml
sideProjects/demo.en.yaml
skills/backend.ko.yaml
skills/backend.en.yaml
education/school.ko.yaml
education/school.en.yaml
certifications/cert.ko.yaml
certifications/cert.en.yaml
```

Add separate tests that expect descriptive errors for:

```text
missing opposite-language file
unsupported filename or extension
filename suffix and YAML lang mismatch
translation-pair order mismatch
duplicate order in one collection/language
education containing more than one pair
project order mismatch between languages
project group-boundary mismatch between languages
first project-group size mismatch
```

Also prove that `src/content/config.ts` outside the collection directories is
ignored and that valid data returns no errors.

- [x] **Step 3: Run the validator test and verify RED**

Run:

```bash
node --test tests/content-validation.test.mjs
```

Expected: failure because `validateContentRoot` is not implemented.

- [x] **Step 4: Implement the validator**

`scripts/lib/content-validation.mjs` must export:

```js
export const COLLECTIONS = [
  'about',
  'projects',
  'sideProjects',
  'skills',
  'education',
  'certifications',
];

export async function validateContentRoot(contentRoot) {
  // Return every error as a string. Do not throw for user-correctable content.
}
```

Implementation rules:

```text
about:
  exactly ko.yaml and en.yaml

education:
  exactly one <identifier>.ko.yaml / <identifier>.en.yaml pair

projects, sideProjects, skills, certifications:
  <identifier>.<ko|en>.yaml

identifier:
  lowercase ASCII letters, digits, and single hyphen-separated segments

all paired collections:
  opposite language file exists
  filename language equals parsed YAML lang
  pair order values match when order exists
  order is unique within each collection/language

projects:
  sorted order arrays match
  adjacent company+role+period group boundary indices match
  first group sizes match
```

Parse with:

```js
import { parse } from 'yaml';
```

Every error must include the collection, relevant relative path, and the rule
to fix. Sort paths and returned errors for deterministic CI output.

- [x] **Step 5: Run the validator test and verify GREEN**

Run:

```bash
node --test tests/content-validation.test.mjs
```

Expected: all validator tests pass with no warnings.

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/lib/content-validation.mjs tests/content-validation.test.mjs
git commit -m "feat: validate bilingual portfolio content"
```

### Task 3: Add the validation CLI and npm verification pipeline

**Files:**
- Create: `scripts/validate-content.mjs`
- Modify: `tests/content-validation.test.mjs`
- Modify: `package.json`

- [x] **Step 1: Write failing CLI tests**

Add subprocess tests that run the CLI against a valid temporary root and a
root missing one translation:

```js
const result = spawnSync(
  process.execPath,
  ['scripts/validate-content.mjs', fixtureRoot],
  { cwd: repoRoot, encoding: 'utf8' },
);

assert.equal(result.status, 0);
assert.match(result.stdout, /Content validation passed/);
```

For invalid content, assert exit status `1` and that stderr includes the
collection and missing path.

- [x] **Step 2: Run the CLI tests and verify RED**

Run:

```bash
node --test tests/content-validation.test.mjs
```

Expected: CLI tests fail because `scripts/validate-content.mjs` is absent.

- [x] **Step 3: Implement the CLI**

Create:

```js
#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { validateContentRoot } from './lib/content-validation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.resolve(process.argv[2] ?? path.join(repoRoot, 'src/content'));
const errors = await validateContentRoot(contentRoot);

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Content validation passed: ${contentRoot}`);
}
```

Set scripts exactly:

```json
{
  "test": "node --test tests/content-validation.test.mjs tests/pages-config.test.mjs tests/workflows.test.mjs",
  "validate:content": "node scripts/validate-content.mjs",
  "test:site": "node --test tests/site-output.test.mjs",
  "verify": "npm test && npm run validate:content && npm run build && npm run test:site"
}
```

The `pages-config` and `workflows` test files are introduced by the next tasks,
so use targeted commands until those files exist.

- [x] **Step 4: Run targeted tests and the real content validator**

Run:

```bash
node --test tests/content-validation.test.mjs
npm run validate:content
```

Expected: tests pass and all current repository content validates.

- [x] **Step 5: Commit**

```bash
git add package.json scripts/validate-content.mjs tests/content-validation.test.mjs
git commit -m "build: add content verification commands"
```

### Task 4: Configure Pages CMS and verify schema parity

**Files:**
- Create: `.pages.yml`
- Create: `tests/helpers/pages-schema-parity.mjs`
- Create: `tests/pages-config.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Write a failing Pages CMS configuration test**

Parse `.pages.yml` with `yaml.parse` and assert:

```js
assert.equal(config.settings.content.merge, false);
assert.equal(config.settings.commit.identity, 'app');
assert.deepEqual(
  config.actions.map(({ name, workflow, ref }) => ({ name, workflow, ref })),
  [
    { name: 'validate-content', workflow: 'content-check.yml', ref: 'current' },
    { name: 'request-publish', workflow: 'content-publish.yml', ref: 'main' },
  ],
);
```

Assert these exact menus and operations:

| name | type | path | create | rename | delete |
|---|---|---|---:|---:|---:|
| `about-ko` | file | `src/content/about/ko.yaml` | false | false | false |
| `about-en` | file | `src/content/about/en.yaml` | false | false | false |
| `projects` | collection | `src/content/projects` | true | false | true |
| `side-projects` | collection | `src/content/sideProjects` | true | false | true |
| `skills` | collection | `src/content/skills` | true | false | true |
| `education` | collection | `src/content/education` | false | false | false |
| `certifications` | collection | `src/content/certifications` | true | false | true |

All entries must use `format: yaml`. The four dynamic collections must use:

```yaml
filename:
  template: "{primary}.{lang}.yaml"
  field: create
```

Recursively assert these schema mappings:

```text
Zod string -> Pages CMS string, except the explicitly listed multiline text fields
number -> number
lang enum -> select with options.values [ko, en]
array -> element type plus list
object -> object plus nested fields
optional Zod field -> required is not true
required Zod field -> required true
projects.bullets -> list.max 4 and list.collapsible false
projects.tags -> optional string list
education.courses -> optional object list with required category/items
about.links -> required object with four required string children
```

Read `src/content/config.ts` with the TypeScript compiler AST rather than
duplicating its schema in the test. Add `typescript@5.9.3` as a direct
development dependency, normalize the extracted Zod structure and the Pages
CMS field structure, and compare them recursively. Mutation tests must prove
that a field-name, base-type, or optionality change in the Astro schema makes
the parity assertion fail.

Pages CMS 2.1.8 currently requires `list.collapsible` in its runtime schema
whenever `list` uses the object form, despite the public documentation marking
it optional. Set `projects.bullets.list.collapsible: false` alongside `max: 4`
and keep a regression assertion for that hosted-version compatibility.

The multiline text exceptions are:

```text
about.tagline
about.bullets
about.work
about.interests
about.strengths
about.whereabouts
projects.summary
projects.bullets
sideProjects.description
education.detail
```

- [x] **Step 2: Run the config test and verify RED**

Run:

```bash
node --test tests/pages-config.test.mjs
```

Expected: failure because `.pages.yml` does not exist.

- [x] **Step 3: Create `.pages.yml`**

Use:

```yaml
settings:
  content:
    merge: false
  commit:
    identity: app
    templates:
      create: "content(create): {path}"
      update: "content(update): {path}"
      delete: "content(delete): {path}"
      rename: "content(rename): {oldPath} -> {newPath}"

actions:
  - name: validate-content
    label: 콘텐츠 검사
    workflow: content-check.yml
    ref: current
  - name: request-publish
    label: 게시 요청
    workflow: content-publish.yml
    ref: main
    confirm:
      title: 게시 요청을 만들까요?
      message: 현재 브랜치에서 main으로 향하는 pull request를 만듭니다.
      button: 게시 요청
```

Define all seven content entries from the table above. Use the exact
`src/content/config.ts` fields:

```text
about:
  name, title, tagline, location, links{github,blog,linkedin,email},
  bullets[], activities?, status, activityStatus, affiliation, work,
  interests, strengths, whereabouts, lang

projects:
  company, role, period, location?, title?, summary?, bullets[max 4]?,
  metric?, tags[]?, lang, order

sideProjects:
  name, tech, description, url?, badge?, lang, order

skills:
  category, items[], lang, order

education:
  school, department, period, detail,
  courses[{category,items[]}]?, languages?, lang, order

certifications:
  name, date?, lang, order
```

Use `text` for exactly these multiline fields:
`about.tagline`, `about.bullets`, `about.work`, `about.interests`,
`about.strengths`, `about.whereabouts`, `projects.summary`,
`projects.bullets`, `sideProjects.description`, and `education.detail`.
Use `string` for every other Zod string, including periods, dates, URLs, and
email. Astro remains the final URL/email format validator.
Set each collection's `view.primary`, `view.fields`, sortable `order`, and
ascending default so language and order are visible. Use the documented shape:

```yaml
view:
  fields: [company, title, lang, order]
  primary: company
  sort: [order]
  default:
    sort: order
    order: asc
```

- [x] **Step 4: Run the config test and verify GREEN**

Run:

```bash
node --test tests/pages-config.test.mjs
```

Expected: all Pages CMS configuration tests pass.

- [x] **Step 5: Add the config test to the unit-test command**

Set:

```json
"test": "node --test tests/content-validation.test.mjs tests/pages-config.test.mjs"
```

Run `npm test` and expect all content and CMS configuration tests to pass.

- [x] **Step 6: Commit**

```bash
git add .pages.yml package.json package-lock.json tests/pages-config.test.mjs tests/helpers/pages-schema-parity.mjs
git commit -m "feat: configure Pages CMS content editing"
```

### Task 5: Add guarded content-check and publish workflows

**Files:**
- Create: `.github/workflows/content-check.yml`
- Create: `.github/workflows/content-publish.yml`
- Create: `tests/workflows.test.mjs`
- Modify: `.pages.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `package.json`
- Modify: `tests/pages-config.test.mjs`

- [x] **Step 1: Write failing workflow configuration tests**

Parse all three workflows as YAML and assert:

```text
content-check:
  push branches content/**
  pull_request base main
  workflow_dispatch payload string, required false, default "{}"
  contents read only
  content branches use a NUL-safe --no-renames content-only diff guard
  Node 20, npm ci, npm run verify

content-publish:
  workflow_dispatch payload string, required false, default "{}"
  contents read and pull-requests write
  Pages CMS dispatches the trusted workflow from main
  validates the Pages CMS action and repository payload
  accepts repository.ref only as ^content/[a-z0-9][a-z0-9-]*$
  fetches and detaches the exact observed content-branch SHA
  diffs with --no-renames against origin/main
  rejects zero src/content/** changes
  rejects every path outside src/content/**
  reuses only an exact same-repository/base/head PR at the observed SHA
  creates a main-targeted PR otherwise

deploy:
  withastro/action build-cmd is npm run verify
```

- [x] **Step 2: Run workflow tests and verify RED**

Run:

```bash
node --test tests/workflows.test.mjs
```

Expected: failure because both CMS workflows are absent and deploy does not
use `npm run verify`.

- [x] **Step 3: Implement `content-check.yml`**

Use:

```yaml
name: Content Check

on:
  push:
    branches:
      - "content/**"
  pull_request:
    branches:
      - main
  workflow_dispatch:
    inputs:
      payload:
        description: Pages CMS payload as JSON
        required: false
        default: "{}"
        type: string

permissions:
  contents: read

concurrency:
  group: content-check-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run verify
```

Before `npm run verify`, run the same NUL-safe `--no-renames` scope guard for
`content/**` pushes, pull requests whose head is `content/**`, and dispatches
on `content/**`. Do not apply the content-only guard to ordinary feature pull
requests; they must still run the general verification pipeline.

- [x] **Step 4: Implement `content-publish.yml`**

Set the Pages CMS `request-publish` action to `ref: main` so the PR-write
workflow definition always comes from the trusted base branch. Keep
`validate-content` on `ref: current`.

The publish job must set `inputs.payload` and all GitHub contexts through
`env`, quote every shell variable, and use `set -euo pipefail`. Parse the
payload with `jq` and require string values for:

```text
source = pages-cms
action.name = request-publish
repository.owner/repo = the current GitHub repository
repository.ref = ^content/[a-z0-9][a-z0-9-]*$
repository.workflowRef = main
repository.sha = the 40-hex SHA of the dispatched main workflow
```

Pages CMS 2.1.8 sets `repository.sha` to the resolved workflow ref SHA, not the
content ref SHA. Require it to equal the dispatch's `github.sha`. After
checkout of `main` with `fetch-depth: 0` and `persist-credentials: false`,
fetch explicit `main` and content-branch refs. Capture the fetched remote
content-branch SHA and checkout that commit detached. Inspect:

```bash
git diff --no-renames --name-only -z "origin/$BASE_BRANCH...HEAD"
```

Require at least one `src/content/*` path and reject any other path. The
`--no-renames` flag is mandatory so an outside-file deletion plus
`src/content` addition cannot be hidden as a rename.

Query open pull requests with `head="$REPO_OWNER:$SOURCE_BRANCH"`, then filter
the response to require all four exact values:

```text
head.repo.full_name = current repository
head.ref = source branch
base.repo.full_name = current repository
base.ref = main
```

Reuse or create the PR only when its `head.sha` equals the captured source
SHA. Query again after creation, and query once more if creation races. If a PR
created by this run points to a different SHA, close that new PR and fail.

- [x] **Step 5: Update deploy verification**

Keep the existing Pages deployment permissions and jobs. Configure
`withastro/action@v3` with:

```yaml
with:
  node-version: "20"
  build-cmd: npm run verify
```

- [x] **Step 6: Run workflow tests and verify GREEN**

Run:

```bash
node --test tests/workflows.test.mjs
```

Expected: all workflow tests pass. In addition to YAML-shape and `bash -n`
checks, execute the extracted shell in temporary Git repositories with a
stubbed `gh`. Cover valid content, zero diff, outside paths, an
outside-to-content rename, newline-bearing paths, wrong-repository PR results,
exact PR reuse, create races, and PR head-SHA mismatches.

- [x] **Step 7: Add workflow tests to the unit-test command**

Set:

```json
"test": "node --test tests/content-validation.test.mjs tests/pages-config.test.mjs tests/workflows.test.mjs"
```

Run `npm test` and then `npm run verify`; expect all validation, schema,
workflow, build, and rendered-output checks to pass.

- [x] **Step 8: Commit**

```bash
git add .pages.yml .github/workflows package.json tests/pages-config.test.mjs tests/workflows.test.mjs
git commit -m "ci: validate and publish CMS content branches"
```

### Task 6: Complete automated verification and operating documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-07-25-pages-cms-content-management.md`

- [x] **Step 1: Run the complete verification pipeline**

Run:

```bash
npm run verify
```

Expected: unit/config/workflow tests pass, real bilingual content validates,
Astro builds both language pages, and both site-output tests pass.

- [x] **Step 2: Add CMS operating rules to `CLAUDE.md`**

Document:

```text
Sign in at https://app.pagescms.org with GitHub.
Install the Pages CMS GitHub App only for KYBee.github.io.
Create content/<lowercase-hyphen-name> from current main.
Create filenames as <identifier>.ko.yaml and <identifier>.en.yaml.
Edit both files with the same identifier and order.
Run 콘텐츠 검사.
Run 게시 요청.
Merge only after Content Check succeeds.
Delete both language files together.
Never edit main directly through Pages CMS.
```

Also document the one-time GitHub settings:

```text
Actions workflow permissions: Read and write permissions
Allow GitHub Actions to create and approve pull requests
main ruleset: require pull request and the Content Check / verify status
```

Explain that an Actions-created PR can show a separate approval-required
`pull_request` run; the required evidence for CMS saves is the successful
`content/**` push check attached to the same head SHA.

- [x] **Step 3: Re-run fresh verification**

Run:

```bash
npm run verify
git diff --check
git status --short
```

Expected: verification exits 0, no whitespace errors, and only intentional
plan/document changes remain.

- [x] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-07-25-pages-cms-content-management.md
git commit -m "docs: explain Pages CMS publishing workflow"
```

## Manual acceptance after the branch is deployed

**Status:** Pending — the repository owner must complete the GitHub App and
repository settings below after this branch is deployed.

1. Sign in to `https://app.pagescms.org` with the repository owner's GitHub
   account.
2. Install the Pages CMS GitHub App with access limited to
   `KYBee.github.io`.
3. Enable the repository Actions setting that allows Actions to create pull
   requests.
4. Create `content/test-cms` from current `main`.
5. Update one existing KO/EN pair and confirm two commits land only on that
   branch.
6. Create and then delete a disposable KO/EN pair.
7. Confirm a one-sided pair fails `콘텐츠 검사`.
8. Confirm `게시 요청` opens or returns one PR and rejects `main`.
9. Require `Content Check / verify` in the `main` ruleset before merging.
