# Correct repository visual performance

The only public implementation change is CSS positioning for the Seasonal disclosure. No component JavaScript, image derivative, dependency, font, preload, or public asset was added.

## Export metrics

- Static outputs: 6,920
- Canonical printable pages: 6,352
- Export files: 69,732
- Export bytes: 1,140,130,730
- Change from starting export: 185 bytes
- Static JavaScript bytes: 751,483, unchanged

## Browser and contract findings

- Grid cards use 341 by 512 WebP preview assets with stable dimensions and 2:3 frames.
- Printable principal images use the public WebP at its natural 341 by 512 size; the checked principal request was not a grid composition or an upscaled thumbnail.
- No duplicate principal-image request was observed on the inspected printable pages.
- Shared generated navigation data remains authoritative; no mobile-only copy was introduced.
- Static cards gained no client JavaScript.
- The local metadata-review UI remains outside production routes and bundles.
- OFF output contains no ad script or ad surface.
- Image dimensions prevent layout shift, and responsive card sizes match the rendered columns.

Result: pass. The 185-byte export increase is limited to the corrective CSS rules and is not a significant payload regression.
