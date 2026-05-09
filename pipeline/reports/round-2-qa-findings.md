# Round 2 QA Findings

Generated: 2026-05-09

## Flagged Images

- Total flagged for manual review: 139
- Policy preset: `line-thick`
- Heuristic flags only: yes

| Category | Flagged images |
| --- | ---: |
| anime-girls | 37 |
| chibi | 36 |
| fantasy | 28 |
| gardening | 1 |
| horror | 1 |
| mandala | 1 |
| midieval | 16 |
| mythology | 19 |

## Anatomy Review Limits

This workflow does not claim reliable anatomy detection. Human-adjacent images are queued for manual review.

All human-adjacent images remain manual-review items even when conversion metrics look acceptable.

## Production Output Spec

- Default preset: `line-thick`
- SVG: Valid SVG with viewBox or width and height. Black or near-black linework on transparent or white background. Readable subject with no blank or overfilled output. Manageable file size and path count for gallery use.
- PNG preview: White-background PNG preview rendered from the SVG. Preview should match the normalized SVG bounds. Preview is for QA and thumbnails only, not the source of record.
- Naming: Use deterministic IDs derived from category, original filename, and short source-path hash.
- Metadata: Store category, sourceRelativePath, presetId, conversion status, metrics, flags, review status, and CDN asset paths.
- Quarantine criteria: render_failed, blank_or_missing_subject, overfilled_or_blobbed_output, excessive_svg_complexity, human-adjacent images lacking manual signoff
- Manual review triggers: human-adjacent category, conversion flags, low Stage B quality score, duplicate filename collision
