# Correct repository advertisement-mode verification

The checks used separately built static exports from the verified repository. The final export was rebuilt in OFF mode after the temporary PLACEHOLDER inspection. LIVE remained disabled and no publisher value or `ads.txt` file was changed.

## OFF

- Explicit mode: production default, OFF
- Browser at 1440 by 900 and 390 by 844: zero ad containers, zero `Advertisement` labels, zero ad scripts, and no reserved blank gap
- Hydrated output: no responsive ad flash
- Final evidence: `after/desktop-1440-ad-off-final.png` and `after/mobile-390x844-ad-off-final.png`
- Result: pass

## PLACEHOLDER

- Explicit build override: `NEXT_PUBLIC_AD_MODE=placeholder`
- AdSense script: absent
- 1440 by 900 homepage: one 728 by 90 header well
- 1920 by 1080 homepage: header plus 160 by 600 left and right rails, three visible labels total
- 390 by 844 homepage: one 320-wide post-hero well and no desktop rails
- 1440 by 900 printable: one header well; the principal content remained unobstructed
- Hydration and breakpoint behavior: stable, with no disappearing placeholder or horizontal overflow
- Evidence: `after/desktop-1440-ad-placeholder.png`, `after/desktop-1920-ad-placeholder.png`, `after/mobile-390x844-ad-placeholder.png`, and `after/desktop-1440-printable-ad-placeholder.png`
- Result: pass

## LIVE

- State: disabled
- Validation scope: contract and mock-based active tests only
- Duplicate initialization and route-transition slot checks: covered by the active advertisement suite
- No live script or publisher value was introduced
- Result: pass for disabled-mode safety; activation remains out of scope
