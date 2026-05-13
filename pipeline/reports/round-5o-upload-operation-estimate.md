# Round 5O Upload Operation Estimate

- PutObject operations for full execute: 12704
- HeadObject operations if `--skip-existing` is used: 12704
- Upload source: optimized
- Upload source root: pipeline/r2-upload-optimized/coloring-pages
- Total upload bytes: 1495772065
- Expected storage GB: 1.496
- Class A estimate: 12704
- Class B estimate: 12704
- Delete operations: 0

Review the dry-run first. A `--limit 10` smoke upload can be useful only if the owner explicitly chooses it. No delete operation is included.
