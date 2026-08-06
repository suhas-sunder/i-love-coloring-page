# Correct repository advertisement coordination verification

This record is superseded by `reports/2026-08-ad-fill-fallback-implementation.md`. The repository now uses the same real-unit markup and runtime in every build context; no runtime environment selects advertising behavior.

## Historical development-placeholder evidence

- Mode: PLACEHOLDER by default
- AdSense script: absent
- 1440 by 900 homepage: one 728 by 90 header well
- 1920 by 1080 homepage: header plus 160 by 600 left and right rails, three visible labels total
- 390 by 844 homepage: one 320-wide post-hero well and no desktop rails
- 1440 by 900 printable: one header well; the principal content remained unobstructed
- Hydration and breakpoint behavior: stable, with no disappearing placeholder or horizontal overflow
- Evidence: `after/desktop-1440-ad-placeholder.png`, `after/desktop-1920-ad-placeholder.png`, `after/mobile-390x844-ad-placeholder.png`, and `after/desktop-1440-printable-ad-placeholder.png`
- Result: pass

## Current architecture

- Eligible pages render configured real units and initially hidden fallback siblings.
- The script is inserted once when the first eligible unit approaches the viewport.
- Page state is `pending`, `fallback`, or `adsense-present`.
- Official `filled` or `unfill-optimized` status hides every fallback only when a visible non-zero Google-managed surface is also present; raw or empty status results do not falsely claim a loaded ad.
- Duplicate initialization and route-transition cleanup are covered by the active advertisement suite.
- No environment variable or runtime environment selects the path.
