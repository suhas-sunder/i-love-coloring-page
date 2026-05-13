# Round 5O Upload Operation Estimate

- PutObject operations for full execute: 12704
- HeadObject operations if `--skip-existing` is used: 12704
- Total upload bytes: 2089425709
- Expected storage GB: 2.089
- Class A estimate: 12704
- Class B estimate: 12704
- Delete operations: 0

Review the dry-run first. A `--limit 10` smoke upload can be useful only if the owner explicitly chooses it. No delete operation is included.
