# Round 2 Bakeoff Report

Generated: 2026-05-09

## Current State Confirmed

- PNG source images: 6799
- Total files under images: 6810
- Categories: 29
- Human-adjacent categories: anime-girls, chibi, fantasy, horror, midieval, mythology
- Duplicate filename groups: 144
- No Next.js app root detected yet.

## Reusable I Love SVG Entrypoints

The wrapper uses the real I Love SVG conversion modules through a Node import hook that resolves the repo's TypeScript files and `~/` path aliases:

- `ilovesvg/app/shared/tracing/serverFallback.server.ts`
- `runSharedRasterNormalization()`, backed by `ilovesvg/app/utils/imagePreprocess.server.ts`
- `runSharedPotraceSvgTrace()`, backed by `ilovesvg/app/utils/potraceCompat.ts`
- `annotateSharedSingleTraceSvg()`, backed by `ilovesvg/app/utils/svgLayerTrace.server.ts`
- `traceCenterlineRasterToSvg()` from `ilovesvg/app/shared/tracing/centerlineTrace.ts`
- `applyTraceSvgOutputSettings()` from `ilovesvg/app/utils/converterSettings.server.ts`

No source image files and no files inside `ilovesvg/` were modified.

## Sample And Presets

- Round 2 sample size: 250
- Calibration subset size: 40
- Preset shortlist size: 12
- Presets advanced to Stage B: 3
- Stage B preset IDs: drawing-bold-strokes, line-thick, line-low-noise

## Stage A Calibration

| Preset | Success | Avg score | Printable rate | Avg ink | Avg SVG bytes | Flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| drawing-bold-strokes | 40/40 | 99.55 | 1 | 0.19375 | 253274 | heavy_ink_coverage:1 |
| line-thick | 40/40 | 99.55 | 1 | 0.19548 | 253456 | heavy_ink_coverage:1 |
| line-low-noise | 40/40 | 99.1 | 1 | 0.20668 | 235971 | heavy_ink_coverage:2 |
| drawing-smooth-ink | 40/40 | 99.1 | 1 | 0.19931 | 241094 | heavy_ink_coverage:2 |
| line-smooth | 40/40 | 99.1 | 1 | 0.20406 | 242758 | heavy_ink_coverage:2 |
| scan-ink-cleanup | 40/40 | 99.1 | 1 | 0.20859 | 247462 | heavy_ink_coverage:2 |
| line-clean | 40/40 | 99.1 | 1 | 0.20889 | 259821 | heavy_ink_coverage:2 |
| drawing-ink | 40/40 | 99.1 | 1 | 0.20147 | 265500 | heavy_ink_coverage:2 |
| scan-fine-marks | 40/40 | 99.1 | 1 | 0.21976 | 281675 | heavy_ink_coverage:2 |
| line-sharp | 40/40 | 98.85 | 1 | 0.21412 | 293403 | heavy_ink_coverage:2, high_svg_complexity:1 |
| line-thin | 40/40 | 98.65 | 1 | 0.22423 | 293099 | heavy_ink_coverage:3 |
| sketch-clean-lines | 40/40 | 90.7 | 0.95 | 0.35527 | 237505 | heavy_ink_coverage:16, overfilled_or_blobbed_output:2 |

## Stage B Main Bakeoff

| Preset | Success | Avg score | Printable rate | Avg ink | Avg SVG bytes | Flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| line-thick | 250/250 | 99.46 | 0.996 | 0.20172 | 299297 | excessive_svg_complexity:1, heavy_ink_coverage:4, high_svg_complexity:4 |
| drawing-bold-strokes | 250/250 | 99.44 | 0.992 | 0.19989 | 299981 | excessive_svg_complexity:2, heavy_ink_coverage:4, high_svg_complexity:2 |
| line-low-noise | 250/250 | 99.25 | 0.996 | 0.2141 | 272769 | heavy_ink_coverage:7, high_svg_complexity:2, overfilled_or_blobbed_output:1 |

## Recommended Policy

- Recommendation type: single_default_preset
- Default preset: `line-thick` (Lineart - Thick)
- Reason: Highest Stage B aggregate score with successful render rate and manageable complexity.

- No conditional preset rule beat the default by the configured margin.

## Review Artifacts

- `pipeline/review/conversion/stage-a-calibration-comparison.html`
- `pipeline/review/conversion/stage-b-winning-preset-comparison.html`
- `pipeline/review/anatomy/human-adjacent-review.html`
- `pipeline/review/manual-signoff/round-2-flagged-signoff.html`

These files are local review artifacts and are intentionally ignored by Git.

## Rerun Commands

```powershell
node --test pipeline\tests\round-2-bakeoff.test.mjs
node pipeline\scripts\round-2-bakeoff.mjs --sample-size 250 --calibration-size 40 --shortlist-size 12 --advanced-count 3
```
