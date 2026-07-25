import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const validatorUrl = new URL('../scripts/lib/content-validation.mjs', import.meta.url);
const fixtureRoots = new Set();
let validatorPromise;

afterEach(async () => {
  await Promise.all(
    [...fixtureRoots].map((fixtureRoot) =>
      rm(fixtureRoot, { recursive: true, force: true }),
    ),
  );
  fixtureRoots.clear();
});

async function loadValidator() {
  try {
    validatorPromise ??= import(validatorUrl);
    return await validatorPromise;
  } catch (error) {
    assert.fail(`content validator module must load: ${error.code ?? error.message}`);
  }
}

function serializeYaml(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n`;
}

async function writeFixtureFile(contentRoot, relativePath, contents) {
  const absolutePath = join(contentRoot, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    typeof contents === 'string' ? contents : serializeYaml(contents),
    'utf8',
  );
}

async function writePair(
  contentRoot,
  collection,
  identifier,
  koValues = {},
  enValues = {},
) {
  await Promise.all([
    writeFixtureFile(contentRoot, `${collection}/${identifier}.ko.yaml`, {
      lang: 'ko',
      order: 1,
      ...koValues,
    }),
    writeFixtureFile(contentRoot, `${collection}/${identifier}.en.yaml`, {
      lang: 'en',
      order: 1,
      ...enValues,
    }),
  ]);
}

async function createValidFixture() {
  const contentRoot = await mkdtemp(join(tmpdir(), 'content-validation-'));
  fixtureRoots.add(contentRoot);

  await Promise.all([
    writeFixtureFile(contentRoot, 'about/ko.yaml', { lang: 'ko' }),
    writeFixtureFile(contentRoot, 'about/en.yaml', { lang: 'en' }),
    writePair(
      contentRoot,
      'projects',
      'current',
      {
        company: '한국 회사',
        role: '백엔드 엔지니어',
        period: '2024 – 현재',
      },
      {
        company: 'English Company',
        role: 'Backend Engineer',
        period: '2024 – Present',
      },
    ),
    writePair(contentRoot, 'sideProjects', 'demo'),
    writePair(contentRoot, 'skills', 'backend'),
    writePair(contentRoot, 'education', 'school'),
    writePair(contentRoot, 'certifications', 'cert'),
  ]);

  return contentRoot;
}

function assertUsefulErrors(errors, fragments) {
  assert.deepEqual(errors, [...errors].sort(), 'errors must be sorted');
  for (const fragment of fragments) {
    assert.ok(
      errors.some((error) => error.includes(fragment)),
      `expected an error containing ${JSON.stringify(fragment)}:\n${errors.join('\n')}`,
    );
  }
}

test('accepts a complete bilingual content root', async () => {
  const contentRoot = await createValidFixture();
  const { COLLECTIONS, validateContentRoot } = await loadValidator();

  assert.deepEqual(COLLECTIONS, [
    'about',
    'projects',
    'sideProjects',
    'skills',
    'education',
    'certifications',
  ]);
  assert.deepEqual(await validateContentRoot(contentRoot), []);
});

test('CLI exits successfully for a complete bilingual content root', async () => {
  const contentRoot = await createValidFixture();

  const result = spawnSync(
    process.execPath,
    ['scripts/validate-content.mjs', contentRoot],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Content validation passed/);
  assert.equal(result.stderr, '');
});

test('CLI reports a missing translation without exposing absolute paths', async () => {
  const contentRoot = await createValidFixture();
  await rm(join(contentRoot, 'projects/current.en.yaml'));

  const result = spawnSync(
    process.execPath,
    ['scripts/validate-content.mjs', contentRoot],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[projects\]/);
  assert.match(result.stderr, /projects\/current\.ko\.yaml/);
  assert.match(result.stderr, /projects\/current\.en\.yaml/);
  assert.match(result.stderr, /opposite-language pair/);
  assert.equal(result.stderr.includes(contentRoot), false);
});

test('reports a missing opposite-language pair', async () => {
  const contentRoot = await createValidFixture();
  await rm(join(contentRoot, 'projects/current.en.yaml'));
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[projects]',
    'projects/current.ko.yaml',
    'projects/current.en.yaml',
    'opposite-language pair',
  ]);
});

test('rejects unsupported filenames, extensions, and subdirectories', async () => {
  const contentRoot = await createValidFixture();
  await Promise.all([
    writePair(contentRoot, 'projects', 'bad_name', { order: 9 }, { order: 9 }),
    writeFixtureFile(contentRoot, 'sideProjects/notes.json', '{}\n'),
    mkdir(join(contentRoot, 'skills/nested')),
  ]);
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[projects] projects/bad_name.ko.yaml',
    'lowercase ASCII letters, digits, and single hyphens',
    '[sideProjects] sideProjects/notes.json',
    'regular .yaml file',
    '[skills] skills/nested',
    'subdirectories are not supported',
  ]);
});

test('requires about to contain exactly ko.yaml and en.yaml', async () => {
  const contentRoot = await createValidFixture();
  await writePair(contentRoot, 'about', 'profile');
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[about]',
    'about/profile.en.yaml',
    'about/profile.ko.yaml',
    'exactly ko.yaml and en.yaml',
  ]);
});

test('requires all six collection directories', async () => {
  const contentRoot = await createValidFixture();
  await rm(join(contentRoot, 'skills'), { recursive: true });
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[skills] skills',
    'collection directory must exist',
  ]);
});

test('reports a filename suffix and parsed lang mismatch', async () => {
  const contentRoot = await createValidFixture();
  await writeFixtureFile(contentRoot, 'skills/backend.en.yaml', {
    lang: 'ko',
    order: 1,
  });
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[skills] skills/backend.en.yaml',
    'filename suffix "en"',
    'parsed YAML lang "ko"',
  ]);
});

test('reports a bilingual pair order mismatch', async () => {
  const contentRoot = await createValidFixture();
  await writeFixtureFile(contentRoot, 'sideProjects/demo.en.yaml', {
    lang: 'en',
    order: 2,
  });
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[sideProjects]',
    'sideProjects/demo.en.yaml',
    'sideProjects/demo.ko.yaml',
    'paired order values must match',
  ]);
});

test('reports duplicate order values per collection and language', async () => {
  const contentRoot = await createValidFixture();
  await writePair(
    contentRoot,
    'certifications',
    'other',
    { order: 1 },
    { order: 1 },
  );
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[certifications]',
    'certifications/cert.en.yaml',
    'certifications/other.en.yaml',
    'certifications/cert.ko.yaml',
    'certifications/other.ko.yaml',
    'order 1 must be unique',
  ]);
});

test('requires education to contain exactly one bilingual identifier pair', async () => {
  const contentRoot = await createValidFixture();
  await writePair(
    contentRoot,
    'education',
    'college',
    { order: 2 },
    { order: 2 },
  );
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[education]',
    'education/college.en.yaml',
    'education/school.ko.yaml',
    'exactly one bilingual identifier pair',
    'found 2',
  ]);
});

test('reports mismatched sorted project order arrays', async () => {
  const contentRoot = await createValidFixture();
  await writePair(
    contentRoot,
    'projects',
    'previous',
    {
      order: 2,
      company: '이전 회사',
      role: '개발자',
      period: '2022 – 2023',
    },
    {
      order: 3,
      company: 'Previous Company',
      role: 'Developer',
      period: '2022 – 2023',
    },
  );
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[projects]',
    'projects/current.ko.yaml',
    'projects/previous.en.yaml',
    'sorted KO/EN order arrays must match',
    'ko=[1,2]',
    'en=[1,3]',
  ]);
});

test('compares project group boundaries and first-group sizes', async () => {
  const contentRoot = await createValidFixture();
  await Promise.all([
    writePair(
      contentRoot,
      'projects',
      'second',
      {
        order: 2,
        company: '한국 회사',
        role: '백엔드 엔지니어',
        period: '2024 – 현재',
      },
      {
        order: 2,
        company: 'Previous Company',
        role: 'Developer',
        period: '2022 – 2023',
      },
    ),
    writePair(
      contentRoot,
      'projects',
      'third',
      {
        order: 3,
        company: '이전 회사',
        role: '개발자',
        period: '2022 – 2023',
      },
      {
        order: 3,
        company: 'Previous Company',
        role: 'Developer',
        period: '2022 – 2023',
      },
    ),
  ]);
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[projects]',
    'projects/current.en.yaml',
    'projects/third.ko.yaml',
    'adjacent group boundary indices must match',
    'ko=[2]',
    'en=[1]',
    'first project group sizes must match',
    'ko=2',
    'en=1',
  ]);
});

test('does not compare translated project group labels directly', async () => {
  const contentRoot = await createValidFixture();
  await writePair(
    contentRoot,
    'projects',
    'second',
    {
      order: 2,
      company: '한국 회사',
      role: '백엔드 엔지니어',
      period: '2024 – 현재',
    },
    {
      order: 2,
      company: 'English Company',
      role: 'Backend Engineer',
      period: '2024 – Present',
    },
  );
  const { validateContentRoot } = await loadValidator();

  assert.deepEqual(await validateContentRoot(contentRoot), []);
});

test('ignores config.ts at the content root', async () => {
  const contentRoot = await createValidFixture();
  await writeFixtureFile(
    contentRoot,
    'config.ts',
    'this is intentionally not valid TypeScript or YAML\n',
  );
  const { validateContentRoot } = await loadValidator();

  assert.deepEqual(await validateContentRoot(contentRoot), []);
});

test('turns invalid YAML into a deterministic validation error', async () => {
  const contentRoot = await createValidFixture();
  await writeFixtureFile(contentRoot, 'about/en.yaml', 'lang: [en\n');
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[about] about/en.yaml',
    'file must contain parseable YAML',
  ]);
  assert.equal(
    errors.some((error) => error.includes(tmpdir())),
    false,
    'errors must not expose machine-specific absolute paths',
  );
});

test('turns file read failures into deterministic validation errors', async () => {
  const contentRoot = await createValidFixture();
  const unreadablePath = join(contentRoot, 'certifications/cert.en.yaml');
  await chmod(unreadablePath, 0o000);
  const { validateContentRoot } = await loadValidator();

  try {
    const errors = await validateContentRoot(contentRoot);

    assertUsefulErrors(errors, [
      '[certifications] certifications/cert.en.yaml',
      'file must be readable as UTF-8 text',
    ]);
    assert.equal(
      errors.some((error) => error.includes(tmpdir())),
      false,
      'errors must not expose machine-specific absolute paths',
    );
  } finally {
    await chmod(unreadablePath, 0o600);
  }
});

test('does not throw for parseable YAML aliases with cyclic values', async () => {
  const contentRoot = await createValidFixture();
  await Promise.all([
    writeFixtureFile(
      contentRoot,
      'certifications/cert.en.yaml',
      'lang: &loop\n  self: *loop\norder: 1\n',
    ),
    writeFixtureFile(
      contentRoot,
      'projects/current.ko.yaml',
      [
        'lang: ko',
        'order: 1',
        'company: &company',
        '  self: *company',
        'role: 백엔드 엔지니어',
        'period: 2024 – 현재',
        '',
      ].join('\n'),
    ),
    writePair(
      contentRoot,
      'projects',
      'second',
      {
        order: 2,
        company: '다른 회사',
        role: '개발자',
        period: '2022 – 2023',
      },
      {
        order: 2,
        company: 'Another Company',
        role: 'Developer',
        period: '2022 – 2023',
      },
    ),
  ]);
  const { validateContentRoot } = await loadValidator();

  const errors = await validateContentRoot(contentRoot);

  assertUsefulErrors(errors, [
    '[certifications] certifications/cert.en.yaml',
    'filename suffix "en"',
    '[Circular]',
  ]);
});
