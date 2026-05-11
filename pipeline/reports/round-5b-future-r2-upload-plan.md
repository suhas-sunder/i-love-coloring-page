# Round 5B Future R2 Upload Plan

Final planned folders:

- svg/
- webp/

Excluded from the final upload plan unless a later blocker reverses this:

- png/
- thumbs/

Expected object keys:

- `coloring-pages/svg/<category>/<filename>.svg`
- `coloring-pages/webp/<category>/<filename>.webp`

- Planned files: 13,114
- Planned bytes: 2.0 GB
- SVG internal-only: true
- WebP gallery preview format: true
- Full upload deferred: true

User-facing PNG, JPG, and WebP downloads should be generated on demand from the internal SVG once production CORS is verified. SVG must not be exposed as a direct user download.
