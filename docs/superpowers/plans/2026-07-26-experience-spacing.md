# Experience Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a 24px visual boundary between adjacent company entries in `# 경력` without bringing back separator lines or changing outer spacing.

**Architecture:** Keep the existing Astro markup and spacing tokens. Add an output-level CSS contract test, then style only adjacent `.job-group` siblings with `var(--space-5)` so the first and last groups retain their current outer spacing at every viewport.

**Tech Stack:** Astro 4, scoped CSS, Node.js built-in test runner, Playwright browser verification

---

### Task 1: Lock and implement the adjacent job-group spacing contract

**Files:**
- Modify: `tests/site-output.test.mjs:438`
- Modify: `src/components/Workspace.astro:1148`

- [ ] **Step 1: Write the failing production-CSS test**

Add this test immediately after the existing `hierarchical jobs without separators`
loop in `tests/site-output.test.mjs`:

```js
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
```

- [ ] **Step 2: Build and run the focused test to verify it fails**

Run:

```bash
npm run build
node --test --test-name-pattern='dist CSS spaces adjacent job groups' tests/site-output.test.mjs
```

Expected: the focused test fails with
`Expected adjacent job groups to use the 24px spacing token`, because the
compiled stylesheet has no adjacent `.job-group` rule yet.

- [ ] **Step 3: Add the minimal scoped CSS implementation**

Insert this rule immediately before `.job-header` in
`src/components/Workspace.astro`:

```css
.job-group + .job-group {
  margin-top: var(--space-5);
}
```

Do not add a media query, `border`, `<hr>`, or extra wrapper markup.

- [ ] **Step 4: Rebuild and verify the focused test passes**

Run:

```bash
npm run build
node --test --test-name-pattern='dist CSS spaces adjacent job groups' tests/site-output.test.mjs
```

Expected: the focused test passes. All other tests in the file are skipped by
the name filter.

- [ ] **Step 5: Commit the tested implementation**

```bash
git add tests/site-output.test.mjs src/components/Workspace.astro
git commit -m "fix: space adjacent experience entries"
```

### Task 2: Verify the complete site and responsive behavior

**Files:**
- Verify: `dist/index.html`
- Verify: `dist/en/index.html`
- Verify: `dist/_astro/*.css`

- [ ] **Step 1: Run the complete repository verification**

Run:

```bash
npm run verify
```

Expected: unit tests, content validation, Astro production build, and all site
output tests complete with exit code 0.

- [ ] **Step 2: Start the local site for browser verification**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Astro reports a local URL, normally `http://127.0.0.1:4321/`.
Keep this process running during the next two steps.

- [ ] **Step 3: Verify desktop behavior in a real browser**

At a 1440×900 viewport, open `http://127.0.0.1:4321/#experience` and evaluate:

```js
({
  margins: [...document.querySelectorAll('#experience .job-group')]
    .slice(1)
    .map((element) => getComputedStyle(element).marginTop),
  separators: document.querySelectorAll('#experience .job-hr').length,
})
```

Expected:

```js
{ margins: ['24px', '24px'], separators: 0 }
```

Capture the `#experience` section and confirm visually that the company blocks
are distinct, no separator line appears, and the neighboring channels remain
unchanged.

- [ ] **Step 4: Verify mobile behavior in a real browser**

At a 390×844 viewport, reload `http://127.0.0.1:4321/#experience` and run the
same evaluation.

Expected:

```js
{ margins: ['24px', '24px'], separators: 0 }
```

Capture the `#experience` section and confirm that the layout does not overflow
and uses the same 24px spacing as desktop.

- [ ] **Step 5: Confirm the branch is ready to publish**

Run:

```bash
git status --short
git log -5 --oneline
```

Expected: the worktree is clean. The latest five commits, newest first, are
`docs: sync experience spacing plan`, `test: tighten experience spacing
contract`, `fix: space adjacent experience entries`, `docs: plan experience
spacing change`, and `docs: define experience spacing design`. There are no
unrelated changes.
