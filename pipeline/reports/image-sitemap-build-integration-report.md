# Image Sitemap Build Integration

| Check | Result |
| --- | --- |
| buildScriptRegeneratesImageSitemap | pass |
| robotsReferencesRegularSitemap | pass |
| robotsReferencesImageSitemap | pass |
| robotsUsesCentralizedCanonicalUrl | pass |
| regularSitemapUsesCentralRouteInventory | pass |
| staticExportConfigured | pass |
| appApiRequired | fail |
| xmlCopiedByStaticExportFromPublic | pass |
| noMediaCopiedToPublic | pass |

The generated public XML remains a static artifact copied into `out/`. It uses the centralized production site configuration and frozen printable route contract without an API or server runtime.
