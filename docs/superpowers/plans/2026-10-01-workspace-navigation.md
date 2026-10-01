# Workspace Navigation Implementation Plan

> **For agentic workers:** Use executing-plans to implement this approved plan inline. Request an independent review after verification.

**Goal:** Apply the five approved UI improvements while retaining Slack styling and reaction counts.

**Architecture:** Extend the existing Workspace component, preserve content identifiers for project anchors, and reuse native details and anchors. Keep responsive values in CSS tokens and share overlay focus management between the drawer and profile panel.

**Tech Stack:** Astro, TypeScript, CSS, Node test runner, Playwright CLI.

## Task 1: Establish regression checks

**Files:** `tests/site-output.test.mjs`; browser artifacts under `output/playwright/`.

- [x] Add a generated HTML test for each language that locates `id="project-index"`, extracts project fragment links and asserts that every destination ID exists exactly once. Assert that the introduction links include `href="#work-projects"`.
- [x] Run `node --test --test-name-pattern='project navigation' tests/site-output.test.mjs`; confirm the existing build fails because the index and introduction shortcut are absent.
- [x] In the current browser build, reproduce the 32px container / 44px avatar mismatch, the two visible theme icons and the drawer focus remaining behind the overlay.

## Task 2: Navigation and profile access

**Files:** `src/components/Workspace.astro`.

- [x] Preserve content filenames as `anchorId: 'project-' + entry.id.replace(/\.(ko|en)(?:\.ya?ml)?$/, '')` on each rendered project.
- [x] Render native details with `id="project-index"`, localized pinned-project labels and `<a href={'#' + item.anchorId}>` links to message containers. Add the localized work project shortcut to introduction links.
- [x] Label profile entry points in both languages and turn the introduction name into a profile button.
- [x] Build, then run the generated project navigation tests and confirm both languages pass.

## Task 3: Responsive layout and overlay behavior

**Files:** `src/components/Workspace.astro`, `src/components/Avatar.astro`, `src/styles/tokens.css`, `src/layouts/Layout.astro`.

- [x] Add tablet gutter and control size tokens. Override profile label color per theme.
- [x] Move drawer navigation breakpoint to 1024px and footer/sidebar margins to the matching 1025px boundary. Keep compact message layout at 768px.
- [x] Use mobile grid columns `32px minmax(0, 1fr)` and `display: contents` for message bodies. Keep author metadata in column two and body fields across both columns. Use `var(--message-avatar-size, SIZEpx)` for avatar children.
- [x] Make theme root selectors global to display only one icon. Apply the shared control size to icon buttons.
- [x] Implement drawer focus entry, wrap, restoration and background inertness. Reuse focus trapping for the profile, preserve a visible return target when opening from the drawer, and close the drawer on desktop resize.
- [x] Check the browser regressions from task one, navigation destinations, keyboard transitions, theme persistence and overflow at the documented widths.

## Task 4: Finish and review

**Files:** `CLAUDE.md`, spec and plan above.

- [x] Update responsive conventions in project guidance to match implemented behavior.
- [x] Run `npm run verify` and `git diff --check`.
- [x] Request an independent code review against the approved spec; fix substantive findings.
- [ ] Commit, push the feature branch and create a PR against main with changes and verification evidence.

## Verification results

- `npm run verify`: 51 unit/workflow tests, content validation, build and 24 site output tests passed.
- `git diff --check`: passed.
- Playwright: Korean and English at 320, 390, 768, 769, 820, 1024, 1025, 1440 and 1920px; no horizontal overflow, matched avatar dimensions, expected navigation breakpoint and one visible theme icon.
- Keyboard checks: drawer/profile focus entry and trapping, Escape restoration, drawer-to-profile transition and both directions of viewport resizing passed.
- Project links scroll below sticky headers. Light/dark mobile, tablet and desktop screenshots inspected.
- Independent review: profile focus restoration after resizing was corrected and retested; no remaining findings.
- Content and decorative reaction counts remain unchanged.
