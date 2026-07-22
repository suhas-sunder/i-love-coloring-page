# Final test results

Validation date: 2026-07-21

## Final results

| Check | Result |
| --- | --- |
| Repository formatter command | Not configured |
| Repository lint command | Not configured |
| `git diff --check` | Pass |
| TypeScript | Pass |
| Active tests | 147 pass, 0 fail |
| Strict site-quality validation | Pass |
| Title-formatting audit | Pass: 6,352 titles and 138 variant labels |
| Payload budget | Pass |
| Canonical static-route validation | Pass |
| Accessibility validator | Pass |
| Export safety | Pass: 69,557 files scanned, zero findings |
| Image-sitemap validation | Pass |
| Crawl/indexation validation | Pass |
| Public layout validation | Pass |
| Refinement contracts | Pass |
| Production build | Pass |
| Static generation | Pass: 6,920 pages |
| Punctuation source/export | Pass: zero findings |
| Production-readiness verifier | Expected BLOCKED: technical pass, seven external/legal/account gates |

The ordinary suite was run using the exact file list from `npm test` with Node directly after the npm wrapper produced an empty-output Windows launch transient. Discovery was unchanged, and historical disabled snapshots were not included.

## Windows file-write stability

Two generated-report writers encountered temporary Windows `UNKNOWN` file-open errors after successful scans. They now use bounded retries only for `UNKNOWN`, `EBUSY`, `EPERM`, and `EACCES`. All other errors still fail immediately. The final full build then completed successfully, including readiness generation and punctuation enforcement.

The readiness determinism test also retries only empty-output child-process launch failures. A diagnostic-bearing generator error still fails immediately. Final result: all 147 active tests pass.

## Preserved baseline

- Hubs: 163
- Retain/index hubs: 160
- Public/noindex hubs: 3
- Printable routes: 6,352
- Static outputs: 6,920
- Exact duplicate hub groups: 0
- Near-duplicate hub pairs: 4
- Count inconsistencies: 0
- Repeated hub content: 0
- Generic printable templates: 0
- Provenance-backed summaries: 6,126
- Structured-details-only pages: 226
- Unique display titles: 6,352
- Public title safety findings: 0
- Metadata candidates promoted automatically: 0
- Metadata export leaks: 0

## Ad and public-file result

- Ad mode: OFF
- Ad scripts: 0
- Ad slots/placeholders in OFF output: 0
- `out/ads.txt`: absent
- `out/favicon.ico`: absent
- `out/icon.svg`: present
- Generated robots: present with both sitemaps
