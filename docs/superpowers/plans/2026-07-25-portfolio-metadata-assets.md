# Portfolio Metadata and Sharing Assets Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use subagent-driven-development to execute this plan task by task.

**Goal:** Give the Korean and English portfolio pages complete language-specific search/share metadata plus deterministic favicon and Open Graph assets.

**Architecture:** Each page entrypoint loads its own `about.tagline` from Astro content and passes it to the shared layout. The layout owns canonical, alternate-language, Open Graph, Twitter, and favicon markup, deriving absolute URLs from `Astro.site`. Static visual assets live under `public/` and are copied unchanged into the production build.

**Tech Stack:** Astro 4, Astro Content Collections, Node.js test runner, SVG, PNG

---

### Task 1: Lock the production metadata contract with failing tests

**Files:**
- Modify: `tests/site-output.test.mjs`

**Step 1: Add reusable HTML tag helpers**

Add small helpers that extract a tag and parse its quoted attributes without depending on attribute order. Keep the existing career hierarchy test unchanged.

**Step 2: Add a table-driven metadata test for both languages**

For `dist/index.html` and `dist/en/index.html`, assert:

- the exact title and content-derived description;
- one exact canonical URL;
- exact `ko`, `en`, and `x-default` alternate URLs;
- Open Graph `website`, title, description, URL, locale, alternate locale, site name, and absolute image URL;
- Twitter `summary_large_image`, title, description, and absolute image URL;
- the SVG favicon link and MIME type;
- no JSON-LD, `keywords`, or `noindex` additions.

Use these fixed URLs:

- Korean: `https://kybee.github.io/`
- English: `https://kybee.github.io/en/`
- Image: `https://kybee.github.io/og/portfolio.png`

Read the exact descriptions from `src/content/about/ko.yaml` and `src/content/about/en.yaml` while writing the test, then lock the rendered strings explicitly so a wrong content entry cannot silently pass.

**Step 3: Run the focused production-output test**

Run:

```bash
npm run build && npm run test:site
```

Expected: FAIL because the layout does not emit the new metadata or favicon link.

**Step 4: Commit the red test**

```bash
git add tests/site-output.test.mjs
git commit -m "test: define portfolio metadata contract"
```

### Task 2: Feed content descriptions into the shared layout

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/en/index.astro`
- Modify: `src/layouts/Layout.astro`

**Step 1: Load each language's about entry**

In each page entrypoint, use `getEntry('about', '<lang>')`. Throw a clear build-time error if the required entry is absent, then pass `about.data.tagline` as the layout `description`.

**Step 2: Extend the layout props**

Require:

```ts
interface Props {
  title: string;
  lang: 'ko' | 'en';
  description: string;
}
```

**Step 3: Derive the URL and locale values once**

Use `Astro.site` as the production origin and derive:

- canonical URL by language;
- fixed Korean, English, and x-default URLs;
- `ko_KR` / `en_US` Open Graph locales;
- `https://kybee.github.io/og/portfolio.png`.

Do not derive canonical paths from transient dev-server URLs.

**Step 4: Render the metadata**

Add:

- `<meta name="description">`;
- canonical and three alternate links;
- the complete Open Graph set;
- the complete Twitter set;
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`.

Use `Youngbeen Kim` as `og:site_name`. Do not add JSON-LD, sitemap, robots, keywords, or `noindex`.

**Step 5: Run the focused test**

Run:

```bash
npm run build && npm run test:site
```

Expected: metadata assertions pass; asset assertions added in Task 3 still fail until the files exist.

**Step 6: Commit**

```bash
git add src/pages/index.astro src/pages/en/index.astro src/layouts/Layout.astro
git commit -m "feat: add localized portfolio metadata"
```

### Task 3: Add deterministic favicon and OG asset checks

**Files:**
- Modify: `tests/site-output.test.mjs`
- Create: `public/favicon.svg`
- Create: `public/og/portfolio.png`

**Step 1: Add failing static-asset assertions**

Assert:

- `dist/favicon.svg` exists, is valid SVG source, has a square `viewBox`, and contains no `<image>`, `<text>`, script, animation, or external `href`;
- `dist/og/portfolio.png` has a PNG signature and an IHDR width/height of exactly `1200 × 630`;
- no `dist/robots.txt` or sitemap file is introduced.

Run:

```bash
npm run build && npm run test:site
```

Expected: FAIL because the assets do not exist.

**Step 2: Create the favicon**

Create a code-native `64 × 64` SVG with a blue rounded-square field and fixed white `YB` paths. Use paths instead of `<text>` so rendering does not depend on an installed font.

Validate:

```bash
xmllint --noout public/favicon.svg
```

Expected: PASS.

**Step 3: Generate the Open Graph image**

Use the image generation skill to create a language-neutral flat identity card containing exactly:

- `YB`
- `Youngbeen Kim`
- `Backend Engineer`

Keep the existing portfolio palette, use no photo or third-party/company marks, and generate the finished graphic rather than a mockup. Inspect it visually, then crop/resize only as needed to guarantee a `1200 × 630` sRGB PNG at `public/og/portfolio.png`.

**Step 4: Verify image geometry**

Use an image inspection command to confirm:

- PNG format;
- width `1200`;
- height `630`;
- no transparency or unintended color-mode conversion that harms social previews.

Also inspect the full image and a reduced preview for text accuracy and legibility.

**Step 5: Run the focused test**

Run:

```bash
npm run build && npm run test:site
```

Expected: PASS.

**Step 6: Commit**

```bash
git add tests/site-output.test.mjs public/favicon.svg public/og/portfolio.png
git commit -m "feat: add portfolio sharing assets"
```

### Task 4: Verify the metadata and assets as a complete slice

**Files:**
- Verify only

**Step 1: Run the full automated verification**

Run:

```bash
npm run verify
```

Expected: all unit, content, build, and site-output tests pass.

**Step 2: Inspect both pages in a real browser**

Run the production preview and inspect `/` and `/en/` for:

- correct document title and language;
- unchanged visible page content/layout;
- successful favicon and OG image requests;
- no browser console errors.

**Step 3: Review the diff**

Run:

```bash
git diff origin/main...HEAD --check
git status --short
```

Confirm the slice contains only metadata, localized descriptions, tests, and static sharing assets.

