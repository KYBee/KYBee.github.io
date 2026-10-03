# Experience and Profile Presentation Plan

Use executing-plans to apply the user's requested changes inline.

- Remove the two internal introduction shortcuts and their unused styles/copy.
- Store a current-job overview (summary, responsibilities and grouped stack) and experience areas in bilingual about content; synchronize Astro schemas and Pages CMS.
- Render the current-job overview beneath the existing Samsung company header.
- Move community activities to their own channel before side projects, with the existing channel divider between them. Expand supported SSAFY/GDSC/SOPT descriptions; request missing SIPE/Pirogramming/UMC facts.
- Render certifications as name/date rows and language proficiency as separate name/level rows; use structured bilingual language data and matching CMS fields.
- Replace profile communities with experience areas and categorized technical skills from content.
- Update existing navigation expectations and CMS schema parity configuration, build and run the repository verification gate, and inspect mobile/desktop Korean/English layouts.
- Commit, push and create a PR; preserve the original checkout and read-only knowledge.

## Completed verification

- Removed both internal introduction shortcuts.
- Added bilingual current-job responsibilities and five technology categories; expanded six skill categories shared by main content and profile.
- Community channel precedes side projects, with a visible channel divider. Supported community activity details are expanded. Additional writing candidates are in `docs/content/community-activity-notes.md`; SIPE/Pirogramming/UMC specifics await personal confirmation.
- Profile contains five experience areas and technical skills, with no community list.
- Certificates and language proficiency render as separate name/value lists; schema and CMS fields agree.
- `npm run verify`: content validation and build passed; all 77 tests passed.
- `git diff --check`: passed.
- Playwright: Korean/English at 320, 390, 820 and 1440px showed no horizontal overflow. Confirmed shortcut removal, community order/divider, five career stack groups, three certificate rows and three language rows.
- Inspected mobile/desktop screenshots and profile scrolling; profile technical tags wrap within the panel.
