import type { Metadata } from "next";

import ogImagesJson from "@/generated/coloring/og-images.json";

import { getSeoPageMetadata, getSiteUrl } from "./data";

type ColoringMetadataOptions = {
  page?: number;
  canonicalPath?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  indexable?: boolean;
};

type OgImageMetadata = {
  ogImagePath: string;
  ogImageUrl: string;
  width: number;
  height: number;
  alt: string;
};

type OgImagesManifest = {
  defaults: {
    fallbackPath: string;
    fallbackUrl: string;
    width: number;
    height: number;
    alt: string;
  };
  metadataByPath: Record<string, OgImageMetadata>;
};

const ogImagesManifest = ogImagesJson as OgImagesManifest;

export function buildColoringMetadata(path: string, options: ColoringMetadataOptions = {}): Metadata {
  const page = getSeoPageMetadata(path);
  const canonicalPath = options.canonicalPath || page?.canonicalPath || path;
  const baseTitle = options.fallbackTitle || page?.metaTitle || "Printable Coloring Pages";
  const baseDescription =
    options.fallbackDescription || page?.metaDescription || "Browse printable coloring pages with real previews, search, print controls, and PNG downloads.";
  const title = options.page && options.page > 1 ? `${baseTitle}, Page ${options.page}` : baseTitle;
  const description =
    options.page && options.page > 1
      ? `${baseDescription} Continue browsing page ${options.page} of this printable collection.`
      : baseDescription;
  const url = `${getSiteUrl()}${canonicalPath}`;
  const ogImage = getOgImageMetadata(path);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    robots: options.indexable === false ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: [
        {
          url: ogImage.ogImageUrl,
          width: 1200,
          height: 630,
          alt: ogImage.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: ogImage.ogImageUrl,
          alt: ogImage.alt,
        },
      ],
    },
  };
}

function getOgImageMetadata(path: string): OgImageMetadata {
  return ogImagesManifest.metadataByPath[path] || {
    ogImagePath: ogImagesManifest.defaults.fallbackPath,
    ogImageUrl: ogImagesManifest.defaults.fallbackUrl,
    width: ogImagesManifest.defaults.width,
    height: ogImagesManifest.defaults.height,
    alt: ogImagesManifest.defaults.alt,
  };
}
