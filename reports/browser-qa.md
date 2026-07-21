# Browser QA evidence

Local checks ran against the final production export on 2026-07-18 in the connected in-app Chromium browser. Console warnings and errors were zero.

## Printable rendering

Fantasy Abyss Wyrm verified:

- factual H1, visible summary, meta description, Open Graph description, and WebPage JSON-LD description agree
- principal image is the public WebP at 341×512 declared and natural pixels
- no thumbnail upscaling and no persistent loading fallback after hydration
- PNG is the truthful server state; JPG and WebP appear only after browser capability detection
- Page details show verified collection, subject, orientation, and artwork dimensions only
- eight deterministic related printables produce server-rendered image/title links
- zero advertisement slots or labels in OFF mode
- footer and homepage metadata do not advertise browser-conditional formats

## Hub decisions

- Easy: self-canonical, `noindex, follow`, public, and absent from primary navigation.
- Coloring Pages for Kids: self-canonical, `index, follow`, 1,335 pages, with visitor-facing copy that publishes no age band, safety, or per-page difficulty claim.
- No visitor-visible audit terms such as `index-promoted`, `legacy inventory`, or `audience assignments` remain in either decision page.

## Navigation and responsive search

- Desktop Categories: 17 unique valid collection destinations, zero invalid links, no Easy destination, and zero horizontal overflow.
- Mobile menu at 390×844: full-viewport modal, body scroll locked, one Close control, zero horizontal overflow, zero ads, and current count-backed links.
- Mobile search at 390×844: full-viewport labelled modal, focused 350×52 input within the dialog, body scroll locked, zero horizontal overflow, and zero ads.
- The earlier 320, 375, 390, 430, and landscape acceptance matrix remains documented; this stage intentionally did not create a broad visual-regression baseline.

## Trust pages

- Privacy states that advertising is currently off; output contains no AdSense script, labels, slots, or reserved space.
- Terms does not invent ownership, licensing, governing law, operator identity, or permitted-use facts.
- Machine-oriented `production-default`, `production-readiness gate`, and repository terminology were removed from visible trust copy.

## Refinement follow-up

- Collection cards now use portrait-first frames (3:4 standard and 4:5 compact); printable gallery cards use a 2:3 frame. Contain-fit remains in place, so no original line art is cropped.
- Categories uses trigger-relative positioning at roomy desktop widths and a viewport-bounded fixed fallback at compact desktop widths. At 1024 pixels it stayed within the viewport after the correction.
- Mobile search at 390 x 844 is a compact safe-area top sheet with a visible header Close action. It no longer reserves full-page blank space below the single Browse action.
- Detailed visual production verification remains required after deployment. See `reports/pre-refinement-visual-audit.md` and `reports/live-verification-plan.md`.
