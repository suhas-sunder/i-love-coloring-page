# Round 4Z Print Download Audit

- Previous print quality issue: print used the generated PNG preview path from the card action instead of a high-quality SVG-derived raster.
- Previous print source: assetUrls.png generated PNG preview, commonly 341x512 in current sample data
- PNG preview dimensions found in sample data: 341x512
- SVG dimensions found in sample data: 800x1200 vector source, rasterized to 1600x2400 or larger for print
- Print now calls browser conversion helper: true
- SVG visible as user download: false
- High-quality browser output requires loading the internal SVG into a CORS-clean canvas, exporting a PNG blob, and printing that generated raster.
