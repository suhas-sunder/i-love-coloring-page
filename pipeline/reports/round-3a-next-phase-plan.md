# Round 3A Next Phase Plan

Generated: 2026-05-09

## Current Gate

- Approved-source manifest: `pipeline/manifests/round-3a-approved-source-images.json`
- Blocked-source manifest: `pipeline/manifests/round-3a-blocked-source-images.json`
- Future conversion preset policy: `line-thick`

## Round 3B Recommendation

Use only `pipeline/manifests/round-3a-approved-source-images.json`. Run a small approved-only production dry run using the `line-thick` policy and the dry-run sample in `pipeline/manifests/round-3a-approved-production-dry-run-sample.json`. Generate final-format SVG and PNG preview candidates only for that sample, write outputs outside the Next.js public folder, and produce QA manifests for pass/fail/quarantine decisions.

Do not process the full approved corpus until the dry-run output spec, CDN path policy, and review thresholds are approved.
