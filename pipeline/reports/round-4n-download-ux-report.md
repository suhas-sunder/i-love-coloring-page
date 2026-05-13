# Round 4N Download UX Report

- User-facing SVG downloads removed: true
- Internal SVG metadata preserved: true
- Public download formats currently visible: PNG
- JPG/JPEG/WebP implemented now: false
- JPG/JPEG/WebP deferred: true
- Print action present: true
- PNG download present: true
- app/api required: false

JPG/JPEG/WebP are not shown because this round did not implement a reliable browser-side conversion flow. The next implementation should expose those controls only after conversion works through browser APIs without backend support.
