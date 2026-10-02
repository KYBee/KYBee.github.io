# Community Activities Implementation Plan

> Use executing-plans to implement the approved changes inline.

**Goal:** Remove the project shortcut index and deduplication project; show community links with supported activity descriptions in the main page.

**Architecture:** Keep the existing channels and project anchors. Replace the optional `about.activities` string with an optional array of `{ name, url, description }` objects, update both languages and Pages CMS together, and render the same source in the main page and profile. Preserve remaining project reaction examples.

**Tech Stack:** Astro, YAML, TypeScript, Node tests, Playwright CLI.

## Tasks

- [x] Update `tests/site-output.test.mjs`: assert no project index or deduplication destination, retain the introduction project shortcut and unique project anchors; verify six community links and descriptions inside `main`. Adjust reaction pill count from 26 to 24 for the removed project.
- [x] Build the current source and run the updated site tests to observe the missing behavior.
- [x] Remove `details#project-index`, its labels, styles and initialization from `src/components/Workspace.astro`. Delete both `src/content/projects/samsung-dedup.*.yaml` files. Keep the remaining project IDs and decorative reactions stable.
- [x] In `src/content/config.ts`, use `activities: z.array(z.object({ name: z.string(), url: z.string().url(), description: z.string() })).optional()`. Make both `.pages.yml` activity fields object lists with required string fields `name`, `url` and `description`.
- [x] Replace the activity strings in `src/content/about/{ko,en}.yaml` with six verified links and evidence-backed descriptions. Use https://sipe.team/, https://www.ssafy.com/, https://github.com/GDGoC-CAU, https://pirogramming.com/, https://umc.makeus.in/, https://www.sopt.org/.
- [x] Replace the side-project channel footnote with a community activity message containing a heading, linked names and descriptions; add an introduction shortcut to `#community-activities`. Render linked names in the profile instead of stringifying the array. Use existing spacing, colors and message layout.
- [x] Update `CLAUDE.md` conventions. Run `npm run verify` and `git diff --check`; inspect Korean/English desktop/mobile community blocks and navigation with Playwright.
- [ ] Commit, push and open a PR against main, leaving existing checkout changes intact.

## Evidence

- Existing about content confirms SIPE 5th, SSAFY 8th Java track, GDSC CAU, Pirogramming, UMC and SOPT participation.
- Read-only knowledge application records confirm SSAFY algorithm study leadership and mentoring, GDSC MOA solo development and learning exchange, and SOPT APPJAM Booster planning/PM and grand prize.
- No unsupported dates, cohorts or roles are added for the other communities.

## Verification results

- `npm run verify`: 51 unit/workflow tests, content validation, build and 26 site tests passed (77 tests total).
- `git diff --check`: passed.
- Playwright: Korean and English at 320, 390, 820 and 1440px; six community links, 44px minimum link height, seven work projects and no horizontal overflow.
- The introduction shortcut moves keyboard focus to the community message below the sticky header; light/dark layouts inspected.
- Remaining project reaction examples match the previous page.
- Independent review found no substantive issues and independently passed the related tests.
- The former GDSC CAU website failed DNS resolution; the official GDGoC-CAU GitHub organization is used instead.
