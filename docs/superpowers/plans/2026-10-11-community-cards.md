# Community Cards Implementation Plan

**Goal:** Show six community activities as responsive cards with official icons and useful links.
**Architecture:** Keep activities in bilingual about content. Add optional role, icon and result links to the existing schema and CMS. Render a two-column grid that becomes one column on compact screens, retaining workspace colors and keyboard-accessible links.
**Tech Stack:** Astro, YAML, CSS Grid, local image assets.

- [x] Save official icons in public/communities and document source URLs.
- [x] Add optional role/icon/links to src/content/config.ts and both about entries in .pages.yml; populate src/content/about/{ko,en}.yaml without inventing activities.
- [x] Replace the community message/list with cards in Workspace.astro: icon/name/role header, description and footer links. Use two columns above 768px and one below; 44px minimum link height and existing theme tokens.
- [x] Update existing community output assertions for six cards, source/result links and local icons; preserve other content contracts.
- [x] Run npm run verify; inspect 320/390/820/1025/1440px Korean and English, light/dark themes and image loading; prepare the verified changes for PR #17.
