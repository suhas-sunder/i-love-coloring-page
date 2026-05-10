import routesJson from "@/generated/coloring/routes.json";
import hubsJson from "@/generated/coloring/hubs.json";

type RoutesManifest = {
  routes: Array<{ path: string }>;
};

type HubsManifest = {
  hubs: Array<{
    slug: string;
    title: string;
    route: string;
    assetCount: number;
  }>;
  backlogHubs?: Array<{ slug: string }>;
  sectionOnlyTopics?: Array<{ slug: string }>;
};

export type SiteNavLink = {
  label: string;
  shortLabel?: string;
  href: string;
  group: "primary" | "footer" | "utility";
};

export type HubNavLink = {
  label: string;
  slug: string;
  href: string;
  assetCount: number;
  searchText: string;
};

export type HubNavGroup = {
  label: string;
  links: HubNavLink[];
};

const routesManifest = routesJson as RoutesManifest;
const hubsManifest = hubsJson as HubsManifest;
const generatedRoutePaths = new Set(routesManifest.routes.map((route) => route.path));

const requestedNavLinks: SiteNavLink[] = [
  { label: "Popular", href: "/coloring-pages/animals", group: "primary" },
  { label: "Seasonal", href: "/coloring-pages/christmas", group: "primary" },
  { label: "For Kids", href: "/coloring-pages/for-kids", group: "primary" },
  { label: "For Adults", href: "/coloring-pages/detailed-for-adults", group: "primary" },
  { label: "Search/Browse", shortLabel: "Search", href: "/coloring-pages#gallery", group: "primary" },
  { label: "All Coloring Pages", href: "/coloring-pages", group: "utility" },
  { label: "Animals", href: "/coloring-pages/animals", group: "footer" },
  { label: "Mandalas", href: "/coloring-pages/mandalas", group: "footer" },
  { label: "Halloween", href: "/coloring-pages/halloween", group: "footer" },
  { label: "Plushies", href: "/coloring-pages/plushies", group: "footer" },
];

export const siteNavLinks = requestedNavLinks.filter((link) => isKnownStaticRoute(link.href));
export const footerNavLinks = siteNavLinks.filter((link) => link.group === "footer");
export const primaryNavLinks = siteNavLinks.filter((link) => link.group === "primary");
export const utilityNavLinks = siteNavLinks.filter((link) => link.group === "utility");

const primaryRoutePaths = new Set(primaryNavLinks.map((link) => getRoutePath(link.href)));
const backlogSlugs = new Set((hubsManifest.backlogHubs || []).map((hub) => hub.slug));
const sectionOnlySlugs = new Set((hubsManifest.sectionOnlyTopics || []).map((topic) => topic.slug));

export const phase1HubLinks = hubsManifest.hubs
  .filter((hub) => hub.slug && isKnownStaticRoute(hub.route))
  .filter((hub) => !backlogSlugs.has(hub.slug) && !sectionOnlySlugs.has(hub.slug))
  .map((hub) => ({
    label: cleanHubTitle(hub.title),
    slug: hub.slug,
    href: hub.route,
    assetCount: hub.assetCount,
    searchText: `${hub.title} ${hub.slug}`.toLowerCase(),
  }))
  .sort((a, b) => a.label.localeCompare(b.label) || a.slug.localeCompare(b.slug));

export const moreHubLinks = phase1HubLinks.filter((link) => !primaryRoutePaths.has(link.href));
export const moreHubGroups = groupHubLinks(moreHubLinks);

export function isKnownStaticRoute(href: string) {
  if (href === "/") return true;
  const [path] = href.split("#");
  return generatedRoutePaths.has(path);
}

function getRoutePath(href: string) {
  const [path] = href.split("#");
  return path;
}

function cleanHubTitle(title: string) {
  return title.replace(/\s+Coloring Pages$/i, "");
}

function groupHubLinks(links: HubNavLink[]): HubNavGroup[] {
  const groupOrder = [
    "Popular",
    "Seasonal",
    "Animals & Nature",
    "Characters & Fantasy",
    "Patterns & Adults",
    "Vehicles & Places",
    "More Collections",
  ];
  const groups = new Map(groupOrder.map((label) => [label, [] as HubNavLink[]]));

  for (const link of links) {
    groups.get(getHubGroup(link.slug))?.push(link);
  }

  return groupOrder
    .map((label) => ({
      label,
      links: (groups.get(label) || []).sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label)),
    }))
    .filter((group) => group.links.length > 0);
}

function getHubGroup(slug: string) {
  if (/^(animals|plushies|mandalas|geometric|anime-girls|chibi|fantasy)$/.test(slug)) {
    return "Popular";
  }

  if (/(christmas|halloween|easter|thanksgiving|valentine|seasonal|holiday|summer|winter|spring|autumn|fall|birthday)/.test(slug)) {
    return "Seasonal";
  }

  if (/(animal|bird|cat|dog|horse|fish|sea|ocean|dinosaur|prehistoric|plant|flower|nature|farm|forest|butterfly|beetle|insect|reptile|mammal)/.test(slug)) {
    return "Animals & Nature";
  }

  if (/(anime|chibi|fantasy|fairy|princess|myth|dragon|monster|robot|superhero|character|unicorn|mermaid|magic)/.test(slug)) {
    return "Characters & Fantasy";
  }

  if (/(mandala|geometric|pattern|adult|detailed|simple|easy|zentangle|abstract|kawaii|cute)/.test(slug)) {
    return "Patterns & Adults";
  }

  if (/(car|vehicle|truck|train|airplane|ship|boat|city|house|place|space|sports|food|school)/.test(slug)) {
    return "Vehicles & Places";
  }

  return "More Collections";
}
