# Round 1 Inventory Report

Generated: 2026-05-09

## Detected Folder Layout

- Workspace root: `.`
- I Love SVG repo: `ilovesvg`
- Source images folder: `images`
- Next.js app root: not detected in the outer workspace

The outer workspace currently contains source material and the nested I Love SVG repo. It does not currently contain a Next.js app root. The clean expected structure for a later app would keep `pipeline/` at the repository root, keep immutable sources in `images/`, and place any future Next.js app in the root or a clear `site/` directory with public assets copied only after preset policy and QA are locked.

## Image Inventory

- Total files under `images/`: 6810
- PNG images: 6799
- Categories: 29
- Non-PNG or missing-extension files: 11
- Likely unreadable or unrecognized files: 0
- Empty folders: 0
- Duplicate filename groups: 144

## Category Counts

| Category | PNG images | Nested folders | Hub candidate | Human-adjacent risk | Notes |
| --- | ---: | ---: | --- | --- | --- |
| animals | 100 | 0 | yes | no |  |
| Animals playing cards | 71 | 0 | yes | no |  |
| anime-girls | 950 | 1 | yes | yes | Higher-risk anatomy QA category. 1 non-PNG file(s) detected. |
| birds | 165 | 0 | yes | no |  |
| chibi | 935 | 0 | yes | yes | Higher-risk anatomy QA category. 1 non-PNG file(s) detected. |
| christmas | 101 | 0 | yes | no |  |
| dinosaurs | 68 | 0 | yes | no |  |
| dogs | 67 | 0 | yes | no |  |
| dragons | 22 | 0 | yes | no |  |
| emoji | 6 | 0 | no | no | Too small for a major public hub unless combined with a broader category. |
| fantasy | 567 | 0 | yes | yes | Higher-risk anatomy QA category. |
| flowers | 163 | 0 | yes | no |  |
| gardening | 82 | 0 | yes | no |  |
| holiday | 642 | 0 | yes | no |  |
| homes | 39 | 0 | yes | no |  |
| horror | 4 | 0 | no | yes | Higher-risk anatomy QA category. Too small for a major public hub unless combined with a broader category. |
| indoor-plants | 129 | 0 | yes | no |  |
| Insects | 113 | 0 | yes | no |  |
| mandala | 7 | 0 | no | no | Too small for a major public hub unless combined with a broader category. |
| mandala-geometry-patterns | 1458 | 0 | yes | no | 9 non-PNG file(s) detected. |
| midieval | 177 | 0 | yes | yes | Higher-risk anatomy QA category. |
| mythology | 265 | 0 | yes | yes | Higher-risk anatomy QA category. |
| Nature | 2 | 0 | no | no | Too small for a major public hub unless combined with a broader category. |
| plushie | 355 | 0 | yes | no |  |
| reptiles | 98 | 0 | yes | no |  |
| sea-life | 145 | 0 | yes | no |  |
| space | 1 | 0 | no | no | Too small for a major public hub unless combined with a broader category. |
| st-patricks-day | 20 | 0 | yes | no |  |
| world-landmarks | 47 | 0 | yes | no |  |

## Human-Adjacent And Higher-Risk Categories

- anime-girls: 950 PNG images
- chibi: 935 PNG images
- fantasy: 567 PNG images
- horror: 4 PNG images
- midieval: 177 PNG images
- mythology: 265 PNG images

These categories need stricter anatomy review in later rounds. Filename and folder metadata cannot catch warped hands, extra fingers, extra toes, extra limbs, or malformed humanoid details.

## Source File Anomalies

- Non-PNG files: `images/anime-girls/anime-girl-cowgirl`, `images/chibi/chibi-anime-girl-karate`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-bagel.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-bread-basket.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-eclair.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-fruit-tart.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-lemon-tart.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-macarons.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-pretzel.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-puff-pastry.jpeg`, `images/mandala-geometry-patterns/mandala-geometry-patterns-bakery-tart.jpeg`
- Unreadable or unrecognized files: none
- Duplicate filename groups: 144. See `pipeline/manifests/pipeline-assumptions.json` for examples.

## Existing Conversion System

The I Love SVG repo is a React Router app, not a standalone converter package. The relevant conversion stack found in round 1 is:

- Routes: PNG, line-art, drawing, scan, sketch, black-and-white, outline, and related converter routes under `ilovesvg/app/routes/`
- Shared server utilities: `serverFallback.server.ts`, `imagePreprocess.server.ts`, `potraceCompat.ts`, `svgLayerTrace.server.ts`, and `centerlineTrace.ts`
- Preset catalogs: route-local `PRESETS` arrays plus `TRACE_PRESET_ADDITIONS` and `STROKE_TRACE_PRESET_ADDITIONS`
- Dependencies: `sharp`, `potrace`, and `wasm_vtracer`
- Discovered scripts: `npm run test:trace-engine`, `npm run test:trace-quality`, `npm run test:hybrid-browser`, `npm run test:preset-performance`, `npm run typecheck`

Inventoried conversion presets: 328
Likely coloring-page candidates or useful bakeoff baselines: 223

## Single PNG Conversion Path

The existing app can convert one PNG through its route UI: run the I Love SVG server, open a route such as `/png-to-svg-converter`, `/line-art-to-svg-converter`, `/drawing-to-svg-converter`, `/scan-to-svg-converter`, or `/sketch-to-svg-converter`, upload one PNG, select a preset, and download the SVG.

Direct batch reuse is not clean yet. The conversion logic is embedded in route actions and client fetch behavior. A later wrapper should import the shared server utilities and selected preset settings directly, then write outputs under `pipeline/bakeoffs/` for small batches only.

## Proposed Round 2 Sample Strategy

- Proposed sample size: 250
- Include examples from every category.
- Oversample human-adjacent categories for anatomy QA.
- Include deterministic metadata signals for simple scenes, complex scenes, thin-line candidates, thick-line candidates, and high-detail candidates when detectable.
- Do not copy files in round 1. Round 2 should read `pipeline/manifests/sample-candidates.json` and write bakeoff outputs separately.

## Recommended Public Next.js Structure

Use hub and gallery pages:

- `/coloring-pages`
- `/coloring-pages/animals`
- `/coloring-pages/christmas`
- `/coloring-pages/<category>` for categories with enough quality content and clear intent
- Optional subhubs only when nested folders have enough content and distinct search intent

Do not create indexable pages per image. Individual images should become assets plus metadata records. A future coloring dashboard or mode should live separately from indexable SEO gallery pages.

## Risks And Assumptions

- Human and humanoid categories may contain anatomy defects that are not detectable from filenames or metadata.
- Duplicate filenames across categories require metadata-driven asset IDs before production export.
- Some folders are very small and should be merged into broader hubs unless content quality justifies a niche page.
- The I Love SVG repo is dirty. Reuse should avoid overwriting its current uncommitted work.
- The existing converter has no standalone batch CLI. Batch conversion should start with a small wrapper and a bakeoff batch only.

## Exact Round 2 Prompt Recommendation

```text
Round 2 only: using pipeline/manifests/sample-candidates.json, run a small conversion bakeoff on the proposed sample set. Do not process the full corpus. Do not write production assets. Use the I Love SVG conversion utilities through a small adapter if needed, test only a limited set of line-art, drawing, scan, and centerline presets, write outputs under pipeline/bakeoffs, and create conversion plus anatomy review manifests under pipeline/review. Compare output quality for clean coloring-page use without choosing a final production preset yet.
```
