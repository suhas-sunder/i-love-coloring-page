import type { MetadataRoute } from "next";

import { getRegularSitemapRoutes } from "@/lib/seo/routeInventory";
import { getCanonicalUrl } from "@/lib/site/siteConfig";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return getRegularSitemapRoutes().map((entry) => ({ url: getCanonicalUrl(entry.path) }));
}
