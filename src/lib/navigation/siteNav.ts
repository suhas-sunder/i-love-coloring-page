import routesJson from "@/generated/coloring/routes.json";

type RoutesManifest = {
  routes: Array<{ path: string }>;
};

export type SiteNavLink = {
  label: string;
  shortLabel?: string;
  href: string;
  group: "primary" | "footer";
};

const routesManifest = routesJson as RoutesManifest;
const generatedRoutePaths = new Set(routesManifest.routes.map((route) => route.path));

const requestedNavLinks: SiteNavLink[] = [
  { label: "Coloring Pages", shortLabel: "Pages", href: "/coloring-pages", group: "primary" },
  { label: "Popular", href: "/coloring-pages/animals", group: "primary" },
  { label: "Seasonal", href: "/coloring-pages/christmas", group: "primary" },
  { label: "For Kids", href: "/coloring-pages/for-kids", group: "primary" },
  { label: "For Adults", href: "/coloring-pages/detailed-for-adults", group: "primary" },
  { label: "Search/Browse", shortLabel: "Search", href: "/coloring-pages#gallery", group: "primary" },
  { label: "Animals", href: "/coloring-pages/animals", group: "footer" },
  { label: "Mandalas", href: "/coloring-pages/mandalas", group: "footer" },
  { label: "Halloween", href: "/coloring-pages/halloween", group: "footer" },
  { label: "Plushies", href: "/coloring-pages/plushies", group: "footer" },
];

export const siteNavLinks = requestedNavLinks.filter((link) => isKnownStaticRoute(link.href));
export const footerNavLinks = siteNavLinks.filter((link) => link.group === "footer");
export const primaryNavLinks = siteNavLinks.filter((link) => link.group === "primary");

export function isKnownStaticRoute(href: string) {
  if (href === "/") return true;
  const [path] = href.split("#");
  return generatedRoutePaths.has(path);
}
