# Card layout audit

- Main cause: `.hub-preview-card-media` used a 4:3 frame while runtime previews are portrait 341×512 and `AssetImage` uses contain behavior.
- Secondary cause: printable compositions retain page margins; measured bounds are in `thumbnail-layout-audit.md`.
- “More ways to browse” and other text-only hub links use a two-column label/count row, but flexible wrapping and mixed label lengths can make counts appear detached. The next visual pass should use a consistent count column and grouped hierarchy, not pills or nested cards.
- Gallery and related-printable cards use the centralized WebP resolver; the printable detail page no longer silently scales a grid-sized preview to a full-page visual.
- No source artwork was cropped, moved, renamed, or rewritten.

Samples measured: 150. The detailed values are intentionally kept in the companion thumbnail report rather than duplicated here.
