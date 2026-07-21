# Legacy test disposition

## Decision

The 27 obsolete tests identified in `reports/historical-test-review.csv` were moved to `pipeline/tests/historical/` and renamed with the `.disabled` suffix. They remain version-controlled audit evidence, but ordinary test runners and editors no longer present them as active checks.

## Why

The archived files were frozen source-fragment or draft-era expectations. Several contradicted the current truthful format model and the explicit OFF/PLACEHOLDER/LIVE advertising policy. The active suite now owns the corresponding behavior through focused runtime, navigation, rendering, advertising, and crawlability tests.

## Active verification

- `npm test` is the authoritative full suite.
- `npm run validate:refinement` checks durable layout and interaction contracts without brittle pixel snapshots.
- `reports/historical-test-review.csv` maps each archived file to retained replacement coverage.

No production behavior was changed by this archival move.
