# Round 5B WebP Quality Policy

- Target use: gallery-preview-only
- Target dimensions: match current PNG preview dimensions, typically 341x512
- Quality: 82
- Mode: lossy
- Fallback behavior: Use WebP first when available, then PNG preview, then thumbnail as the last display fallback.

WebP previews are not print sources, not source-of-truth files, and not direct user download sources. SVG remains the internal source of truth.
