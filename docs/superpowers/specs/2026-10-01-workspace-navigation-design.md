# Workspace navigation and responsive design

## Approved scope

The user selected the first five improvements in the visual review and requested a PR. Preserve the existing Slack style and the static reaction emojis and counts. Work only in KYBee.github.io.

1. Add a pinned project index at the start of the work projects channel. Generate anchors from content identifiers so Korean and English share stable project URLs. Use native details disclosure; expand on desktop and start collapsed on mobile.
2. Put mobile message avatars and author metadata on one row, with the title, body, outcome and tags below. Match avatar children to their responsive container.
3. Keep navigation in a drawer through 1024px. Retain the fixed desktop sidebar above that width. Keep compact messages and full width profiles through 768px, with a separate tablet gutter.
4. Put a work projects shortcut beside the introduction links.
5. Clarify profile access in the introduction and DM entry and improve label contrast in the light theme.

## Related verified defects

Display one theme icon at a time. Enlarge icon control hit areas. Move focus into an opened drawer, trap it, restore it when closing, and keep the page behind overlays inert. Handle a drawer to profile transition and closing a drawer when resizing to desktop.

## Implementation boundaries

Use existing Astro rendering, CSS tokens and browser APIs. No new runtime dependencies, content rewrites, live reactions, infrastructure changes or layout redesign. Update project guidance where responsive conventions change.

## Verification

Check generated bilingual project links against their actual destinations. Verify actual browser focus behavior and responsive geometry at 320, 390, 768, 769, 820, 1024, 1025, 1440 and 1920px. Inspect both themes and languages. Run npm run verify and get an independent code review before opening the PR.
