# Round 3A Approved-Only Production Dry-Run Plan

Generated: 2026-05-09

## Purpose

Prepare the next round without processing the full corpus.

## Inputs

- Approved source manifest: `pipeline/manifests/round-3a-approved-source-images.json`
- Dry-run sample manifest: `pipeline/manifests/round-3a-approved-production-dry-run-sample.json`
- Conversion policy: `line-thick`

## Dry-Run Sample

- Target size: 125
- Actual size: 125
- Uses only approved source paths: yes
- Includes Round 2 flagged paths: no
- Includes Round 3A rejected paths: no

## Next Command Pattern

```powershell
node --test pipeline\tests\round-3a-source-qa.test.mjs
node pipeline\scripts\round-3a-source-qa.mjs
```

The next round should add a production dry-run exporter that reads `pipeline/manifests/round-3a-approved-production-dry-run-sample.json` directly. It should not reuse Round 2 sample selection for production inputs.
