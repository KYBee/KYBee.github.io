import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

export const COLLECTIONS = [
  'about',
  'projects',
  'sideProjects',
  'skills',
  'education',
  'certifications',
];

const LANGUAGES = ['ko', 'en'];
const DYNAMIC_FILENAME =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(ko|en)\.yaml$/;
const ABOUT_FILENAME = /^(ko|en)\.yaml$/;

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function hasOrder(entry) {
  return (
    entry.data !== null &&
    typeof entry.data === 'object' &&
    Object.hasOwn(entry.data, 'order')
  );
}

function formatValue(value) {
  if (value === undefined) return 'missing';
  const seen = new WeakSet();

  try {
    const serialized = JSON.stringify(value, (_key, nestedValue) => {
      if (nestedValue !== null && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) return '[Circular]';
        seen.add(nestedValue);
      }
      return nestedValue;
    });
    return serialized ?? String(value);
  } catch {
    return '[unserializable value]';
  }
}

function formatPathList(paths, fallback) {
  const sortedPaths = [...new Set(paths)].sort(compareStrings);
  return sortedPaths.length > 0 ? sortedPaths.join(', ') : fallback;
}

function sameValues(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

function compareOrders(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return compareStrings(formatValue(left), formatValue(right));
}

function projectGroupKey(entry) {
  const data =
    entry.data !== null && typeof entry.data === 'object' ? entry.data : {};
  return formatValue([data.company, data.role, data.period]);
}

function projectGroupBoundaries(entries) {
  const boundaries = [];
  for (let index = 1; index < entries.length; index += 1) {
    if (projectGroupKey(entries[index - 1]) !== projectGroupKey(entries[index])) {
      boundaries.push(index);
    }
  }
  return boundaries;
}

async function readCollection(contentRoot, collection, errors) {
  const collectionRoot = join(contentRoot, collection);
  let dirents;

  try {
    dirents = await readdir(collectionRoot, { withFileTypes: true });
  } catch {
    errors.push(
      `[${collection}] ${collection}: collection directory must exist and be readable`,
    );
    return { available: false, entries: [], observedPaths: [] };
  }

  dirents.sort((left, right) => compareStrings(left.name, right.name));

  const entries = [];
  const observedPaths = [];

  for (const dirent of dirents) {
    const relativePath = `${collection}/${dirent.name}`;
    observedPaths.push(relativePath);

    if (dirent.isDirectory()) {
      errors.push(
        `[${collection}] ${relativePath}: collection entries must be regular .yaml files; subdirectories are not supported`,
      );
      continue;
    }

    if (!dirent.isFile()) {
      errors.push(
        `[${collection}] ${relativePath}: collection entry must be a regular .yaml file`,
      );
      continue;
    }

    if (!dirent.name.endsWith('.yaml')) {
      errors.push(
        `[${collection}] ${relativePath}: collection entry must be a regular .yaml file`,
      );
      continue;
    }

    let identifier;
    let lang;

    if (collection === 'about') {
      const match = ABOUT_FILENAME.exec(dirent.name);
      if (!match) {
        errors.push(
          `[about] ${relativePath}: about must contain exactly ko.yaml and en.yaml`,
        );
        continue;
      }
      [, lang] = match;
      identifier = 'about';
    } else {
      const match = DYNAMIC_FILENAME.exec(dirent.name);
      if (!match) {
        errors.push(
          `[${collection}] ${relativePath}: filename identifier must use lowercase ASCII letters, digits, and single hyphens, followed by .ko.yaml or .en.yaml`,
        );
        continue;
      }
      [, identifier, lang] = match;
    }

    const entry = {
      collection,
      identifier,
      lang,
      relativePath,
      data: undefined,
      parsed: false,
    };
    entries.push(entry);

    let source;
    try {
      source = await readFile(join(contentRoot, relativePath), 'utf8');
    } catch {
      errors.push(
        `[${collection}] ${relativePath}: file must be readable as UTF-8 text`,
      );
      continue;
    }

    try {
      entry.data = parse(source);
      entry.parsed = true;
    } catch {
      errors.push(
        `[${collection}] ${relativePath}: file must contain parseable YAML`,
      );
    }
  }

  return { available: true, entries, observedPaths };
}

function validateAbout(collectionState, errors) {
  if (!collectionState.available) return;

  const observedNames = collectionState.observedPaths.map((relativePath) =>
    relativePath.slice('about/'.length),
  );
  if (
    observedNames.length !== 2 ||
    observedNames[0] !== 'en.yaml' ||
    observedNames[1] !== 'ko.yaml'
  ) {
    errors.push(
      `[about] ${formatPathList(collectionState.observedPaths, 'about')}: about must contain exactly ko.yaml and en.yaml`,
    );
  }
}

function groupByIdentifier(entries) {
  const pairs = new Map();

  for (const entry of entries) {
    let pair = pairs.get(entry.identifier);
    if (!pair) {
      pair = {};
      pairs.set(entry.identifier, pair);
    }
    pair[entry.lang] = entry;
  }

  return pairs;
}

function validatePairs(collection, entries, errors) {
  const pairs = groupByIdentifier(entries);

  for (const identifier of [...pairs.keys()].sort(compareStrings)) {
    const pair = pairs.get(identifier);

    for (const lang of LANGUAGES) {
      const entry = pair[lang];
      if (!entry) continue;

      const oppositeLang = lang === 'ko' ? 'en' : 'ko';
      if (!pair[oppositeLang]) {
        const expectedPath =
          collection === 'about'
            ? `${collection}/${oppositeLang}.yaml`
            : `${collection}/${identifier}.${oppositeLang}.yaml`;
        errors.push(
          `[${collection}] ${entry.relativePath}: opposite-language pair must exist at ${expectedPath}`,
        );
      }
    }

    if (!pair.ko || !pair.en) continue;

    const koHasOrder = hasOrder(pair.ko);
    const enHasOrder = hasOrder(pair.en);
    if (
      (koHasOrder || enHasOrder) &&
      (!koHasOrder ||
        !enHasOrder ||
        !Object.is(pair.ko.data.order, pair.en.data.order))
    ) {
      errors.push(
        `[${collection}] ${formatPathList(
          [pair.ko.relativePath, pair.en.relativePath],
          collection,
        )}: paired order values must match; en=${formatValue(
          enHasOrder ? pair.en.data.order : undefined,
        )}, ko=${formatValue(koHasOrder ? pair.ko.data.order : undefined)}`,
      );
    }
  }

  return pairs;
}

function validateLangSuffixes(collection, entries, errors) {
  for (const entry of entries) {
    if (!entry.parsed) continue;

    const parsedLang =
      entry.data !== null && typeof entry.data === 'object'
        ? entry.data.lang
        : undefined;
    if (parsedLang !== entry.lang) {
      errors.push(
        `[${collection}] ${entry.relativePath}: filename suffix "${entry.lang}" must match parsed YAML lang ${formatValue(parsedLang)}`,
      );
    }
  }
}

function validateUniqueOrders(collection, entries, errors) {
  for (const lang of LANGUAGES) {
    const pathsByOrder = new Map();

    for (const entry of entries) {
      if (entry.lang !== lang || !hasOrder(entry)) continue;
      const order = entry.data.order;
      const matchingEntries = pathsByOrder.get(order) ?? [];
      matchingEntries.push(entry.relativePath);
      pathsByOrder.set(order, matchingEntries);
    }

    for (const [order, paths] of pathsByOrder) {
      if (paths.length < 2) continue;
      errors.push(
        `[${collection}] ${formatPathList(paths, collection)}: order ${formatValue(order)} must be unique within language "${lang}"`,
      );
    }
  }
}

function validateEducation(collectionState, pairs, errors) {
  if (!collectionState.available) return;

  const completePairCount = [...pairs.values()].filter(
    (pair) => pair.ko && pair.en,
  ).length;
  if (pairs.size !== 1 || completePairCount !== 1) {
    errors.push(
      `[education] ${formatPathList(
        collectionState.entries.map((entry) => entry.relativePath),
        'education',
      )}: education must contain exactly one bilingual identifier pair; found ${completePairCount}`,
    );
  }
}

function validateProjects(entries, errors) {
  const orderedByLanguage = Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      entries
        .filter((entry) => entry.lang === lang && hasOrder(entry))
        .sort(
          (left, right) =>
            compareOrders(left.data.order, right.data.order) ||
            compareStrings(left.relativePath, right.relativePath),
        ),
    ]),
  );

  const koOrders = orderedByLanguage.ko.map((entry) => entry.data.order);
  const enOrders = orderedByLanguage.en.map((entry) => entry.data.order);
  const projectPaths = formatPathList(
    entries.map((entry) => entry.relativePath),
    'projects',
  );

  if (!sameValues(koOrders, enOrders)) {
    errors.push(
      `[projects] ${projectPaths}: sorted KO/EN order arrays must match; ko=${formatValue(koOrders)}, en=${formatValue(enOrders)}`,
    );
    return;
  }

  const projectCounts = Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      entries.filter((entry) => entry.lang === lang).length,
    ]),
  );
  if (
    orderedByLanguage.ko.length !== projectCounts.ko ||
    orderedByLanguage.en.length !== projectCounts.en
  ) {
    return;
  }

  const koBoundaries = projectGroupBoundaries(orderedByLanguage.ko);
  const enBoundaries = projectGroupBoundaries(orderedByLanguage.en);
  if (!sameValues(koBoundaries, enBoundaries)) {
    errors.push(
      `[projects] ${projectPaths}: adjacent group boundary indices must match; ko=${formatValue(koBoundaries)}, en=${formatValue(enBoundaries)}`,
    );
  }

  const koFirstGroupSize = koBoundaries[0] ?? orderedByLanguage.ko.length;
  const enFirstGroupSize = enBoundaries[0] ?? orderedByLanguage.en.length;
  if (koFirstGroupSize !== enFirstGroupSize) {
    errors.push(
      `[projects] ${projectPaths}: first project group sizes must match; ko=${koFirstGroupSize}, en=${enFirstGroupSize}`,
    );
  }
}

export async function validateContentRoot(contentRoot) {
  const errors = [];
  const collectionStates = new Map();

  for (const collection of COLLECTIONS) {
    collectionStates.set(
      collection,
      await readCollection(contentRoot, collection, errors),
    );
  }

  validateAbout(collectionStates.get('about'), errors);

  for (const collection of COLLECTIONS) {
    const collectionState = collectionStates.get(collection);
    const { entries } = collectionState;

    validateLangSuffixes(collection, entries, errors);
    const pairs = validatePairs(collection, entries, errors);
    validateUniqueOrders(collection, entries, errors);

    if (collection === 'education') {
      validateEducation(collectionState, pairs, errors);
    }
    if (collection === 'projects') {
      validateProjects(entries, errors);
    }
  }

  return errors.sort(compareStrings);
}
