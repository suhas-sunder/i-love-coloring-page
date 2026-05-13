import type { Metadata } from "next";

import { getSeoPageMetadata, getSiteUrl } from "./data";

type ColoringMetadataOptions = {
  page?: number;
  canonicalPath?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
};

export function buildColoringMetadata(path: string, options: ColoringMetadataOptions = {}): Metadata {
  const page = getSeoPageMetadata(path);
  const canonicalPath = options.canonicalPath || page?.canonicalPath || path;
  const baseTitle = page?.metaTitle || options.fallbackTitle || "Printable Coloring Pages";
  const baseDescription =
    page?.metaDescription || options.fallbackDescription || "Browse printable coloring pages with real previews, search, print controls, and PNG downloads.";
  const title = options.page && options.page > 1 ? `${baseTitle}, Page ${options.page}` : baseTitle;
  const description =
    options.page && options.page > 1
      ? `${baseDescription} Continue browsing page ${options.page} of this printable collection.`
      : baseDescription;
  const url = `${getSiteUrl()}${canonicalPath}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
