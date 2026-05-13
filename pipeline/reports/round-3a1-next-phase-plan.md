# Round 3A.1 Next Phase Plan

Generated: 2026-05-09

## Current Inputs For Round 3B

- Approved source manifest: `pipeline/manifests/round-3a1-approved-source-images.json`
- Blocked source manifest: `pipeline/manifests/round-3a1-blocked-source-images.json`
- Warning source manifest: `pipeline/manifests/round-3a1-warning-source-images.json`
- Dry-run sample: `pipeline/manifests/round-3a1-approved-production-dry-run-sample.json`
- Conversion preset policy: `line-thick`

## Recommendation

Round 3B is ready only for an approved-only dry run. It should convert the 125-image dry-run sample using `line-thick`, write final-format candidate assets outside the Next.js public folder, and produce pass/fail/quarantine QA manifests. It must not process the full approved corpus yet.
