import type { MetadataRoute } from "next";

import { getSitemapEntries, getSiteUrl } from "@/lib/coloring/data";
import { trustPages } from "@/lib/trust/trustPages";

export const dynamic = "force-static";

const htmlSitemapPage = {
  path: "/sitemap",
  lastModified: new Date("2026-05-15"),
  changeFrequency: "monthly" as const,
  priority: 0.4,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return [
    {
      url: siteUrl,
      lastModified: new Date("2026-05-11"),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...getSitemapEntries().map((entry) => ({
      url: `${siteUrl}${entry.path}`,
      lastModified: new Date("2026-05-10"),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
    {
      url: `${siteUrl}${htmlSitemapPage.path}`,
      lastModified: htmlSitemapPage.lastModified,
      changeFrequency: htmlSitemapPage.changeFrequency,
      priority: htmlSitemapPage.priority,
    },
    ...trustPages
      .filter((page) => page.indexable)
      .map((page) => ({
        url: `${siteUrl}${page.path}`,
        lastModified: new Date("2026-05-11"),
        changeFrequency: "yearly" as const,
        priority: page.requiredBeforeAdsense ? 0.5 : 0.4,
      })),
  ];
}
