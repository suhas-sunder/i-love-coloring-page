import { resolvePrintableAssetSources } from "@/lib/coloring/assets";
import { getPrintablePath, getPrintablePrimaryHub } from "@/lib/coloring/printables";
import { buildPrintableDescription, getPrintableTitleModel } from "@/lib/coloring/printableTitles";
import type { RuntimePrintable } from "@/lib/coloring/types";
import { siteConfig } from "@/lib/site/siteConfig";

import { absoluteUrl, buildBreadcrumbListJsonLd, buildImageObjectJsonLd, compactJsonLd, type JsonLdObject } from "./jsonLd";

export function buildPrintableJsonLd(printable: RuntimePrintable): JsonLdObject[] {
  const path = getPrintablePath(printable);
  const pageUrl = absoluteUrl(siteConfig.siteUrl, path);
  const hub = getPrintablePrimaryHub(printable);
  const titleModel = getPrintableTitleModel(printable);
  const assetSources = resolvePrintableAssetSources(printable);
  const imageUrl = assetSources.principalPreview.url;
  const breadcrumb = buildBreadcrumbListJsonLd({
    siteUrl: siteConfig.siteUrl,
    pageUrl,
    items: [
      { name: "Home", path: "/" },
      { name: "Coloring Pages", path: "/coloring-pages" },
      { name: hub.title, path: hub.route },
      { name: titleModel.displayTitle, path },
    ],
  });
  const image = buildImageObjectJsonLd({
    url: imageUrl,
    width: assetSources.principalPreview.width,
    height: assetSources.principalPreview.height,
    name: titleModel.displayTitle,
    caption: titleModel.shortAccessibleTitle,
  });
  const webpage = compactJsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: titleModel.displayTitle,
    description: buildPrintableDescription(printable),
    isPartOf: { "@id": `${siteConfig.siteUrl}/#website` },
    inLanguage: "en-US",
    breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    primaryImageOfPage: { "@id": `${imageUrl}#image` },
    image: { "@id": `${imageUrl}#image` },
  }) as JsonLdObject;
  return [webpage, breadcrumb, { "@context": "https://schema.org", ...image }];
}
