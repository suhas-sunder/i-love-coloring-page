# Round 3B Production Dry Run Report

Generated: 2026-05-09

## Inputs

- Approved manifest used: `pipeline/manifests/round-3a1-approved-source-images.json`
- Blocked manifest used: `pipeline/manifests/round-3a1-blocked-source-images.json`
- Warning manifest used: `pipeline/manifests/round-3a1-warning-source-images.json`
- Dry-run sample manifest used: `pipeline/manifests/round-3a1-approved-production-dry-run-sample.json`
- Input sample size: 125
- Approved source count: 6566
- Blocked source count: 244
- Warning source count: 5345

## Conversion Policy

- Recommendation type: `single_default_preset`
- Preset used: `line-thick` (Lineart - Thick)
- Reusable conversion path: `pipeline/scripts/round-2-bakeoff.mjs#runSingleConversion`
- Underlying I Love SVG path: `ilovesvg/app/shared/tracing/serverFallback.server.ts`
- Underlying functions: `runSharedRasterNormalization()`, `runSharedPotraceSvgTrace()`, `annotateSharedSingleTraceSvg()`, `applyTraceSvgOutputSettings()`

## Output Folder Structure

- `pipeline/production/dry-run/assets/svg/`
- `pipeline/production/dry-run/assets/png/`
- `pipeline/production/dry-run/assets/thumbs/`
- `pipeline/production/dry-run/manifests/`
- `pipeline/production/dry-run/reports/`
- `pipeline/production/dry-run/logs/`
- `pipeline/production/dry-run/quarantine/`
- `pipeline/production/dry-run/review/contact-sheets/`
- `pipeline/production/dry-run/review/category-sheets/`
- `pipeline/production/dry-run/review/quarantine-sheets/`

## Results

- Requested: 125
- Processed: 125
- Passed: 125
- Quarantined: 0
- Skipped: 0
- Warning-image count: 83

## Pass And Quarantine Counts By Category

| Category | Requested | Passed | Quarantined | Skipped | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: |
| animals | 1 | 1 | 0 | 0 | 1 |
| Animals playing cards | 11 | 11 | 0 | 0 | 9 |
| anime-girls | 12 | 12 | 0 | 0 | 12 |
| birds | 4 | 4 | 0 | 0 | 0 |
| chibi | 12 | 12 | 0 | 0 | 12 |
| christmas | 3 | 3 | 0 | 0 | 0 |
| dinosaurs | 2 | 2 | 0 | 0 | 0 |
| dogs | 2 | 2 | 0 | 0 | 0 |
| dragons | 1 | 1 | 0 | 0 | 0 |
| emoji | 1 | 1 | 0 | 0 | 0 |
| fantasy | 9 | 9 | 0 | 0 | 9 |
| flowers | 4 | 4 | 0 | 0 | 4 |
| gardening | 2 | 2 | 0 | 0 | 0 |
| holiday | 10 | 10 | 0 | 0 | 10 |
| homes | 1 | 1 | 0 | 0 | 0 |
| horror | 1 | 1 | 0 | 0 | 1 |
| indoor-plants | 3 | 3 | 0 | 0 | 0 |
| Insects | 3 | 3 | 0 | 0 | 0 |
| mandala | 1 | 1 | 0 | 0 | 0 |
| mandala-geometry-patterns | 16 | 16 | 0 | 0 | 16 |
| midieval | 4 | 4 | 0 | 0 | 4 |
| mythology | 5 | 5 | 0 | 0 | 5 |
| Nature | 1 | 1 | 0 | 0 | 0 |
| plushie | 6 | 6 | 0 | 0 | 0 |
| reptiles | 3 | 3 | 0 | 0 | 0 |
| sea-life | 3 | 3 | 0 | 0 | 0 |
| space | 1 | 1 | 0 | 0 | 0 |
| st-patricks-day | 1 | 1 | 0 | 0 | 0 |
| world-landmarks | 2 | 2 | 0 | 0 | 0 |

## Top Quarantine Reasons

- None

## Representative Output Examples

- animals__animals-butterflies__016ffbb0de: `pipeline/production/dry-run/assets/svg/animals/animals-butterflies-016ffbb0de.svg`, `pipeline/production/dry-run/assets/png/animals/animals-butterflies-016ffbb0de.png`, `pipeline/production/dry-run/assets/thumbs/animals/animals-butterflies-016ffbb0de-thumb.png`
- animals-playing-cards__animals-armadillo__1a6eaccdef: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-armadillo-1a6eaccdef.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-armadillo-1a6eaccdef.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-armadillo-1a6eaccdef-thumb.png`
- animals-playing-cards__animals-armadillos__50db4716e5: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-armadillos-50db4716e5.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-armadillos-50db4716e5.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-armadillos-50db4716e5-thumb.png`
- animals-playing-cards__animals-armadillos-wildlife__f2912c1ad5: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-armadillos-wildlife-f2912c1ad5.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-armadillos-wildlife-f2912c1ad5.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-armadillos-wildlife-f2912c1ad5-thumb.png`
- animals-playing-cards__animals-baboon__3019f9ef3d: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-baboon-3019f9ef3d.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-baboon-3019f9ef3d.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-baboon-3019f9ef3d-thumb.png`
- animals-playing-cards__animals-baboons__5f19666c69: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-baboons-5f19666c69.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-baboons-5f19666c69.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-baboons-5f19666c69-thumb.png`
- animals-playing-cards__animals-baboons-hanging__398854ec28: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-baboons-hanging-398854ec28.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-baboons-hanging-398854ec28.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-baboons-hanging-398854ec28-thumb.png`
- animals-playing-cards__animals-badger__46333741c3: `pipeline/production/dry-run/assets/svg/animals-playing-cards/animals-badger-46333741c3.svg`, `pipeline/production/dry-run/assets/png/animals-playing-cards/animals-badger-46333741c3.png`, `pipeline/production/dry-run/assets/thumbs/animals-playing-cards/animals-badger-46333741c3-thumb.png`

## Quality Readiness

This dry-run gate is automated and intentionally limited. It validates parseability, dimensions, preview readability, simple blank/overfilled heuristics, complexity, and deterministic metadata. It does not replace human aesthetic or anatomy review.

Recommendation: the sample passed the automated dry-run gate, but contact sheets still need human review before full-corpus export.

## Review Artifacts

- `pipeline/production/dry-run/review/contact-sheets/round-3b-before-after.html`
- `pipeline/production/dry-run/review/contact-sheets/round-3b-pass-fail.html`
- `pipeline/production/dry-run/review/contact-sheets/round-3b-warning-images.html`
- `pipeline/production/dry-run/review/category-sheets/`
- `pipeline/production/dry-run/review/quarantine-sheets/round-3b-quarantine.html`

## Exact Rerun Commands

```powershell
node --test pipeline\tests\round-3b-production-dry-run.test.mjs
node pipeline\scripts\round-3b-production-dry-run.mjs
```

## Round 3C Recommendation

Round 3C can be drafted after human review of the dry-run contact sheets. The full export should still process only the approved manifest, exclude the blocked manifest, preserve warnings, and keep generated assets outside the Next.js public folder until the asset policy is approved.
