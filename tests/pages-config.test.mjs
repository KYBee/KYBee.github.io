import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  assertPagesSchemaParity,
  extractCollectionSchemas,
} from './helpers/pages-schema-parity.mjs';

const configPath = fileURLToPath(new URL('../.pages.yml', import.meta.url));
const schemaPath = fileURLToPath(
  new URL('../src/content/config.ts', import.meta.url),
);

const entrySchemaMap = {
  'about-ko': 'about',
  'about-en': 'about',
  projects: 'projects',
  'side-projects': 'sideProjects',
  skills: 'skills',
  education: 'education',
  certifications: 'certifications',
};

const textEditorExceptions = {
  about: [
    'tagline',
    'bullets',
    'work',
    'interests',
    'strengths',
    'whereabouts',
  ],
  projects: ['summary', 'bullets'],
  sideProjects: ['description'],
  education: ['detail'],
};

async function loadConfig() {
  let source;

  try {
    source = await readFile(configPath, 'utf8');
  } catch (error) {
    assert.fail(`.pages.yml must exist: ${error.code ?? error.message}`);
  }

  const config = parse(source);
  assert.ok(config && typeof config === 'object', '.pages.yml must parse as an object');
  return config;
}

function byName(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.name, entry]));
}

const operations = {
  locked: { create: false, rename: false, delete: false },
  dynamic: { create: true, rename: false, delete: true },
};

const contentTopology = [
  {
    name: 'about-ko',
    type: 'file',
    path: 'src/content/about/ko.yaml',
    operations: operations.locked,
  },
  {
    name: 'about-en',
    type: 'file',
    path: 'src/content/about/en.yaml',
    operations: operations.locked,
  },
  {
    name: 'projects',
    type: 'collection',
    path: 'src/content/projects',
    operations: operations.dynamic,
  },
  {
    name: 'side-projects',
    type: 'collection',
    path: 'src/content/sideProjects',
    operations: operations.dynamic,
  },
  {
    name: 'skills',
    type: 'collection',
    path: 'src/content/skills',
    operations: operations.dynamic,
  },
  {
    name: 'education',
    type: 'collection',
    path: 'src/content/education',
    operations: operations.locked,
  },
  {
    name: 'certifications',
    type: 'collection',
    path: 'src/content/certifications',
    operations: operations.dynamic,
  },
];

const viewShapes = {
  projects: {
    fields: ['company', 'title', 'lang', 'order'],
    primary: 'company',
    sort: ['order'],
    default: { sort: 'order', order: 'asc' },
  },
  'side-projects': {
    fields: ['name', 'lang', 'order'],
    primary: 'name',
    sort: ['order'],
    default: { sort: 'order', order: 'asc' },
  },
  skills: {
    fields: ['category', 'lang', 'order'],
    primary: 'category',
    sort: ['order'],
    default: { sort: 'order', order: 'asc' },
  },
  education: {
    fields: ['school', 'lang', 'order'],
    primary: 'school',
    sort: ['order'],
    default: { sort: 'order', order: 'asc' },
  },
  certifications: {
    fields: ['name', 'lang', 'order'],
    primary: 'name',
    sort: ['order'],
    default: { sort: 'order', order: 'asc' },
  },
};

test('disables merging and uses action-specific app commits', async () => {
  const config = await loadConfig();

  assert.equal(config.settings?.content?.merge, false);
  assert.equal(config.settings?.commit?.identity, 'app');
  assert.deepEqual(config.settings?.commit?.templates, {
    create: 'content(create): {path}',
    update: 'content(update): {path}',
    delete: 'content(delete): {path}',
    rename: 'content(rename): {oldPath} -> {newPath}',
  });
});

test('defines only the validation and confirmed publishing actions', async () => {
  const config = await loadConfig();

  assert.equal(config.actions?.length, 2);
  assert.deepEqual(
    config.actions.map(({ name, label, workflow, ref }) => ({
      name,
      label,
      workflow,
      ref,
    })),
    [
      {
        name: 'validate-content',
        label: '콘텐츠 검사',
        workflow: 'content-check.yml',
        ref: 'current',
      },
      {
        name: 'request-publish',
        label: '게시 요청',
        workflow: 'content-publish.yml',
        ref: 'current',
      },
    ],
  );

  const publish = config.actions[1];
  assert.deepEqual(Object.keys(publish.confirm ?? {}).sort(), [
    'button',
    'message',
    'title',
  ]);
  for (const value of Object.values(publish.confirm)) {
    assert.equal(typeof value, 'string');
    assert.match(value, /[가-힣]/);
  }
});

test('defines the exact YAML content menu and safe operations', async () => {
  const config = await loadConfig();

  assert.equal(config.media, undefined);
  assert.equal(config.content?.length, contentTopology.length);
  assert.deepEqual(
    config.content.map(({ name, type, path, operations: entryOperations }) => ({
      name,
      type,
      path,
      operations: entryOperations,
    })),
    contentTopology,
  );

  for (const entry of config.content) {
    assert.equal(entry.format, 'yaml', `${entry.name} must use YAML`);
  }

  const entries = byName(config.content);
  for (const name of [
    'projects',
    'side-projects',
    'skills',
    'education',
    'certifications',
  ]) {
    assert.equal(entries[name].subfolders, false);
  }

  for (const name of [
    'projects',
    'side-projects',
    'skills',
    'certifications',
  ]) {
    assert.deepEqual(entries[name].filename, {
      template: '{primary}.{lang}.yaml',
      field: 'create',
    });
  }

  for (const name of ['about-ko', 'about-en', 'education']) {
    assert.equal(Object.hasOwn(entries[name], 'filename'), false);
  }
});

test('sets an explicit boolean collapsible on every object-form list', async () => {
  const config = await loadConfig();

  function assertListCompatibility(fields, parentPath) {
    for (const field of fields) {
      const path = `${parentPath}.${field.name}`;
      if (
        field.list &&
        typeof field.list === 'object' &&
        !Array.isArray(field.list)
      ) {
        assert.equal(
          typeof field.list.collapsible,
          'boolean',
          `${path}.list.collapsible must be an explicit boolean`,
        );
      }
      assertListCompatibility(field.fields ?? [], path);
    }
  }

  for (const entry of config.content) {
    assertListCompatibility(entry.fields, entry.name);
  }
});

test('uses sortable collection views with stable primary fields', async () => {
  const config = await loadConfig();
  const entries = byName(config.content);

  assert.deepEqual(
    Object.fromEntries(
      Object.keys(viewShapes).map((name) => [name, entries[name].view]),
    ),
    viewShapes,
  );
});

test('locks fixed language fields while dynamic languages remain editable', async () => {
  const config = await loadConfig();
  const entries = byName(config.content);

  for (const name of ['about-ko', 'about-en', 'education']) {
    const language = entries[name].fields.find((field) => field.name === 'lang');
    assert.equal(language.readonly, true, `${name}.lang must be readonly`);
  }

  for (const name of [
    'projects',
    'side-projects',
    'skills',
    'certifications',
  ]) {
    const language = entries[name].fields.find((field) => field.name === 'lang');
    assert.notEqual(language.readonly, true, `${name}.lang must be editable`);
  }
});

test('uses multiline editors only for the intentional text fields', async () => {
  const config = await loadConfig();
  const entries = byName(config.content);

  function textPaths(fields, prefix = '') {
    return fields.flatMap((field) => {
      const path = prefix ? `${prefix}.${field.name}` : field.name;
      return [
        ...(field.type === 'text' ? [path] : []),
        ...(field.type === 'object' ? textPaths(field.fields ?? [], path) : []),
      ];
    });
  }

  for (const [entryName, collectionName] of Object.entries(entrySchemaMap)) {
    assert.deepEqual(
      textPaths(entries[entryName].fields),
      textEditorExceptions[collectionName] ?? [],
      `${entryName} must use only its intentional multiline editors`,
    );
  }

  for (const entry of config.content) {
    const fields = entry.fields.flatMap(function flatten(field) {
      return [field, ...(field.fields ?? []).flatMap(flatten)];
    });
    assert.equal(
      fields.some((field) => ['image', 'file'].includes(field.type)),
      false,
      `${entry.name} must not expose uploads`,
    );
  }
});

test('structurally matches Pages CMS fields to the real Astro schemas', async () => {
  const [config, schemaSource] = await Promise.all([
    loadConfig(),
    readFile(schemaPath, 'utf8'),
  ]);
  const schemas = extractCollectionSchemas(schemaSource, schemaPath);

  assert.deepEqual(Object.keys(schemas), [
    'projects',
    'sideProjects',
    'about',
    'education',
    'certifications',
    'skills',
  ]);
  assert.doesNotThrow(() =>
    assertPagesSchemaParity({
      schemas,
      entries: config.content,
      entrySchemaMap,
      textEditorExceptions,
    }),
  );
});

test('schema extraction observes field, type, and optionality mutations', async (t) => {
  const [config, schemaSource] = await Promise.all([
    loadConfig(),
    readFile(schemaPath, 'utf8'),
  ]);
  const baseline = extractCollectionSchemas(schemaSource, schemaPath);
  const mutations = [
    {
      name: 'field name',
      replacement: 'issuedAt: z.string().optional()',
    },
    {
      name: 'base type',
      replacement: 'date: z.number().optional()',
    },
    {
      name: 'optional wrapper',
      replacement: 'date: z.string()',
    },
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, () => {
      const mutatedSource = schemaSource.replace(
        'date: z.string().optional()',
        mutation.replacement,
      );
      assert.notEqual(mutatedSource, schemaSource, 'mutation fixture must apply');

      const mutated = extractCollectionSchemas(mutatedSource, schemaPath);
      assert.notDeepEqual(mutated.certifications, baseline.certifications);
      assert.throws(
        () =>
          assertPagesSchemaParity({
            schemas: mutated,
            entries: config.content,
            entrySchemaMap,
            textEditorExceptions,
          }),
        /certifications/,
      );
    });
  }
});
