# Round 5F Asset Strategy Report

- Public asset base tested: true
- Public base type: r2.dev
- SVG URL verification passed: true
- WebP URL verification passed: true
- SVG content type correct: true
- WebP content type correct: true
- SVG CORS passed: false
- Browser canvas export passed: false
- WebP gallery public rendering passed: true
- Print conversion ready on public base: false
- Current public download formats: PNG
- SVG internal only: true
- JPG/JPEG/WebP controls remain deferred: true
- Final upload model: svg-plus-webp-only
- Full upload deferred: true

## Decisions

- Keep SVG internal-only and public-addressable only for app internals.
- Keep WebP as the gallery preview format.
- Keep public downloads PNG-only in this round.
- Do not expose JPG, JPEG, or WebP download controls until public SVG CORS and browser canvas export pass and the owner approves the UI change.
- Keep the final full upload plan SVG + WebP only.

## Blockers

- SVG CORS did not pass for every uploaded test SVG. Canvas conversion must remain gated.
- Browser canvas export has not passed against the public SVG + WebP test base.


## Recommendation

Round 5G should configure R2/custom-domain CORS for SVG responses, then rerun browser canvas conversion and print QA before exposing JPG/JPEG/WebP controls.
