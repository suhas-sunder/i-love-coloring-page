import type { MetadataRoute } from "next";

import { getCanonicalUrl } from "@/lib/site/siteConfig";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: [getCanonicalUrl("/sitemap.xml"), getCanonicalUrl("/image-sitemap.xml")],
  };
}
