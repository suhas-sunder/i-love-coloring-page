import type { MetadataRoute } from "next";

import { getSitemapEntries, getSiteUrl } from "@/lib/coloring/data";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return getSitemapEntries().map((entry) => ({
    url: `${siteUrl}${entry.path}`,
    lastModified: new Date("2026-05-10"),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
