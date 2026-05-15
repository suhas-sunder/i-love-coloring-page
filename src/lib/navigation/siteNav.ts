import routesJson from "@/generated/coloring/runtime-routes.json";
import hubsJson from "@/generated/coloring/runtime-hubs.json";
import { footerTrustLinks } from "@/lib/trust/trustPages";

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
export const footerPolicyLinks = footerTrustLinks;

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
export const sitemapHubGroups = groupHubLinks(phase1HubLinks.filter((link) => link.href !== "/coloring-pages")).map((group) => ({
  ...group,
  label: group.label === "More Specific Collections" ? "More Collections" : group.label,
}));

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
    "Dinosaurs & Prehistoric",
    "Fantasy & Characters",
    "Food & Cute Objects",
    "Vehicles & Places",
    "Patterns & Detailed",
    "Kids & Easy",
    "More Specific Collections",
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
  if (/^(animals|plushies|mandalas|geometric|anime-girls|chibi|fantasy|dragons|unicorns)$/.test(slug)) {
    return "Popular";
  }

  if (/(christmas|halloween|halloween-costume|easter|thanksgiving|valentine|seasonal|holiday|holidays|summer|winter|spring|autumn|fall|birthday|pumpkin|santa|reindeer|st-patricks|trick-or-treat|leprechaun|gingerbread)/.test(slug)) {
    return "Seasonal";
  }

  if (/(mandala|geometric|pattern|adult|detailed|zentangle|abstract)/.test(slug)) {
    return "Patterns & Detailed";
  }

  if (/(for-kids|easy|simple)/.test(slug)) {
    return "Kids & Easy";
  }

  if (/(bakery|cake|cupcake|cookie|food|sushi|nigiri|salmon|cute|kawaii|plushie|playing-card|chess|gingerbread)/.test(slug)) {
    return "Food & Cute Objects";
  }

  if (/(dinosaur|prehistoric|ankylosaurus|brachiosaurus|diplodocus|iguanodon|mosasaurus|plesiosaurus|pteranodon|pterodactyl|stegosaurus|triceratops|velociraptor|t-rex|mammoth|saber-toothed|megalodon|dodo)/.test(slug)) {
    return "Dinosaurs & Prehistoric";
  }

  if (/(anime|chibi|fantasy|fairy|princess|myth|dragon|monster|robot|superhero|character|unicorn|mermaid|magic|wizard|witch|griffin|hydra|phoenix|pegasus|wyvern|knight|medieval|dungeon|castle)/.test(slug)) {
    return "Fantasy & Characters";
  }

  if (/(animal|bird|cat|dog|terrier|bulldog|collie|horse|fish|sea|ocean|plant|flower|lily|daisy|orchid|poppy|lotus|forget-me-not|bamboo|palm|nature|farm|forest|butterfly|beetle|insect|reptile|mammal|bat|bear|bee|cow|crab|deer|dolphin|duck|eagle|elephant|fox|garden|giraffe|hedgehog|hippo|koala|lion|lizard|llama|monkey|moose|mushroom|octopus|otter|owl|panda|penguin|rabbit|rose|shark|sheep|sloth|snake|spider|tiger|tree|turtle|whale|wolf|zebra)/.test(slug)) {
    return "Animals & Nature";
  }

  if (/(car|vehicle|truck|train|airplane|plane|ship|boat|city|house|place|space|sports|school|bridge|building|landmark)/.test(slug)) {
    return "Vehicles & Places";
  }

  return "More Specific Collections";
}
