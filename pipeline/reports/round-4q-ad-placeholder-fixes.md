# Round 4Q Ad Placeholder Fixes

- Root cause: The placeholder system existed, but the muted style, right-only rail, missing left rail, and missing page-type header banners made enabled placeholders inconsistent during manual review.
- Env logic changed: false
- Placement count changed: true
- Placement moved: true
- Placement change reason: existing right-only rail and inconsistent page skeleton were not AdSense-safe enough for QA
- Styling changed: true
- Header/banner slots added: true
- Left and right rails added: true
- Small-screen behavior: page-type header banner remains below the header while side rails are hidden below the wide-desktop breakpoint
- Live ad code added: false
- Ad scripts added: false
- Publisher or client IDs added: false

Changes:
- Added page-type responsive header banner placeholders below the site header.
- Replaced the single global right rail with separate left and right wide-desktop rail placeholders.
- Configured a 48px safe gap between the content column and side rails.
- Kept side rails hidden below the wide-desktop breakpoint.
- Made enabled placeholders use an approved soft plum surface.
- Changed the label to approved plum text so Advertisement is readable.
- Added a small approved coral accent inside the placeholder box.
- Kept inline content placeholders outside gallery grids and away from Print/Download controls.
