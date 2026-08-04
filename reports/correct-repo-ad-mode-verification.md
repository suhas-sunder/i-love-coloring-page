# Correct repository advertisement-mode verification

This record was updated on August 4, 2026, after the automatic advertising-mode correction. The verified repository now derives advertising behavior only from the standard Next.js runtime environment.

## Development and tests

- Mode: PLACEHOLDER by default
- AdSense script: absent
- 1440 by 900 homepage: one 728 by 90 header well
- 1920 by 1080 homepage: header plus 160 by 600 left and right rails, three visible labels total
- 390 by 844 homepage: one 320-wide post-hero well and no desktop rails
- 1440 by 900 printable: one header well; the principal content remained unobstructed
- Hydration and breakpoint behavior: stable, with no disappearing placeholder or horizontal overflow
- Evidence: `after/desktop-1440-ad-placeholder.png`, `after/desktop-1920-ad-placeholder.png`, `after/mobile-390x844-ad-placeholder.png`, and `after/desktop-1440-printable-ad-placeholder.png`
- Result: pass

## Production

- State: LIVE automatically when the centralized configuration is valid
- No project-specific advertising environment variable is read or required
- Duplicate initialization and route-transition slot checks: covered by the active advertisement suite
- Invalid configuration still resolves safely to OFF
- Result: live units render in production output; the external script is created once when the first eligible unit approaches the viewport
