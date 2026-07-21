# Correct repository legacy-test verification

The archive contains a README plus 27 `.mjs.disabled` historical tests under `pipeline/tests/historical/`.

- `npm test` names its active test files explicitly and does not include the archive.
- Node test discovery does not treat `.mjs.disabled` files as tests.
- The repository has no `.github/` CI workflow or `.vscode/` test-discovery configuration that adds the archive.
- No supported package command intentionally runs the disabled files.
- The archive README states that the files are non-authoritative audit evidence.
- `reports/historical-test-review.csv` maps each former assertion to current behavioral coverage.
- Active replacement suites cover rendering, navigation, search, advertisements, accessibility, canonical routing, payload, and refinement contracts.

Result: pass. The obsolete snapshots remain archived and were not restored.
