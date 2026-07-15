import { footerTrustLinks } from "@/lib/trust/trustPages";

export type NavigationLink = {
  id: string;
  label: string;
  href: string;
  hubId?: string;
  assetCount?: number;
};

export type NavigationGroup = {
  id: string;
  label: string;
  links: NavigationLink[];
};

export type DesktopNavigationItem =
  | { id: "coloring-pages" | "for-kids" | "for-adults"; kind: "link"; label: string; href: string }
  | { id: "categories" | "seasonal"; kind: "disclosure"; label: string }
  | { id: "search"; kind: "search"; label: string };

const links = {
  coloringPages: direct("coloring-pages", "Coloring Pages", "/coloring-pages"),
  kids: hub("for-kids", "Coloring Pages for Kids", "/coloring-pages/for-kids", "hub_for_kids", 1335),
  adults: hub("detailed-for-adults", "Detailed Coloring Pages for Adults", "/coloring-pages/detailed-for-adults", "hub_detailed_for_adults", 1459),
  animals: hub("animals", "Animals", "/coloring-pages/animals", "hub_animals", 1450),
  plushies: hub("plushies", "Plushies", "/coloring-pages/plushies", "hub_plushies", 1704),
  mandalas: hub("mandalas", "Mandalas", "/coloring-pages/mandalas", "hub_mandalas", 1459),
  fantasy: hub("fantasy", "Fantasy", "/coloring-pages/fantasy", "hub_fantasy", 1265),
  dinosaurs: hub("dinosaurs", "Dinosaurs", "/coloring-pages/dinosaurs", "hub_dinosaurs", 189),
  vehicles: hub("vehicles", "Vehicles", "/coloring-pages/vehicles", "hub_vehicles", 373),
  easy: hub("easy", "Easy", "/coloring-pages/easy", "hub_easy", 1300),
  geometric: hub("geometric", "Geometric", "/coloring-pages/geometric", "hub_geometric", 1457),
  chibi: hub("chibi", "Chibi", "/coloring-pages/chibi", "hub_chibi", 908),
  kawaii: hub("kawaii", "Kawaii", "/coloring-pages/kawaii", "hub_kawaii", 88),
  flowers: hub("flowers", "Flowers", "/coloring-pages/flowers", "hub_flowers", 346),
  seaLife: hub("sea-life", "Sea Life", "/coloring-pages/sea-life", "hub_sea_life", 236),
  dogs: hub("dogs", "Dogs", "/coloring-pages/dogs", "hub_dogs", 284),
  birds: hub("birds", "Birds", "/coloring-pages/birds", "hub_birds", 188),
  prehistoric: hub("prehistoric-animals", "Prehistoric Animals", "/coloring-pages/prehistoric-animals", "hub_prehistoric_animals", 220),
  food: hub("food", "Food", "/coloring-pages/food", "hub_food", 261),
  christmas: hub("christmas", "Christmas", "/coloring-pages/christmas", "hub_christmas", 332),
  halloween: hub("halloween", "Halloween", "/coloring-pages/halloween", "hub_halloween", 305),
  stPatricksDay: hub("st-patricks-day", "St. Patrick's Day", "/coloring-pages/st-patricks-day", "hub_st_patricks_day", 20),
} as const;

export const desktopPrimaryItems: DesktopNavigationItem[] = [
  { id: "coloring-pages", kind: "link", label: "Coloring Pages", href: links.coloringPages.href },
  { id: "categories", kind: "disclosure", label: "Categories" },
  { id: "for-kids", kind: "link", label: "For Kids", href: links.kids.href },
  { id: "for-adults", kind: "link", label: "For Adults", href: links.adults.href },
  { id: "seasonal", kind: "disclosure", label: "Seasonal" },
  { id: "search", kind: "search", label: "Search" },
];

export const categoryNavigationGroups: NavigationGroup[] = [
  {
    id: "popular",
    label: "Popular",
    links: [links.animals, links.plushies, links.mandalas, links.fantasy, links.dinosaurs, links.vehicles],
  },
  {
    id: "audience",
    label: "Browse by audience",
    links: [links.kids, links.adults, links.easy, links.geometric, links.chibi, links.kawaii],
  },
  {
    id: "subjects",
    label: "Subjects",
    links: [links.flowers, links.seaLife, links.dogs, links.birds, links.prehistoric, links.food],
  },
  {
    id: "seasonal-occasions",
    label: "Seasonal and occasions",
    links: [links.christmas, links.halloween, links.stPatricksDay],
  },
];

export const seasonalNavigationLinks: NavigationLink[] = [links.christmas, links.halloween, links.stPatricksDay];

export const mobileDirectLinks: NavigationLink[] = [
  direct("home", "Home", "/"),
  links.coloringPages,
  direct("for-kids-mobile", "For Kids", links.kids.href),
  direct("for-adults-mobile", "For Adults", links.adults.href),
];

export const mobileNavigationGroups: NavigationGroup[] = [
  { id: "mobile-seasonal", label: "Seasonal collections", links: seasonalNavigationLinks },
  { id: "mobile-popular", label: "Popular categories", links: categoryNavigationGroups[0].links },
  { id: "mobile-more", label: "More categories", links: categoryNavigationGroups[2].links },
];

export const viewAllCollectionsLink = direct("view-all-collections", "View all collections", "/sitemap");
export const browseAllColoringPagesLink = direct("browse-all-coloring-pages", "Browse all coloring pages", "/coloring-pages");
export const searchEntryPoint = { id: "search", label: "Search", dialogLabel: "Search coloring pages" } as const;

export const footerNavLinks: NavigationLink[] = [links.animals, links.mandalas, links.halloween, links.plushies];
export const footerPolicyLinks = footerTrustLinks;

export type PrimaryNavigationId = DesktopNavigationItem["id"];

export function getActivePrimaryNavigationId(pathname: string): PrimaryNavigationId | null {
  const path = normalizePathname(pathname);
  if (path.startsWith("/printables/")) return "coloring-pages";
  if (path === links.coloringPages.href) return "coloring-pages";
  if (isRouteOrPagination(path, links.kids.href)) return "for-kids";
  if (isRouteOrPagination(path, links.adults.href)) return "for-adults";
  if (seasonalNavigationLinks.some((link) => isRouteOrPagination(path, link.href))) return "seasonal";
  if (/^\/coloring-pages\/[^/]+(?:\/page\/[1-9]\d*)?$/.test(path)) return "categories";
  return null;
}

export function isExactNavigationPath(pathname: string, href: string) {
  return normalizePathname(pathname) === href;
}

function direct(id: string, label: string, href: string): NavigationLink {
  return { id, label, href };
}

function hub(id: string, label: string, href: string, hubId: string, assetCount: number): NavigationLink {
  return { id, label, href, hubId, assetCount };
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isRouteOrPagination(pathname: string, href: string) {
  return pathname === href || new RegExp(`^${escapeRegExp(href)}\/page\/[1-9]\\d*$`).test(pathname);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
