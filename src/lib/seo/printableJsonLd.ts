import { resolveWebpPreviewAssetUrl } from "@/lib/coloring/assets";
import { buildPrintableDescription, getNaturalPrintableTitle } from "@/lib/coloring/printableMetadata";
import { getPrintablePath, getPrintablePrimaryHub } from "@/lib/coloring/printables";
import type { RuntimePrintable } from "@/lib/coloring/types";
import { siteConfig } from "@/lib/site/siteConfig";

import { absoluteUrl, buildBreadcrumbListJsonLd, buildImageObjectJsonLd, compactJsonLd, type JsonLdObject } from "./jsonLd";

export function buildPrintableJsonLd(printable: RuntimePrintable): JsonLdObject[] {
  const path = getPrintablePath(printable);
  const pageUrl = absoluteUrl(siteConfig.siteUrl, path);
  const hub = getPrintablePrimaryHub(printable);
  const imageUrl = resolveWebpPreviewAssetUrl(printable.webpPath);
  if (!imageUrl) throw new Error(`Missing public WebP JSON-LD URL: ${printable.assetId}`);
  const breadcrumb = buildBreadcrumbListJsonLd({
    siteUrl: siteConfig.siteUrl,
    pageUrl,
    items: [
      { name: "Home", path: "/" },
      { name: "Coloring Pages", path: "/coloring-pages" },
      { name: hub.title, path: hub.route },
      { name: getNaturalPrintableTitle(printable.publicTitle), path },
    ],
  });
  const image = buildImageObjectJsonLd({
    url: imageUrl,
    width: printable.width || undefined,
    height: printable.height || undefined,
    caption: printable.altText,
  });
  const webpage = compactJsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: getNaturalPrintableTitle(printable.publicTitle),
    description: buildPrintableDescription(printable),
    isPartOf: { "@id": `${siteConfig.siteUrl}/#website` },
    inLanguage: "en-US",
    breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    primaryImageOfPage: { "@id": `${imageUrl}#image` },
    image: { "@id": `${imageUrl}#image` },
  }) as JsonLdObject;
  return [webpage, breadcrumb, { "@context": "https://schema.org", ...image }];
}
