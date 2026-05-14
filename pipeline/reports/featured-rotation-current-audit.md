# Featured Rotation Current Audit

| Check | Result |
| --- | --- |
| homepageFreshPagesSelection | app/page.tsx uses getGeneratedFeaturedItems(rootHub) as the static fallback and RotatingFeaturedGrid for client reload randomization. |
| hubFeaturedPagesSelection | HubPageContent and /coloring-pages use generated featured items as fallback and hub-specific candidate pools for three-day rotation. |
| currentFeaturedListsWereStaticBeforeRound | pass |
| sharedDuplicateLogicReduced | pass |
| homepageFeaturedCount | 8 |
| hubFeaturedCount | 12 |
| sourceData | runtime-available-items.json, runtime-hub-items.json, runtime-hub-featured-items.json |
| assetUrlHandling | GalleryGrid still resolves WebP preview and internal SVG URLs through the centralized asset resolver. |
| printDownloadBehavior | Rotated cards still render ImageCard, so image click opens print preview and preview holds PNG/JPG/WebP downloads. |
