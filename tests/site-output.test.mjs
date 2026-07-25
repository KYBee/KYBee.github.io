import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
