# Round 3C Production Export Report

Generated: 2026-05-09

## Inputs

- Approved manifest used: `pipeline/manifests/round-3a1-approved-source-images.json`
- Blocked manifest used: `pipeline/manifests/round-3a1-blocked-source-images.json`
- Warning manifest used: `pipeline/manifests/round-3a1-warning-source-images.json`
- Round 3B output spec used: `pipeline/manifests/round-3b-production-output-spec.json`

## Conversion Policy

- Recommendation type: `single_default_preset`
- Preset used: `line-thick` (Lineart - Thick)
- Reusable conversion path: `pipeline/scripts/round-2-bakeoff.mjs#runSingleConversion`
- Underlying I Love SVG path: `ilovesvg/app/shared/tracing/serverFallback.server.ts`
- Underlying functions: `runSharedRasterNormalization()`, `runSharedPotraceSvgTrace()`, `annotateSharedSingleTraceSvg()`, `applyTraceSvgOutputSettings()`

## Results

- Total approved requested: 6566
- Processed: 6566
- Passed: 6557
- Quarantined: 9
- Skipped: 0
- Warning-image count: 5345

## Pass And Quarantine Counts By Category

| Category | Requested | Passed | Quarantined | Skipped | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: |
| animals | 31 | 31 | 0 | 0 | 31 |
| Animals playing cards | 71 | 71 | 0 | 0 | 69 |
| anime-girls | 909 | 903 | 6 | 0 | 909 |
| birds | 165 | 165 | 0 | 0 | 25 |
| chibi | 898 | 898 | 0 | 0 | 898 |
| christmas | 101 | 101 | 0 | 0 | 16 |
| dinosaurs | 68 | 68 | 0 | 0 | 2 |
| dogs | 67 | 67 | 0 | 0 | 0 |
| dragons | 18 | 18 | 0 | 0 | 15 |
| emoji | 6 | 6 | 0 | 0 | 0 |
| fantasy | 528 | 528 | 0 | 0 | 528 |
| flowers | 163 | 163 | 0 | 0 | 163 |
| gardening | 80 | 80 | 0 | 0 | 21 |
| holiday | 642 | 642 | 0 | 0 | 642 |
| homes | 39 | 39 | 0 | 0 | 4 |
| horror | 3 | 3 | 0 | 0 | 3 |
| indoor-plants | 129 | 129 | 0 | 0 | 42 |
| Insects | 112 | 111 | 1 | 0 | 31 |
| mandala | 6 | 6 | 0 | 0 | 3 |
| mandala-geometry-patterns | 1455 | 1453 | 2 | 0 | 1455 |
| midieval | 161 | 161 | 0 | 0 | 161 |
| mythology | 246 | 246 | 0 | 0 | 246 |
| Nature | 2 | 2 | 0 | 0 | 0 |
| plushie | 355 | 355 | 0 | 0 | 39 |
| reptiles | 98 | 98 | 0 | 0 | 20 |
| sea-life | 145 | 145 | 0 | 0 | 13 |
| space | 1 | 1 | 0 | 0 | 0 |
| st-patricks-day | 20 | 20 | 0 | 0 | 2 |
| world-landmarks | 47 | 47 | 0 | 0 | 7 |

## Top Quarantine Reasons

- overfilled_or_blobbed_output: 6
- overfilled_or_overly_dark_output: 6
- excessive_svg_complexity: 4

## Output Folder Structure

- `pipeline/production/full/assets/svg/`
- `pipeline/production/full/assets/png/`
- `pipeline/production/full/assets/thumbs/`
- `pipeline/production/full/manifests/`
- `pipeline/production/full/reports/`
- `pipeline/production/full/logs/`
- `pipeline/production/full/quarantine/`
- `pipeline/production/full/review/contact-sheets/`
- `pipeline/production/full/review/category-sheets/`
- `pipeline/production/full/review/warning-sheets/`
- `pipeline/production/full/review/quarantine-sheets/`
- `pipeline/production/full/review/sample-sheets/`

## Asset Naming Convention

`category-slug/source-slug-stableid.svg`, `category-slug/source-slug-stableid.png`, and `category-slug/source-slug-stableid-thumb.png`, with stable IDs derived from source path instead of filename alone.

## Gallery Data Structure

- Category data: `pipeline/manifests/round-3c-production-category-data.json`
- Gallery data: `pipeline/manifests/round-3c-production-gallery-data.json`
- Successful asset metadata: `pipeline/manifests/round-3c-production-assets.json`
- Categories emitted: 29
- Assets emitted: 6557

## Website Build Readiness

The production export is ready as a data and asset input for a Round 4 website build if the local review sheets are accepted. Generated assets remain local and ignored. Round 4 should decide the public/CDN asset strategy before copying anything into a web app public folder.

## Exact Rerun Commands

```powershell
node --test pipeline\tests\round-3c-production-export.test.mjs
node pipeline\scripts\round-3c-production-export.mjs --batch-size 250 --resume
```
