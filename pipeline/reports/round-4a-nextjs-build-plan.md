# Round 4A Next.js Build Plan

Generated: 2026-05-10

## Exact Round 4B Recommendation

Build the Next.js public gallery shell using `pipeline/manifests/round-4a-approved-hub-taxonomy.json`, `pipeline/manifests/round-4a-image-to-hub-map.json`, `pipeline/manifests/round-4a-hub-route-plan.json`, and the Round 3C gallery and asset manifests. Implement `/coloring-pages` plus Phase 1 `/coloring-pages/[hubSlug]` routes only, keep Phase 2 topics as data-backed backlog or sections, do not create indexable per-image routes, and keep production media outside `public/` until the asset hosting policy is explicitly approved.

## Data Contract

- Use hub records for route metadata, H1, intro copy, featured assets, related hubs, breadcrumbs, and sitemap inclusion.
- Use image-to-hub mapping so one image can appear in multiple relevant hubs without duplicating asset metadata.
- Use Round 3C production gallery data for asset paths, alt text candidates, print/download availability, and warning flags.
- Do not import thousands of images into React components. Load metadata and resolve assets through the approved public or CDN path strategy.

## Sitemap And Indexing

- Include `/coloring-pages` and Phase 1 hub routes in the first sitemap.
- Exclude section-only topics and rejected candidates from the sitemap.
- Do not generate individual image URLs as indexable HTML pages.
- Phase 2 backlog hubs need an explicit promotion pass before sitemap inclusion.

## Round 4B Implementation Order

1. Create a server-side data loader that reads the Round 4A taxonomy, route plan, image-to-hub map, and Round 3C gallery data.
2. Implement `/coloring-pages` as the root hub using featured Phase 1 hub links and structured gallery sections.
3. Implement `/coloring-pages/[hubSlug]` for Phase 1 hubs only, returning 404 or noindex handling for non-promoted slugs.
4. Add hub page components for featured assets, filters, related hubs, breadcrumbs, and print/download actions.
5. Add sitemap generation from the Round 4A route plan and assert no per-image routes are emitted.
6. Run a local crawl and build validation before copying or publishing any production media.
