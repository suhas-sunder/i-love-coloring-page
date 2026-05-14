# JSON-LD Requirements

Google Search recommends JSON-LD when the site setup supports it, and requires structured data to represent visible, relevant page content. This round keeps schema limited to route identity, collection structure, breadcrumb hierarchy, capped visible lists, and trust pages.

## Selected Schema Types

- WebSite: The homepage describes the site as a whole.
- Organization: Minimal publisher identity only, using public site name and URL.
- WebPage: General page identity for routes without a safer specific type.
- CollectionPage: Gallery and hub routes are visible collections.
- BreadcrumbList: Visible breadcrumb hierarchy exists on collection and hub pages.
- ItemList: A limited visible set of gallery items is shown on the route.
- AboutPage: About page content is visible.
- ContactPage: Contact page content and email are visible.
- PrivacyPolicy: Privacy policy page content is visible.
- TermsOfService: Terms page content is visible.
- ImageObject: Only the route-level OG image is used where an image property is helpful.

## Rejected Schema Types

- Review: No visible reviews exist.
- AggregateRating: No visible aggregate ratings exist.
- Product: The pages are free printable galleries, not product offer pages.
- Offer: No pricing or offers are shown.
- FAQPage: No visible FAQ blocks are added, and Google has narrowed FAQ rich result availability.
- SearchAction: Gallery search is client-side state, not a URL-addressable search route.

## References

- Google Search Central: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data - JSON-LD is the selected format because Google recommends it when supported by the site setup.
- Google Search Central: https://developers.google.com/search/docs/appearance/structured-data/sd-policies - Structured data must describe visible, relevant, non-misleading page content.
- Google Search Central: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb - BreadcrumbList is appropriate on collection and hub routes with visible breadcrumb navigation.
- Google Search Central: https://developers.google.com/search/docs/appearance/structured-data/faqpage - FAQPage is rejected because the site is not a government or health authority FAQ surface and the visible pages do not contain public FAQ blocks.
- Google Search Central: https://developers.google.com/search/docs/appearance/structured-data/review-snippet - Review and AggregateRating are rejected because the site does not show real visitor reviews or ratings.
- Schema.org: https://schema.org/CollectionPage - CollectionPage represents the gallery and hub pages.
- Schema.org: https://schema.org/ItemList - ItemList represents a capped list of visible gallery or featured items.
