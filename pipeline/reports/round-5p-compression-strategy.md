# Round 5P Compression Strategy

Compression is conservative and deterministic. SVG remains the source of truth for print, download conversion, and future coloring/editing. WebP optimization is preview-only.

Risky SVG changes are disabled: removeViewBox, aggressive cleanupIds, mergePaths, aggressive convertPathData, and style-altering cleanup. Byte savings must not override visual correctness.

Fallback strategy: if optimized output is larger, fails validation, or raises visual risk, the optimized bundle receives the original clean file for that asset.
