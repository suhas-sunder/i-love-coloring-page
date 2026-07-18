# Site quality audit

## Scope and source of truth

The site is a Next.js 16 static export built from generated runtime hub/printable JSON. This audit processed all 163 hubs, all 6,352 printable routes, all 13,203 hub pairs, and every local clean WebP/SVG pair. Production media remains CDN-hosted; no original or generated image was modified.

Official guidance supports a people-first, original, substantial-value approach and warns against scaled pages that add little value: [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [spam policies](https://developers.google.com/search/docs/essentials/spam-policies), and [generative AI guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content). Image guidance emphasizes crawlable images, relevant surrounding text, and accurate alt text: [Google Images](https://developers.google.com/search/docs/appearance/google-images) and [image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps). Publisher policies prohibit ads on low/no-content screens and pages with more ads than publisher content: [screen requirements](https://support.google.com/publisherpolicies/answer/11112688), [low-value content](https://support.google.com/publisherpolicies/answer/11169917), and [publisher restrictions](https://support.google.com/publisherpolicies/answer/10502938).

## Verified defects

- Adult-detail and Mandalas inventories are exactly equal; Geometric differs by only two records.
- All 6,352 principal previews declared larger source dimensions than their WebP pixels and could upscale.
- Live production renders development ad placeholders despite no live advertising.
- Hub metadata and shared visible copy expose production/indexation language.
- Categories used a four-column layout for three groups.
- Counts had multiple consumers and navigation literals rather than one authoritative helper.
- Production had no machine-readable revision marker and crawl files could inherit unsuitable caching.

## Likely defects / needs browser confirmation

- Mobile search whitespace and footer positioning were caused by full-height grid distribution; CSS foundations are fixed, but keyboard/safe-area acceptance remains.
- Text-only browse counts can appear detached at narrow/intermediate widths.
- Live placeholder disappearance likely reflects breakpoint/hydration layout changes, because no live fill script exists.

## Editorial judgments

- Recommendation status is evidence-backed but non-active. Small size never automatically causes noindex.
- Distinct hub and printable copy cannot be solved safely through broad templated generation.
- Whether near-duplicate names represent valuable intents requires human review after membership repair.

## Technical fixes completed

- Authoritative collection count helper and consumer migration.
- Typed asset-role resolver; truthful preview dimensions; SSR/hydration alt/source/dimension parity.
- Explicit OFF/PLACEHOLDER/LIVE advertising modes with production OFF default and guarded initialization.
- Non-active versioned indexation manifest.
- Build revision diagnostic and cache rules.
- Repeatable full audit command and quality safeguards.
- Safe Categories and mobile-search CSS foundations.

## Deliberately deferred

- Mass content rewriting, broad noindex, redirects, destructive taxonomy changes, source-image edits, live advertising, deployment, and full visual redesign.

## Automated safeguards

- **PASS** — identical introductions across indexable hubs: 0 duplicated route occurrences
- **FAIL** — near-identical introduction templates: 3 normalized templates across 163 hubs
- **FAIL** — forbidden internal terminology: 134 occurrences
- **PASS** — one related-collections section maximum: 1 shared component occurrences
- **PASS** — visible count consistency: 0 mismatches
- **PASS** — noindex routes excluded from sitemap: current runtime metadata
- **PASS** — navigation destinations exist: 0 invalid destinations
- **PASS** — redirected routes absent from navigation: audit manifest is non-active and has no redirects
- **PASS** — exact inventory duplicates have explicit exception: 1 exact pairs

Known editorial debt is reported rather than silently rewritten. Use `npm run validate:site-quality` for a deliberately strict non-zero gate after the editorial/taxonomy work is complete.
