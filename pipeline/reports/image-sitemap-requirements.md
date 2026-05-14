# Image Sitemap Requirements

Sources used:

- [Image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
- [Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Manage sitemaps with sitemap index files](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps)

| Requirement | Decision |
| --- | --- |
| Required image tags | image:image, image:loc |
| Deprecated tags excluded | image:caption, image:geo_location, image:title, image:license |
| Images per page URL | 1000 |
| Sitemap size limit | 50000 URLs or 52428800 bytes uncompressed |
| WebP image URLs | Allowed by Google Search image format guidance |
| SVG image URLs | SVG is internal-only for this product and the owner asked the image sitemap to prefer WebP preview URLs. |
| Per-image pages | Not created. Image entries attach to existing hub URLs. |
| Deferred records | The 205 deferred records are hidden from public runtime and are not verified for public discovery. |

Titles and captions are kept in the data manifest for owner review, but not emitted as XML image tags because Google's current image sitemap reference marks those tags deprecated.
