import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

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
  if (!first) return [];

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

test('current work grouping returns no entries for an empty language', () => {
  assert.deepEqual(currentWorkEntriesForLanguage([], 'ko'), []);
});

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseQuotedAttributes(tag) {
  const attributes = {};
  const attributePattern =
    /([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*(["'])([\s\S]*?)\2/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[3];
  }

  return attributes;
}

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

function findXmlConstructEnd(source, start, terminator, label) {
  const end = source.indexOf(terminator, start);
  assert.notEqual(end, -1, `Expected a closed XML ${label}`);
  return end + terminator.length;
}

function readXmlTag(source, start) {
  let quote;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '<') {
      assert.fail(`Malformed XML tag at offset ${start}`);
    } else if (character === '>') {
      return {
        end: index + 1,
        source: source.slice(start, index + 1),
      };
    }
  }

  assert.fail(`Unclosed XML tag at offset ${start}`);
}

function assertValidXmlEntities(value, label) {
  assert.doesNotMatch(
    value,
    /&(?!(?:amp|lt|gt|apos|quot);|#\d+;|#x[0-9A-Fa-f]+;)/,
    `Malformed XML entity in ${label}`,
  );
}

function parseXmlAttributes(tag) {
  const attributes = [];
  const names = new Set();
  const attributePattern =
    /([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*(["'])([\s\S]*?)\2/g;

  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1];
    assert.equal(
      names.has(name),
      false,
      `Expected no duplicate XML attribute ${name}`,
    );
    names.add(name);
    assertValidXmlEntities(match[3], `attribute ${name}`);
    attributes.push({ name, value: match[3] });
  }

  return attributes;
}

function getXmlAttribute(element, name) {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

function parseXmlStartElements(source) {
  const elements = [];
  const openElements = [];
  let cursor = 0;
  let hasRoot = false;

  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);
    const textEnd = tagStart === -1 ? source.length : tagStart;
    const characterData = source.slice(cursor, textEnd);
    if (openElements.length === 0) {
      assert.equal(
        characterData.trim(),
        '',
        'Expected no text outside the XML root',
      );
    } else {
      assertValidXmlEntities(characterData, 'character data');
    }
    if (tagStart === -1) break;

    if (source.startsWith('<!--', tagStart)) {
      cursor = findXmlConstructEnd(source, tagStart + 4, '-->', 'comment');
      continue;
    }
    if (source.startsWith('<![CDATA[', tagStart)) {
      assert.ok(openElements.length > 0, 'Expected CDATA inside the XML root');
      cursor = findXmlConstructEnd(source, tagStart + 9, ']]>', 'CDATA');
      continue;
    }
    if (source.startsWith('<?', tagStart)) {
      cursor = findXmlConstructEnd(
        source,
        tagStart + 2,
        '?>',
        'processing instruction',
      );
      continue;
    }
    assert.ok(
      !source.startsWith('<!', tagStart),
      'Expected no unsupported XML declaration',
    );

    const tag = readXmlTag(source, tagStart);
    if (tag.source.startsWith('</')) {
      const closingMatch =
        /^<\/([A-Za-z_][A-Za-z0-9:._-]*)\s*>$/.exec(tag.source);
      assert.ok(closingMatch, 'Expected a valid XML closing element');
      const openingName = openElements.pop();
      assert.notEqual(
        openingName,
        undefined,
        `Unexpected XML closing element </${closingMatch[1]}>`,
      );
      assert.equal(
        closingMatch[1],
        openingName,
        `Mismatched XML closing element </${closingMatch[1]}> for <${openingName}>`,
      );
    } else {
      if (openElements.length === 0) {
        assert.equal(hasRoot, false, 'Expected exactly one XML root element');
        hasRoot = true;
      }

      const openingMatch =
        /^<([A-Za-z_][A-Za-z0-9:._-]*)(?=[\s/>])(?:\s+[A-Za-z_:][A-Za-z0-9:._-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*(\/?)>$/.exec(
          tag.source,
        );
      assert.ok(openingMatch, 'Expected a valid XML start element');
      const qualifiedName = openingMatch[1];
      const element = {
        attributes: parseXmlAttributes(tag.source),
        name: qualifiedName.toLowerCase().split(':').at(-1),
        qualifiedName,
      };
      elements.push(element);
      if (!openingMatch[2]) openElements.push(qualifiedName);
    }
    cursor = tag.end;
  }

  assert.equal(hasRoot, true, 'Expected an XML root element');
  assert.equal(
    openElements.length,
    0,
    `Unclosed XML element <${openElements.at(-1)}>`,
  );
  return elements;
}

function assertInternalSvgReferences(elements) {
  for (const element of elements) {
    for (const { name, value } of element.attributes) {
      if (name.split(':').at(-1).toLowerCase() === 'href') {
        assert.match(
          value.trim(),
          /^#[^\s]+$/,
          `Expected ${name} to reference only content inside the SVG`,
        );
      }
    }
  }
}

function sanitizeMetadataMarkup(html) {
  return html.replace(
    /<!--[\s\S]*?-->|(<(script|style)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?<\/\2\s*>/gi,
    (_match, openingTag) => openingTag ?? '',
  );
}

function extractMetadataHead(html) {
  const sanitizedHtml = sanitizeMetadataMarkup(html);
  const headTags = findTags(sanitizedHtml, 'head');
  const openingHead = headTags[0];

  assert.ok(openingHead, 'Expected document to contain a <head> tag');

  const closingHeadPattern = /<\/head\s*>/gi;
  closingHeadPattern.lastIndex = openingHead.end;
  const closingHead = closingHeadPattern.exec(sanitizedHtml);

  assert.ok(closingHead, 'Expected document to contain a closing </head> tag');
  return sanitizedHtml.slice(openingHead.end, closingHead.index);
}

function readElementText(html, openingTag, tagName) {
  const closingTagPattern = new RegExp(
    `</${escapeRegExp(tagName)}\\s*>`,
    'gi',
  );
  closingTagPattern.lastIndex = openingTag.end;
  const closingTag = closingTagPattern.exec(html);

  assert.ok(closingTag, `Expected ${openingTag.source} to have a closing tag`);
  return html.slice(openingTag.end, closingTag.index).trim();
}

function hasRel(tag, expectedRel) {
  return (tag.attributes.rel ?? '')
    .toLowerCase()
    .split(/\s+/)
    .includes(expectedRel);
}

function hasMetaName(tag, expectedName) {
  return tag.attributes.name?.toLowerCase() === expectedName.toLowerCase();
}

function hasJsonLdMimeType(tag) {
  const mimeType = (tag.attributes.type ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  return mimeType === 'application/ld+json';
}

function hasForbiddenRobotsDirective(tag) {
  if (!hasMetaName(tag, 'robots')) return false;

  const directives = (tag.attributes.content ?? '')
    .toLowerCase()
    .split(/[\s,]+/);
  return directives.some(
    (directive) => directive === 'noindex' || directive === 'none',
  );
}

function assertSingleTag(tags, predicate, label) {
  const matches = tags.filter(predicate);
  assert.equal(matches.length, 1, `Expected exactly one ${label}`);
  return matches[0];
}

function assertExactMetaSet(
  metaTags,
  keyAttribute,
  prefix,
  expectedEntries,
  label,
  pagePath,
) {
  const location = pagePath ? ` in ${pagePath}` : '';
  const matchingTags = metaTags.filter((tag) =>
    (tag.attributes[keyAttribute] ?? '').startsWith(prefix),
  );

  assert.equal(
    matchingTags.length,
    Object.keys(expectedEntries).length,
    `Expected the exact ${label} metadata set${location}`,
  );

  for (const [key, expectedContent] of Object.entries(expectedEntries)) {
    const tag = assertSingleTag(
      matchingTags,
      (candidate) => candidate.attributes[keyAttribute] === key,
      `${label} tag for ${key}${location}`,
    );
    assert.equal(
      tag.attributes.content,
      expectedContent,
      `Expected ${label} ${key} content${location}`,
    );
  }
}

const metadataCases = [
  {
    path: 'dist/index.html',
    title: '김영빈 | Backend Engineer',
    description:
      '로그를 품질 지표로, 반복 운영을 자동화로 바꾸는 백엔드 엔지니어',
    canonical: 'https://kybee.github.io/',
    locale: 'ko_KR',
    alternateLocale: 'en_US',
  },
  {
    path: 'dist/en/index.html',
    title: 'Youngbeen Kim | Backend Engineer',
    description:
      'A backend engineer who turns logs into quality metrics and repetitive operations into automation',
    canonical: 'https://kybee.github.io/en/',
    locale: 'en_US',
    alternateLocale: 'ko_KR',
  },
];

const alternateLanguages = {
  ko: 'https://kybee.github.io/',
  en: 'https://kybee.github.io/en/',
  'x-default': 'https://kybee.github.io/',
};

const fontLinkCases = ['dist/index.html', 'dist/en/index.html'];
const jsDelivrOrigin = 'https://cdn.jsdelivr.net';
const pretendardVariableStylesheet =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
const oldPretendardStylesheet =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css';

test('standard meta names are matched case-insensitively', () => {
  for (const expectedName of ['description', 'keywords', 'robots']) {
    const capitalizedName =
      expectedName[0].toUpperCase() + expectedName.slice(1);
    const metaTags = findTags(
      `<meta name="${expectedName}"><meta name="${capitalizedName}">`,
      'meta',
    );

    assert.equal(
      metaTags.filter((tag) => hasMetaName(tag, expectedName)).length,
      2,
    );
  }
});

test('JSON-LD MIME type matching ignores parameters', () => {
  const scriptTags = findTags(
    [
      '<script type="application/ld+json"></script>',
      '<script type="application/ld+json;profile=https://schema.org"></script>',
      '<script type=" Application/LD+JSON ; charset=utf-8 "></script>',
    ].join(''),
    'script',
  );

  assert.equal(scriptTags.filter(hasJsonLdMimeType).length, 3);
});

test('metadata scanning ignores markup outside the sanitized head', () => {
  const html = [
    '<!-- <head><meta name="description" content="comment"><script type="application/ld+json;profile=comment"></script></head> -->',
    '<html><head>',
    '<meta name="description" content="real-head">',
    '<script>const fake = \'<meta name="description" content="script">\'; const fakeJsonLd = \'<script type="application/ld+json;profile=script">\'; const close = \'</head>\';</script>',
    '<style>.fake::before { content: \'<meta name="description" content="style">\'; }</style>',
    '<script type="application/ld+json;profile=https://schema.org">{}</script>',
    '</head><body>',
    '<meta name="description" content="body">',
    '<script type="application/ld+json;profile=body">{}</script>',
    '</body></html>',
  ].join('');
  const metadataHead = extractMetadataHead(html);
  const sanitizedMarkup = sanitizeMetadataMarkup(html);
  const metaTags = findTags(metadataHead, 'meta');
  const headScriptTags = findTags(metadataHead, 'script');
  const documentScriptTags = findTags(sanitizedMarkup, 'script');

  assert.deepEqual(
    metaTags.map((tag) => tag.attributes.content),
    ['real-head'],
  );
  assert.equal(headScriptTags.filter(hasJsonLdMimeType).length, 1);
  assert.equal(documentScriptTags.filter(hasJsonLdMimeType).length, 2);
});

test('robots directives reject noindex semantics by token', () => {
  const cases = [
    ['noindex', true],
    ['INDEX, NOINDEX, FOLLOW', true],
    ['none', true],
    ['NoNe, follow', true],
    ['index,follow', false],
    ['noindexing,follow', false],
  ];

  for (const [content, expected] of cases) {
    const [robotsTag] = findTags(
      `<meta name="RoBoTs" content="${content}">`,
      'meta',
    );

    assert.equal(
      hasForbiddenRobotsDirective(robotsTag),
      expected,
      `Unexpected robots semantics for ${content}`,
    );
  }

  const [descriptionTag] = findTags(
    '<meta name="description" content="noindex">',
    'meta',
  );
  assert.equal(hasForbiddenRobotsDirective(descriptionTag), false);
});

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

test('dist CSS spaces adjacent job groups with the compact token', async () => {
  const cssFiles = (await readdir('dist/_astro'))
    .filter((fileName) => fileName.endsWith('.css'))
    .sort();

  assert.ok(cssFiles.length > 0, 'Expected CSS files in dist/_astro');
  const combinedCss = (
    await Promise.all(
      cssFiles.map((fileName) =>
        readFile(`dist/_astro/${fileName}`, 'utf8'),
      ),
    )
  ).join('\n');

  assert.match(
    combinedCss,
    /(?:^|})\.job-group(\[data-astro-cid-[a-z0-9]+\])\s*\+\s*\.job-group\1\s*\{[^}]*margin-top\s*:\s*var\(--space-5\)/,
    'Expected adjacent job groups to use the 24px spacing token',
  );
});

for (const page of fontLinkCases) {
  test(`${page} defines the Pretendard Variable font-link contract`, async () => {
    const html = await readFile(page, 'utf8');
    const metadataHead = extractMetadataHead(html);
    const linkTags = findTags(metadataHead, 'link');
    const stylesheetLinks = linkTags.filter((tag) =>
      hasRel(tag, 'stylesheet'),
    );

    assert.equal(
      linkTags.filter(
        (tag) => tag.attributes.href === oldPretendardStylesheet,
      ).length,
      0,
      `Expected no old Pretendard link in ${page}`,
    );
    assertSingleTag(
      stylesheetLinks,
      (tag) => tag.attributes.href === pretendardVariableStylesheet,
      `Pretendard Variable stylesheet link in ${page}`,
    );
    assertSingleTag(
      linkTags,
      (tag) =>
        tag.attributes.href === jsDelivrOrigin && hasRel(tag, 'preconnect'),
      `jsDelivr preconnect link in ${page}`,
    );
  });
}

test('dist CSS defines the Pretendard Variable font-sans contract', async () => {
  const cssFiles = (await readdir('dist/_astro'))
    .filter((fileName) => fileName.endsWith('.css'))
    .sort();

  assert.ok(cssFiles.length > 0, 'Expected CSS files in dist/_astro');
  const combinedCss = (
    await Promise.all(
      cssFiles.map((fileName) =>
        readFile(`dist/_astro/${fileName}`, 'utf8'),
      ),
    )
  ).join('\n');

  assert.match(
    combinedCss,
    /--font-sans\s*:\s*(?:(["'])Pretendard Variable\1|Pretendard Variable)\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*system-ui\s*,\s*sans-serif\s*(?=;|})/,
    'Expected --font-sans to use the exact Pretendard Variable system stack',
  );
  assert.doesNotMatch(
    combinedCss,
    /--font-sans\s*:\s*(?:(["'])Pretendard\1|Pretendard)\s*,/,
    'Expected --font-sans not to use standalone Pretendard first',
  );
});

for (const page of metadataCases) {
  test(`${page.path} defines the portfolio metadata contract`, async () => {
    const html = await readFile(page.path, 'utf8');
    const sanitizedMarkup = sanitizeMetadataMarkup(html);
    const metadataHead = extractMetadataHead(html);
    const documentMetaTags = findTags(sanitizedMarkup, 'meta');
    const documentScriptTags = findTags(sanitizedMarkup, 'script');
    const linkTags = findTags(metadataHead, 'link');
    const metaTags = findTags(metadataHead, 'meta');
    const titleTags = findTags(metadataHead, 'title');

    const titleTag = assertSingleTag(
      titleTags,
      () => true,
      `title tag in ${page.path}`,
    );
    assert.equal(readElementText(metadataHead, titleTag, 'title'), page.title);

    const descriptionTag = assertSingleTag(
      metaTags,
      (tag) => hasMetaName(tag, 'description'),
      `description tag in ${page.path}`,
    );
    assert.equal(descriptionTag.attributes.content, page.description);

    const canonicalTag = assertSingleTag(
      linkTags,
      (tag) => hasRel(tag, 'canonical'),
      `canonical link in ${page.path}`,
    );
    assert.equal(canonicalTag.attributes.href, page.canonical);

    const languageLinks = linkTags.filter(
      (tag) => hasRel(tag, 'alternate') && tag.attributes.hreflang,
    );
    assert.equal(
      languageLinks.length,
      Object.keys(alternateLanguages).length,
      `Expected the exact alternate-language link set in ${page.path}`,
    );

    for (const [hreflang, href] of Object.entries(alternateLanguages)) {
      const languageLink = assertSingleTag(
        languageLinks,
        (tag) => tag.attributes.hreflang === hreflang,
        `${hreflang} alternate link in ${page.path}`,
      );
      assert.equal(languageLink.attributes.href, href);
    }

    const image = 'https://kybee.github.io/og/portfolio.png';
    assertExactMetaSet(
      metaTags,
      'property',
      'og:',
      {
        'og:type': 'website',
        'og:title': page.title,
        'og:description': page.description,
        'og:url': page.canonical,
        'og:locale': page.locale,
        'og:locale:alternate': page.alternateLocale,
        'og:site_name': 'Youngbeen Kim',
        'og:image': image,
      },
      'Open Graph',
      page.path,
    );
    assertExactMetaSet(
      metaTags,
      'name',
      'twitter:',
      {
        'twitter:card': 'summary_large_image',
        'twitter:title': page.title,
        'twitter:description': page.description,
        'twitter:image': image,
      },
      'Twitter',
      page.path,
    );

    const faviconTag = assertSingleTag(
      linkTags,
      (tag) => hasRel(tag, 'icon'),
      `favicon link in ${page.path}`,
    );
    assert.equal(faviconTag.attributes.type, 'image/svg+xml');
    assert.equal(faviconTag.attributes.href, '/favicon.svg');

    assert.equal(
      documentScriptTags.filter(hasJsonLdMimeType).length,
      0,
      `Expected no JSON-LD in ${page.path}`,
    );
    assert.equal(
      documentMetaTags.filter((tag) => hasMetaName(tag, 'keywords')).length,
      0,
      `Expected no meta keywords in ${page.path}`,
    );
    assert.equal(
      documentMetaTags.filter(hasForbiddenRobotsDirective).length,
      0,
      `Expected no noindex robots directive in ${page.path}`,
    );
  });
}

function assertSvgHelperRegressions() {
  assert.throws(
    () => parseXmlStartElements('<svg><path></svg>'),
    /Mismatched XML closing element/,
  );
  assert.throws(
    () => parseXmlStartElements('<svg><path></path>'),
    /Unclosed XML element/,
  );
  const elements = parseXmlStartElements(
    [
      '<svg>',
      '<!-- <path d="comment" /> -->',
      '<![CDATA[<path d="cdata" />]]>',
      '<?icon <path d="processing-instruction" />?>',
      '</svg>',
    ].join(''),
  );

  assert.deepEqual(
    elements.map((element) => element.name),
    ['svg'],
  );
  const externallyReferencedElements = parseXmlStartElements(
    [
      '<svg xmlns:r="http://www.w3.org/1999/xlink">',
      '<path r:href="https://example.com/icon.svg#mark" />',
      '</svg>',
    ].join(''),
  );

  assert.throws(
    () => assertInternalSvgReferences(externallyReferencedElements),
    /Expected r:href to reference only content inside the SVG/,
  );
  assert.throws(
    () => parseXmlStartElements('<svg><path />&</svg>'),
    /Malformed XML entity/,
  );
  assert.throws(
    () => parseXmlStartElements('<svg aria-label="A & B"><path /></svg>'),
    /Malformed XML entity/,
  );
  const caseVariantHrefElements = parseXmlStartElements(
    [
      '<svg>',
      '<use href="https://example.com/icon.svg#mark" HREF="#local" />',
      '</svg>',
    ].join(''),
  );

  assert.throws(
    () => assertInternalSvgReferences(caseVariantHrefElements),
    /Expected href to reference only content inside the SVG/,
  );
}

test('dist/favicon.svg is a safe, square, path-based SVG favicon', async () => {
  assertSvgHelperRegressions();
  const source = await readFile('dist/favicon.svg', 'utf8');
  const elements = parseXmlStartElements(source);
  const root = elements[0];

  assert.ok(root, 'Expected favicon source to contain an SVG element');
  assert.equal(root.name, 'svg', 'Expected favicon source root to be <svg>');
  assert.ok(
    elements.some((element) => element.name === 'path'),
    'Expected favicon SVG to contain at least one <path>',
  );

  const numberPattern =
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const viewBox = getXmlAttribute(root, 'viewBox');

  assert.notEqual(viewBox, undefined, 'Expected SVG to define a viewBox');
  const viewBoxValues = viewBox.trim().split(/[\s,]+/);
  assert.equal(viewBoxValues.length, 4, 'Expected four viewBox numbers');
  assert.ok(
    viewBoxValues.every((value) => numberPattern.test(value)),
    'Expected viewBox values to be numeric',
  );

  const [, , viewBoxWidth, viewBoxHeight] = viewBoxValues.map(Number);
  assert.ok(viewBoxWidth > 0, 'Expected a positive viewBox size');
  assert.equal(
    viewBoxWidth,
    viewBoxHeight,
    'Expected a square SVG viewBox',
  );

  const width = getXmlAttribute(root, 'width');
  const height = getXmlAttribute(root, 'height');
  assert.equal(
    width === undefined,
    height === undefined,
    'Expected SVG width and height to either both be present or both be omitted',
  );
  if (width !== undefined) {
    assert.match(width, numberPattern, 'Expected SVG width to be numeric');
    assert.match(height, numberPattern, 'Expected SVG height to be numeric');
    assert.equal(Number(width), Number(height), 'Expected a square SVG size');
    assert.ok(Number(width) >= 48, 'Expected SVG size to be at least 48');
  }

  const forbiddenElements = new Set([
    'animation',
    'discard',
    'image',
    'mpath',
    'script',
    'set',
    'text',
  ]);
  for (const element of elements) {
    assert.ok(
      !forbiddenElements.has(element.name) &&
        !element.name.startsWith('animate'),
      `Expected no <${element.name}> element in favicon SVG`,
    );

    for (const { name } of element.attributes) {
      assert.doesNotMatch(
        name,
        /^on[a-z]/i,
        `Expected no inline event handler attribute ${name}`,
      );
    }
  }
  assertInternalSvgReferences(elements);
});

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function makePngChunk(type, data = Buffer.alloc(0)) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  return chunk;
}

function makePngFixture({ colorType = 2, colorChunks = [] } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  return Buffer.concat([
    pngSignature,
    makePngChunk('IHDR', ihdr),
    ...colorChunks,
    makePngChunk('IEND'),
  ]);
}

function readPngChunks(png) {
  assert.deepEqual(
    png.subarray(0, pngSignature.length),
    pngSignature,
    'Expected the PNG file signature',
  );

  const chunks = [];
  let offset = pngSignature.length;

  while (offset < png.length) {
    assert.ok(
      offset + 8 <= png.length,
      'Expected a complete PNG chunk header',
    );
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + length + 4;

    assert.match(type, /^[A-Za-z]{4}$/, 'Expected a valid PNG chunk type');
    assert.ok(
      chunkEnd <= png.length,
      `Expected a complete PNG chunk for ${type}`,
    );
    chunks.push({
      data: png.subarray(dataStart, dataStart + length),
      length,
      type,
    });
    offset = chunkEnd;

    if (type === 'IEND') {
      assert.equal(length, 0, 'Expected an empty IEND payload');
      assert.equal(offset, png.length, 'Expected IEND to be the final chunk');
      return chunks;
    }
  }

  assert.fail('Expected a PNG IEND chunk');
}

function hasSrgbIccProfile(chunk) {
  if (chunk.type !== 'iCCP') return false;

  const nameEnd = chunk.data.indexOf(0);
  return (
    nameEnd > 0 &&
    nameEnd <= 79 &&
    chunk.data.length > nameEnd + 2 &&
    chunk.data[nameEnd + 1] === 0 &&
    /srgb/i.test(chunk.data.toString('latin1', 0, nameEnd))
  );
}

function assertPngColorContract(png) {
  const chunks = readPngChunks(png);
  const ihdr = chunks[0];

  assert.equal(ihdr?.type, 'IHDR', 'Expected IHDR to be the first PNG chunk');
  assert.equal(ihdr.length, 13, 'Expected a 13-byte IHDR payload');
  assert.equal(ihdr.data[8], 8, 'Expected an 8-bit PNG');
  assert.equal(ihdr.data[9], 2, 'Expected PNG color type 2 without alpha');
  assert.equal(ihdr.data[10], 0, 'Expected standard PNG compression');
  assert.equal(ihdr.data[11], 0, 'Expected standard PNG filtering');
  assert.equal(ihdr.data[12], 0, 'Expected a non-interlaced PNG');
  assert.equal(
    chunks.some((chunk) => chunk.type === 'tRNS'),
    false,
    'Expected PNG without a tRNS transparency chunk',
  );

  const hasSrgbChunk = chunks.some(
    (chunk) =>
      chunk.type === 'sRGB' &&
      chunk.data.length === 1 &&
      chunk.data[0] <= 3,
  );
  const hasGamma = chunks.some(
    (chunk) =>
      chunk.type === 'gAMA' &&
      chunk.data.length === 4 &&
      chunk.data.readUInt32BE(0) === 45455,
  );
  const srgbChromaticities = [
    31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000,
  ];
  const hasChromaticities = chunks.some(
    (chunk) =>
      chunk.type === 'cHRM' &&
      chunk.data.length === 32 &&
      srgbChromaticities.every(
        (value, index) => chunk.data.readUInt32BE(index * 4) === value,
      ),
  );

  assert.ok(
    hasSrgbChunk ||
      chunks.some(hasSrgbIccProfile) ||
      (hasGamma && hasChromaticities),
    'Expected PNG to declare sRGB encoding',
  );
  return ihdr.data;
}

test('PNG color helper rejects RGBA data', () => {
  const rgbaPng = makePngFixture({
    colorType: 6,
    colorChunks: [makePngChunk('sRGB', Buffer.from([0]))],
  });

  assert.throws(
    () => assertPngColorContract(rgbaPng),
    /Expected PNG color type 2/,
  );
});

test('PNG color helper rejects RGB transparency chunks', () => {
  const transparentRgbPng = makePngFixture({
    colorChunks: [
      makePngChunk('sRGB', Buffer.from([0])),
      makePngChunk('tRNS', Buffer.alloc(6)),
    ],
  });

  assert.throws(
    () => assertPngColorContract(transparentRgbPng),
    /Expected PNG without a tRNS transparency chunk/,
  );
});

test('PNG color helper rejects untagged RGB data', () => {
  assert.throws(
    () => assertPngColorContract(makePngFixture()),
    /Expected PNG to declare sRGB encoding/,
  );
});

test('PNG color helper accepts explicit sRGB declarations', () => {
  const srgbChunkPng = makePngFixture({
    colorChunks: [makePngChunk('sRGB', Buffer.from([0]))],
  });
  const iccpData = Buffer.concat([
    Buffer.from('sRGB IEC61966-2.1\0', 'latin1'),
    Buffer.from([0, 1]),
  ]);
  const iccpPng = makePngFixture({
    colorChunks: [makePngChunk('iCCP', iccpData)],
  });

  assert.doesNotThrow(() => assertPngColorContract(srgbChunkPng));
  assert.doesNotThrow(() => assertPngColorContract(iccpPng));
});

test('PNG chunk helper rejects truncated chunks', () => {
  const truncatedPng = makePngFixture({
    colorChunks: [makePngChunk('sRGB', Buffer.from([0]))],
  }).subarray(0, -1);

  assert.throws(
    () => assertPngColorContract(truncatedPng),
    /Expected a complete PNG chunk/,
  );
});

test('dist/og/portfolio.png is a 1200x630 PNG', async () => {
  const png = await readFile('dist/og/portfolio.png');
  const ihdr = assertPngColorContract(png);

  assert.equal(ihdr.readUInt32BE(0), 1200, 'Expected a 1200px PNG width');
  assert.equal(ihdr.readUInt32BE(4), 630, 'Expected a 630px PNG height');
});

test('dist does not contain root crawler-control artifacts', async () => {
  const rootEntries = await readdir('dist', { withFileTypes: true });
  const rootFiles = rootEntries
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => entry.name);

  assert.equal(
    rootFiles.includes('robots.txt'),
    false,
    'Expected no root robots.txt file',
  );
  assert.deepEqual(
    rootFiles.filter((name) => name.toLowerCase().startsWith('sitemap')),
    [],
    'Expected no root sitemap files',
  );
});
