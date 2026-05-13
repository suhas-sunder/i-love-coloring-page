# Round 3A.1 Rejection Guard Report

Generated: 2026-05-09

- Guard limit for new non-Round 2 rejections: 500
- Actual new non-Round 2 rejections: 105
- Diagnostic-failure mode triggered: no

## Rule Attribution

| Item | Count |
| --- | ---: |
| round2_flagged_conversion_or_anatomy | 139 |
| duplicate_image_exact_content | 90 |
| non_png | 11 |
| over_dense_detail_severe | 3 |
| poor_coloring_page_fit_clear | 3 |
| tangled_linework_severe | 1 |

The corrected run stayed under the guard when `diagnostic-failure mode triggered` is no. If this flips to yes in a future run, do not consume approved/blocked outputs for production planning until the spike is diagnosed.
