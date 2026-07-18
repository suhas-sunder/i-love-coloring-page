# Printable content findings

## Pre-implementation finding

The single repeated template was `Print {display title} or download this coloring page as PNG, JPG, or WebP.` It originated in `src/lib/coloring/printableTitles.ts` and was reused as visible header copy, the meta description, Open Graph/Twitter description, and WebPage JSON-LD description across all 6,352 routes. It accurately named controls but added no artwork-specific context and claimed browser-conditional formats in server metadata.

## Implemented state

- Repeated generic printable template occurrences: 0
- Printable routes using provenance-backed concise summaries: 6,126
- Routes using structured details without a prose summary: 226
- Routes with unapproved audience/detail candidates requiring metadata review: 2,768
- Summary groups shared across unrelated records: 0
- Forbidden or unproven summary claims: 0
- Alt-text issues: 0

The implementation does not synthesize articles, age claims, educational claims, therapeutic claims, safety claims, licensing claims, or random wording.
