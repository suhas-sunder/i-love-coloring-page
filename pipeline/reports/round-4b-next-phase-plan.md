# Round 4B Next Phase Plan

Generated: 2026-05-10

## Round 4C Recommendation

Run visual QA on the Next.js gallery with either `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` pointing to uploaded assets or both `COLORING_ENABLE_LOCAL_ASSET_PROXY=1` and `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY=1` for local review. Then tighten hub copy, card density, mobile behavior, and sitemap metadata from browser evidence. Do not promote Phase 2 hubs or move media into `public/` until asset hosting and content quality are explicitly approved.

## Commands

```powershell
node --test pipeline\tests\round-4a-hub-taxonomy.test.mjs
node --test pipeline\tests\round-4b-next-gallery.test.mjs
node pipeline\scripts\round-4b-build-next-gallery-data.mjs
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

`npm run lint` should be added in a later code-quality pass before using lint as a release gate.
