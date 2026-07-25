# Pretendard Variable Font Migration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use subagent-driven-development to execute this plan task by task.

**Goal:** Replace the unpinned static Pretendard bundle with the pinned Pretendard Variable dynamic subset while preserving the existing system fallbacks and layout.

**Architecture:** The shared layout loads one version-pinned jsDelivr stylesheet for both language routes. The global font token names the family exposed by that stylesheet. Production-output tests validate rendered links and hashed build CSS without making brittle external-network requests in CI.

**Tech Stack:** Astro 4, CSS custom properties, Pretendard v1.3.9, Node.js test runner

---

### Task 1: Lock the font-delivery contract with a failing test

**Files:**
- Modify: `tests/site-output.test.mjs`

**Step 1: Add HTML font-link assertions**

For both production HTML files, assert:

- exactly one stylesheet link uses:
  `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`;
- the existing `https://cdn.jsdelivr.net` preconnect remains;
- the old static URL is absent.

**Step 2: Add built CSS assertions**

Read all `.css` files below `dist/_astro` without hard-coding hashed filenames. Assert the combined CSS contains:

```css
--font-sans:"Pretendard Variable",-apple-system,BlinkMacSystemFont,system-ui,sans-serif
```

Allow insignificant minifier whitespace and quote differences, but require `Pretendard Variable` as the first family and reject the old standalone `Pretendard` token.

**Step 3: Run the focused test**

Run:

```bash
npm run build && npm run test:site
```

Expected: FAIL on the new URL and variable-family assertions.

**Step 4: Commit the red test**

```bash
git add tests/site-output.test.mjs
git commit -m "test: define Pretendard Variable contract"
```

### Task 2: Switch the layout and token to Pretendard Variable

**Files:**
- Modify: `src/layouts/Layout.astro`
- Modify: `src/styles/tokens.css`

**Step 1: Replace the shared stylesheet URL**

Change only the Pretendard stylesheet URL in the layout. Preserve the jsDelivr preconnect and do not add SRI for the dynamic-subset CSS.

**Step 2: Change the first font family**

Set:

```css
--font-sans: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

Keep every existing fallback in the same order.

**Step 3: Run the focused test**

Run:

```bash
npm run build && npm run test:site
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/layouts/Layout.astro src/styles/tokens.css
git commit -m "perf: use pinned Pretendard variable subset"
```

### Task 3: Verify transfer size and visual stability

**Files:**
- Verify only

**Step 1: Run full automated verification**

Run:

```bash
npm run verify
```

Expected: all tests and the production build pass.

**Step 2: Measure Korean and English independently**

Use separate clean browser contexts with cache disabled. Load `/` and `/en/` independently and sum the transferred bytes for:

- the Pretendard dynamic-subset CSS;
- every requested Pretendard `.woff2` slice.

Expected for each language: less than `750 KiB`.

Do not reuse one language's browser cache when measuring the other.

**Step 3: Check visual stability**

At desktop and mobile widths, confirm:

- Korean and English text render with the intended sans-serif face;
- there is no material wrapping, clipping, overlap, or layout shift regression;
- the console contains no font-loading errors.

**Step 4: Review the diff**

Run:

```bash
git diff origin/main...HEAD --check
git status --short
```

Confirm there are no package, lockfile, or self-hosted font additions.
