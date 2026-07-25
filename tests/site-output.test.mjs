import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

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

  return [...html.matchAll(tagPattern)].map((match) => ({
    attributes: parseQuotedAttributes(match[0]),
    end: match.index + match[0].length,
    source: match[0],
  }));
}

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

function extractMetadataHead(html) {
  const sanitizedHtml = html.replace(
    /<!--[\s\S]*?-->|(<(script|style)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?<\/\2\s*>/gi,
    (_match, openingTag) => openingTag ?? '',
  );
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
    '<!-- <head><meta name="description" content="comment"></head> -->',
    '<html><head>',
    '<meta name="description" content="real-head">',
    '<script>const fake = \'<meta name="description" content="script">\'; const close = \'</head>\';</script>',
    '<style>.fake::before { content: \'<meta name="description" content="style">\'; }</style>',
    '<script type="application/ld+json;profile=https://schema.org">{}</script>',
    '</head><body>',
    '<meta name="description" content="body">',
    '</body></html>',
  ].join('');
  const metadataHead = extractMetadataHead(html);
  const metaTags = findTags(metadataHead, 'meta');
  const scriptTags = findTags(metadataHead, 'script');

  assert.deepEqual(
    metaTags.map((tag) => tag.attributes.content),
    ['real-head'],
  );
  assert.equal(scriptTags.filter(hasJsonLdMimeType).length, 1);
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

for (const page of metadataCases) {
  test(`${page.path} defines the portfolio metadata contract`, async () => {
    const html = await readFile(page.path, 'utf8');
    const metadataHead = extractMetadataHead(html);
    const linkTags = findTags(metadataHead, 'link');
    const metaTags = findTags(metadataHead, 'meta');
    const scriptTags = findTags(metadataHead, 'script');
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
      scriptTags.filter(hasJsonLdMimeType).length,
      0,
      `Expected no JSON-LD in ${page.path}`,
    );
    assert.equal(
      metaTags.filter((tag) => hasMetaName(tag, 'keywords')).length,
      0,
      `Expected no meta keywords in ${page.path}`,
    );
    assert.equal(
      metaTags.filter(
        (tag) =>
          hasMetaName(tag, 'robots') &&
          tag.attributes.content?.toLowerCase().includes('noindex'),
      ).length,
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

test('dist/og/portfolio.png is a 1200x630 PNG', async () => {
  const png = await readFile('dist/og/portfolio.png');
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  assert.deepEqual(
    png.subarray(0, pngSignature.length),
    pngSignature,
    'Expected the PNG file signature',
  );
  assert.ok(png.length >= 33, 'Expected a complete PNG IHDR chunk');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(8), 13, 'Expected a 13-byte IHDR payload');
  assert.equal(png.readUInt32BE(16), 1200, 'Expected a 1200px PNG width');
  assert.equal(png.readUInt32BE(20), 630, 'Expected a 630px PNG height');
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
