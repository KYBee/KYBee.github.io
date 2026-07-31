# Static Project Reactions Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the anonymous Cloudflare-backed reaction feature, restore deterministic static example emoji pills on every project card, and deploy the static site without any Cloudflare runtime or Actions connection.

**Architecture:** Revert the six reaction PR merge commits in reverse order so the repository returns to its pre-reactions structure without manually reconstructing deleted files. Then make one focused static-UI adjustment so both work and side-project cards render two example emoji pills, and add output tests that prevent interactive controls or API references from returning.

**Tech Stack:** Astro, TypeScript, Node test runner, GitHub Actions, GitHub Pages

---

### Task 1: Revert the interactive reaction stack

**Files:**
- Restore through git history: `src/components/Workspace.astro`
- Delete through git history: `src/components/ReactionControls.astro`
- Delete through git history: `src/scripts/reactions/`
- Delete through git history: `src/styles/reactions.css`
- Delete through git history: `services/reactions/`
- Delete through git history: `.github/workflows/reactions-deploy.yml`
- Restore through git history: `.github/workflows/deploy.yml`
- Restore through git history: `package.json`, `package-lock.json`, `src/env.d.ts`
- Delete through git history: `src/pages/reaction-targets.json.ts`
- Delete through git history: reaction-specific tests and scripts

- [ ] **Step 1: Revert UI hotfix merge #9**

Run: `git revert -m 1 --no-edit 5039a25420589c631eb500a585b63a6a11591ba9`
Expected: capture-phase click hotfix is removed.

- [ ] **Step 2: Revert UI feedback merge #8**

Run: `git revert -m 1 --no-edit 519399c9913e8de10eb3c9d75402aeb56d45c33b`
Expected: inline action counts and card-internal toolbar changes are removed.

- [ ] **Step 3: Revert navigation keepalive merge #7**

Run: `git revert -m 1 --no-edit 70912cfc3338f89b7d9f7e854034a35ff54e9bdd`
Expected: PUT keepalive hotfix is removed.

- [ ] **Step 4: Revert interactive UI merge #6**

Run: `git revert -m 1 --no-edit 9acc2ea9a89ce5aa31a25c36b6c8bad3ad527f48`
Expected: static `reactionSets` and `.reaction-pill` markup return; interactive client/component/style files are deleted.

- [ ] **Step 5: Revert Worker redirect merge #5**

Run: `git revert -m 1 --no-edit 98a3784c2146b63652a7c4a69eb8bb08ceb1c7cf`
Expected: the Worker redirect hotfix is removed before its parent feature.

- [ ] **Step 6: Revert shared reaction backend merge #4**

Run: `git revert -m 1 --no-edit 60637419bc13f3b5ad26a2a220bd4c919aa898d9`
Expected: Worker/D1 source, reaction deploy workflow, API environment validation, manifest route, and reaction-specific test/tooling are removed; Pages returns to a plain Astro build.

- [ ] **Step 7: Verify structural rollback**

Run: `rg -n "PUBLIC_REACTIONS_API_URL|ReactionControls|data-reaction-|scripts/reactions|services/reactions|reactions-deploy" src .github package.json scripts tests || true`
Expected: no runtime/API/deployment references remain.

### Task 2: Make all example reactions consistently static

**Files:**
- Modify: `src/components/Workspace.astro`
- Modify: `tests/site-output.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Write a failing static-output test**

Add this test to `tests/site-output.test.mjs`:

```js
for (const pagePath of ['dist/index.html', 'dist/en/index.html']) {
  test(`${pagePath} uses only static project reaction examples`, async () => {
    const html = await readFile(pagePath, 'utf8');
    const pills = html.match(/class="reaction-pill"/gu) ?? [];

    assert.equal(pills.length, 20);
    assert.doesNotMatch(html, /data-reaction-/u);
    assert.doesNotMatch(html, /reaction-action|reaction-launcher/u);
    assert.doesNotMatch(html, /workers\.dev|PUBLIC_REACTIONS_API_URL/u);
  });
}
```

The portfolio contains ten work/side project cards, so twenty pills proves that every restored card receives two examples in the current fixed content contract.

- [ ] **Step 2: Run the output test and confirm failure**

Run: `npm run build && npm run test:site`
Expected: side-project messages fail because the restored markup renders only one example reaction pill.

- [ ] **Step 3: Render two deterministic pills for side projects**

Replace the single indexed side-project reaction span with:

```astro
{reactionSets[i % reactionSets.length].map(([emoji, count]) => (
  <span class="reaction-pill">{emoji} {count}</span>
))}
```

Keep work-project rendering unchanged because it already maps both entries.

- [ ] **Step 4: Run the output test and confirm success**

Run: `npm run build && npm run test:site`
Expected: every KO/EN work and side-project card has exactly two static example pills and no interactive controls.

- [ ] **Step 5: Commit the static consistency change**

Run: `git add src/components/Workspace.astro tests/site-output.test.mjs docs/superpowers/plans/2026-07-31-static-project-reactions-rollback.md && git commit -m "fix: keep project reactions static"`
Expected: one focused commit after the six mechanical revert commits.

The commit also restores `.env.local`, `.playwright-cli/`, and
`output/playwright/` ignore rules so the preserved Cloudflare token and local
browser artifacts cannot enter the rollback PR.

### Task 3: Verify and publish the rollback

**Files:**
- Verify all changed files

- [ ] **Step 1: Run repository verification**

Run: `npm run verify`
Expected: content tests, frontend tests, Astro check/build, and site-output tests pass without Worker/D1 commands.

- [ ] **Step 2: Inspect desktop and mobile output**

Run the local Astro server and inspect 1440×900 and 390×844 viewports. Confirm static pills are visible without hover/tap, cards do not move on interaction, KO/EN render the same static structure, and there are no requests to `workers.dev`.

- [ ] **Step 3: Push and open a PR**

Run: `git push -u origin revert/static-project-reactions`, then create a PR targeting `main` that explains the non-destructive Cloudflare disconnect and static fallback.

- [ ] **Step 4: Merge after required checks pass**

Run: `gh pr checks <pr> --watch`, then `gh pr merge <pr> --merge`.
Expected: required Content Check passes and the PR merges to `main`.

- [ ] **Step 5: Verify production release**

Watch the Pages deployment for the merge SHA. Open the public KO/EN pages and assert static pills render, no interactive reaction controls exist, and no Reactions Worker workflow is triggered by the release.

- [ ] **Step 6: Preserve external Cloudflare resources**

Do not delete the Worker, D1 database, token, or GitHub secrets in this rollback. They remain dormant and recoverable because the repository contains no client call or automatic deployment connection.
