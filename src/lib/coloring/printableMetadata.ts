import type { Metadata } from "next";

import { resolvePrintableAssetSources } from "./assets";
import { getPrintablePath } from "./printables";
import { buildPrintableDescription, getPrintableTitleModel } from "./printableTitles";
import type { RuntimePrintable } from "./types";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

export function buildPrintableMetadata(printable: RuntimePrintable): Metadata {
  const titleModel = getPrintableTitleModel(printable);
  const title = titleModel.metadataTitle;
  const description = buildPrintableDescription(printable);
  const canonical = getCanonicalUrl(getPrintablePath(printable));
  const assetSources = resolvePrintableAssetSources(printable);
  const imageUrl = assetSources.principalPreview.url;
  const dimensions = { width: assetSources.principalPreview.width, height: assetSources.principalPreview.height };

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [{ url: imageUrl, ...dimensions, alt: titleModel.shortAccessibleTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl, alt: titleModel.shortAccessibleTitle }],
    },
  };
}
