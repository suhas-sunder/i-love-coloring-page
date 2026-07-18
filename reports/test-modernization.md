# Test Modernization

## Rewritten

- `pipeline/scripts/audit-hub-content-quality.mjs`: removed the historical 105–360 word and three-section article requirement. The behavior gate now checks explicit editorial coverage, tier fields, duplicate introductions, forbidden wording, embedded stale counts, and one Related Collections module.
- `pipeline/scripts/audit-site-quality.mjs`: stopped overwriting the active indexation manifest and stopped reporting a removed instructional block as present.
- `pipeline/tests/foundation.test.mjs`: public route preservation is now tested separately from sitemap eligibility, so noindex public hubs are required to remain routable but absent from the sitemap.
- `pipeline/tests/printable-title-quality.test.mjs` and `pipeline/tests/static-search-data.test.mjs`: navigation-search collection counts now follow the active indexable inventory instead of assuming all public routes are promoted.
- `pipeline/tests/taxonomy-promotion.test.mjs`, `pipeline/tests/navigation-search-filter.test.mjs`, `pipeline/tests/public-page-restructure.test.mjs`, `pipeline/tests/site-quality-foundations.test.mjs`, and `pipeline/tests/crawl-indexation.test.mjs`: superseded source-shape and all-hubs-indexable assumptions were replaced with behavior assertions for the active taxonomy, IA, content model, and crawl contract.

## Added

- `pipeline/tests/hub-architecture.test.mjs`: graph-wide cycle detection, corrected source memberships, reverse-map consistency, consolidation/indexation behavior, editorial coverage, unified navigation, and robots/canonical assertions.

Historical phase snapshots were not broadly deleted. Any remaining failures outside the collection/content/navigation/indexation scope are reported by the full-suite run rather than weakened here.
