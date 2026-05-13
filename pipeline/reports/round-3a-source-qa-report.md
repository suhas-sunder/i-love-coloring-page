# Round 3A Source QA Report

Generated: 2026-05-09

## Summary

- Total source PNGs considered: 6799
- Round 2 blocked count: 139
- New Round 3A rejected count: 3651
- Final approved candidate count: 3020
- Approved dry-run sample size: 125
- Default future conversion policy: `line-thick`

## Gate Rule

Future production, export, gallery, sitemap, and metadata scripts must consume `pipeline/manifests/round-3a-approved-source-images.json` or a later approved-source manifest. They must not directly use the raw source image folder for production-style inputs.

## Rejected Counts By Category

| Category | Rejected |
| --- | ---: |
| anime-girls | 951 |
| chibi | 936 |
| fantasy | 567 |
| mandala-geometry-patterns | 313 |
| mythology | 265 |
| midieval | 177 |
| holiday | 134 |
| animals | 71 |
| Animals playing cards | 69 |
| flowers | 61 |
| indoor-plants | 40 |
| plushie | 39 |
| Insects | 31 |
| birds | 25 |
| gardening | 23 |
| reptiles | 20 |
| christmas | 16 |
| dragons | 16 |
| sea-life | 13 |
| world-landmarks | 7 |
| homes | 4 |
| horror | 4 |
| mandala | 4 |
| dinosaurs | 2 |
| st-patricks-day | 2 |

## Rejected Counts By Reason Code

| Reason code | Count |
| --- | ---: |
| manual_review_uncertain_reject_for_now | 2952 |
| over_dense_detail | 1558 |
| tangled_linework | 1381 |
| duplicate_filename_review | 288 |
| poor_coloring_page_fit | 238 |
| awkward_crop | 233 |
| round2_flagged_conversion_or_anatomy | 139 |
| non_png | 11 |

## High-Risk Category Handling

Human-adjacent categories are blocked for now because this round does not include manual anatomy review. High-risk categories: anime-girls, chibi, fantasy, horror, midieval, mythology.

- High-risk rejected images: 2952
- High-risk approved images: 0

## Examples Of Rejection Logic

- Round 2 flagged paths are blocked with `round2_flagged_conversion_or_anatomy`.
- Human-adjacent paths are blocked with `manual_review_uncertain_reject_for_now`.
- Duplicate filenames are blocked with `duplicate_filename_review`.
- Dense or cluttered line art is blocked with `over_dense_detail`, `tangled_linework`, or `poor_coloring_page_fit`.
- Crop and margin risks are blocked with `awkward_crop` and `subject_too_close_to_edge`.

## Limitations

This is a conservative automated sweep, not a perfect anatomy detector. It cannot reliably identify extra fingers, malformed hands, broken joints, strange mouths, or subtle AI-art errors. Anything uncertain is rejected for now and must be restored only by a future explicit approval/update manifest.

## Exact Commands

```powershell
node --test pipeline\tests\round-3a-source-qa.test.mjs
node pipeline\scripts\round-3a-source-qa.mjs
```
