# Round 3B Output Spec

Generated: 2026-05-09

## Source Inputs

- Production exporters must consume the latest approved-source manifest, currently pipeline/manifests/round-3a1-approved-source-images.json or a later explicit replacement.
- Any source path in the latest blocked-source manifest, currently pipeline/manifests/round-3a1-blocked-source-images.json, must be excluded unless restored by a later explicit approval manifest.
- Warning images remain eligible when they are present in the approved-source manifest. Warning flags must be preserved in metadata and review sheets.
- Round 3B uses only pipeline/manifests/round-3a1-approved-production-dry-run-sample.json. It must not process the full approved corpus.

## Conversion Standard

- Preset: `line-thick` (Lineart - Thick)
- Wrapper: `pipeline/scripts/round-2-bakeoff.mjs#runSingleConversion`
- Parameters: `{"traceMode":"single","preprocess":"none","threshold":206,"turdSize":4,"optTolerance":0.44,"turnPolicy":"black"}`

## SVG Expectations

- Valid SVG with viewBox or width and height.
- Black or near-black linework on transparent or white background.
- Readable subject with no blank or overfilled output.
- Manageable file size and path count for gallery use.

## PNG Preview Expectations

- White-background PNG preview rendered from the SVG.
- Preview should match the normalized SVG bounds.
- Preview is for QA and thumbnails only, not the source of record.

## Thumbnail Expectations

- Readable PNG thumbnail generated from the preview.
- Stable path beside the preview under pipeline/production/dry-run/assets/thumbs/ for dry runs.

## Naming Convention

- Asset ID: `category-slug__source-slug__10-char-source-path-sha256`
- SVG path: `pipeline/production/dry-run/assets/svg/category-slug/source-slug-stableid.svg`
- PNG preview path: `pipeline/production/dry-run/assets/png/category-slug/source-slug-stableid.png`
- Thumbnail path: `pipeline/production/dry-run/assets/thumbs/category-slug/source-slug-stableid-thumb.png`
- Collision handling: Stable IDs derive from source path, not original filename alone. Duplicate filenames with different content produce unique output paths.

## Metadata Fields

- assetId
- sourceRelativePath
- originalCategory
- categorySlug
- titleCandidate
- filenameSlug
- svgPath
- pngPreviewPath
- thumbnailPath
- sourceDimensions
- outputDimensions
- file sizes
- presetPolicyUsed
- round3a1WarningFlags
- status

## Gallery Data Fields

- categories
- categorySlug
- categoryTitle
- imageCount
- sampleItemIds
- assetPaths
- altTextCandidate
- titleCandidate
- downloadAvailable
- printAvailable
- warningFlags
- indexablePerImageRoute=false

## Quarantine Criteria

- conversion_failed
- svg_missing
- svg_empty
- svg_tiny
- svg_not_parseable
- svg_missing_dimensions
- png_preview_missing
- png_preview_unreadable
- thumbnail_missing
- thumbnail_unreadable
- output_dimensions_invalid
- blank_or_nearly_blank_output
- overfilled_or_overly_dark_output
- excessive_svg_complexity
- too_noisy_or_speckled_heuristic
- output_extremely_large_relative_to_source
- metadata_failed

## Rerun Behavior

The dry run clears and rewrites only pipeline/production/dry-run generated folders, then writes deterministic asset paths and manifests. Source images are read-only.

## Manual Review Before Full Production

- Inspect before/after, category, quarantine, and warning contact sheets.
- Confirm line-thick output quality on human-adjacent and high-detail categories.
- Review any quarantined reasons and adjust thresholds or preset policy before a full approved-corpus export.
- Approve CDN/final asset storage policy before copying anything into a public web app.
