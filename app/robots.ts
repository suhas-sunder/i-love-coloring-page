import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/coloring/data";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/coloring-pages"],
      disallow: ["/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
