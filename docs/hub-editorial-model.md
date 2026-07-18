# Hub editorial model

`src/config/hub-editorial-content.json` is the reviewable source for public collection copy. The build applies each record to the runtime hub and route metadata; components do not construct introductions by substituting a title, count, or adjective into a shared sentence.

## Tiers

- Tier A — core: use `introduction`, `scope`, `distinction`, and `selectionGuidance`. These fields explain a broad inventory and help separate it from adjacent hubs without producing a long article.
- Tier B — focused: a precise `introduction` is required. Add another field only when the adjacent-hub distinction is genuinely useful.
- Tier C — small distinct: use one accurate subject explanation. Do not pad a small inventory with activity advice, FAQs, or printing instructions.
- Tier D — non-independent: explain the consolidation briefly. Indexation and sitemap handling belong to the taxonomy policy, not the prose.

## Computed and editorial data

Counts, parents, children, representative assets, pagination totals, indexability, sitemap status, and canonical routes are computed from runtime manifests and policy. Introductions, distinctions, scope, selection guidance, and review status are editorial.

Representative collection cards use a verified member chosen deterministically from the generated featured set. The existing WebP card-thumbnail role is used; print compositions and internal SVG sources are not card media.

## Review gate

Before an indexable hub is added:

1. Verify current membership and its relationship to adjacent inventories.
2. Confirm the route represents a distinct browsing intent.
3. Assign a content tier and write an explicit route record.
4. Check that claims follow directly from current records; unsupported age, education, therapy, popularity, cultural, and difficulty claims are not allowed.
5. Add or review parent, child, and related relationships.
6. Run `npm run audit:site-quality`.

The gate rejects missing records, identical introductions, internal wording, manually embedded totals, and multiple Related Collections modules. It does not enforce an arbitrary article length.
