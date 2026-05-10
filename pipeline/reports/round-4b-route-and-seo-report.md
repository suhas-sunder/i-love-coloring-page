# Round 4B Route And SEO Report

Generated: 2026-05-10

## Routes

- Root gallery route: `/coloring-pages`
- Hub route pattern: `/coloring-pages/[hubSlug]`
- Sitemap route count: 65
- Indexable gallery route count: 65
- Phase 1 slug hub pages: 64
- Root route included in sitemap: true
- Phase 2 hubs are excluded from indexable routes.
- Section-only topics are excluded from indexable routes.
- Rejected hub candidates are excluded from indexable routes.
- Per-image routes are not generated.

## SEO Behavior

- `app/sitemap.ts` reads generated sitemap entries and emits only indexable Round 4B routes.
- `app/robots.ts` allows the public gallery and references the sitemap.
- Page metadata uses `NEXT_PUBLIC_SITE_URL` when configured, otherwise local relative paths remain stable.
- Metadata and Open Graph copy comes from generated hub data and does not claim fake search volume.
