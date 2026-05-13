# Round 3A.1 Correction Report

Generated: 2026-05-09

## What Went Wrong In Round 3A

Round 3A treated high-risk category membership as a blocking condition. The old script added the legacy uncertainty rejection reason to every human-adjacent source path, blocked duplicate filenames, and treated moderate density or clutter metrics as rejection-level failures. That produced zero approved images in high-value human-adjacent categories.

## Logic Changed

- Category membership now creates warning flags and review priority only.
- Human-adjacent and high-value categories remain eligible when the individual image has no concrete blocking defect.
- Duplicate filenames are warning-only because deterministic output IDs include category and source-path hash.
- Same-name images with different content are kept and assigned collision-safe recommended output IDs.
- Exact duplicate image content is blocked for the duplicate copy only, while the canonical source path stays eligible.
- Moderate density, complexity, and border contact are warning-only.
- Only Round 2 flags, unreadable/non-PNG files, missing/changed files, and severe image-specific failures block an image.
- New non-Round 2 rejection counts above 500 trigger diagnostic-failure mode.

## Counts

- Old Round 3A approved count: 3020
- Old Round 3A blocked count: 3790
- Corrected Round 3A.1 approved count: 6566
- Corrected Round 3A.1 blocked count: 244
- Corrected Round 3A.1 new rejection count excluding Round 2 blocked images: 105
- Rejection count stayed under 500: yes
- Diagnostic-failure mode triggered: no
- Warning count: 5345
- Warning-only and still approved: 5345
- Restored from old Round 3A blocked list: 3553
- Round 2 flagged paths still blocked: 139

## High-Risk Category Counts

| Category | Approved | Warnings | Blocked |
| --- | ---: | ---: | ---: |
| anime-girls | 909 | 909 | 42 |
| chibi | 898 | 898 | 38 |
| fantasy | 528 | 528 | 39 |
| horror | 3 | 3 | 1 |
| midieval | 161 | 161 | 16 |
| mythology | 246 | 246 | 19 |

## Top Concrete Rejection Reasons

| Item | Count |
| --- | ---: |
| round2_flagged_conversion_or_anatomy | 139 |
| duplicate_image_exact_content | 90 |
| non_png | 11 |
| over_dense_detail_severe | 3 |
| poor_coloring_page_fit_clear | 3 |
| tangled_linework_severe | 1 |

## Top Warning Reasons

| Item | Count |
| --- | ---: |
| soft_warning_category_high_value_spot_check | 5036 |
| soft_warning_restored_from_round_3a_blocked | 3553 |
| soft_warning_human_adjacent | 2797 |
| soft_warning_needs_spot_check | 2797 |
| soft_warning_high_detail | 1612 |
| soft_warning_possible_complexity | 1612 |
| soft_warning_duplicate_filename_collision_handled | 214 |
| soft_warning_border_margin_review | 1 |

## Wholesale Category Rejection Check

No category is rejected solely because of folder name. High-risk category membership appears only in warning metadata and review artifacts.

## Rerun Commands

```powershell
node --test pipeline\tests\round-3a1-source-qa.test.mjs
node pipeline\scripts\round-3a1-source-qa.mjs
```
