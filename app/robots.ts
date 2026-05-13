import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/coloring/data";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/coloring-pages"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
