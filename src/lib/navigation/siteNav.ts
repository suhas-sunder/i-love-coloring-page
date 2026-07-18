import { footerTrustLinks } from "@/lib/trust/trustPages";
import { getCollectionCountById } from "@/lib/coloring/collectionCounts";

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
  kids: hub("for-kids", "Coloring Pages for Kids", "/coloring-pages/for-kids", "hub_for_kids"),
  adults: hub("detailed-for-adults", "Detailed Coloring Pages for Adults", "/coloring-pages/detailed-for-adults", "hub_detailed_for_adults"),
  animals: hub("animals", "Animals", "/coloring-pages/animals", "hub_animals"),
  plushies: hub("plushies", "Plushies", "/coloring-pages/plushies", "hub_plushies"),
  mandalas: hub("mandalas", "Mandalas", "/coloring-pages/mandalas", "hub_mandalas"),
  fantasy: hub("fantasy", "Fantasy", "/coloring-pages/fantasy", "hub_fantasy"),
  dinosaurs: hub("dinosaurs", "Dinosaurs", "/coloring-pages/dinosaurs", "hub_dinosaurs"),
  vehicles: hub("vehicles", "Vehicles", "/coloring-pages/vehicles", "hub_vehicles"),
  chibi: hub("chibi", "Chibi", "/coloring-pages/chibi", "hub_chibi"),
  kawaii: hub("kawaii", "Kawaii", "/coloring-pages/kawaii", "hub_kawaii"),
  cute: hub("cute", "Cute", "/coloring-pages/cute", "hub_cute"),
  flowers: hub("flowers", "Flowers", "/coloring-pages/flowers", "hub_flowers"),
  seaLife: hub("sea-life", "Sea Life", "/coloring-pages/sea-life", "hub_sea_life"),
  food: hub("food", "Food", "/coloring-pages/food", "hub_food"),
  buildings: hub("buildings", "Buildings", "/coloring-pages/buildings", "hub_buildings"),
  plants: hub("plants", "Plants", "/coloring-pages/plants", "hub_plants"),
  fantasyCreatures: hub("fantasy-creatures", "Fantasy Creatures", "/coloring-pages/fantasy-creatures", "hub_fantasy_creatures"),
  animeGirls: hub("anime-girls", "Anime Girls", "/coloring-pages/anime-girls", "hub_anime_girls"),
  geometric: hub("geometric", "Geometric", "/coloring-pages/geometric", "hub_geometric"),
  holidays: hub("holidays", "Holidays", "/coloring-pages/holidays", "hub_holidays"),
  birthday: hub("birthday", "Birthday", "/coloring-pages/birthday", "hub_birthday"),
  stPatricksDay: hub("st-patricks-day", "St. Patrick's Day", "/coloring-pages/st-patricks-day", "hub_st_patricks_day"),
  christmas: hub("christmas", "Christmas", "/coloring-pages/christmas", "hub_christmas"),
  halloween: hub("halloween", "Halloween", "/coloring-pages/halloween", "hub_halloween"),
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
    id: "subjects",
    label: "Subjects",
    links: [links.animals, links.seaLife, links.dinosaurs, links.plants, links.flowers, links.food, links.vehicles, links.buildings],
  },
  {
    id: "characters",
    label: "Characters and imagined worlds",
    links: [links.fantasy, links.fantasyCreatures, links.animeGirls, links.plushies],
  },
  {
    id: "styles",
    label: "Styles",
    links: [links.mandalas, links.geometric, links.chibi, links.kawaii, links.cute],
  },
];

export const seasonalNavigationLinks: NavigationLink[] = [links.holidays, links.christmas, links.halloween, links.birthday, links.stPatricksDay];

export const mobileDirectLinks: NavigationLink[] = [
  direct("home", "Home", "/"),
  links.coloringPages,
  direct("for-kids-mobile", "For Kids", links.kids.href),
  direct("for-adults-mobile", "For Adults", links.adults.href),
];

export const mobileNavigationGroups: NavigationGroup[] = [
  ...categoryNavigationGroups.map((group) => ({ ...group, id: `mobile-${group.id}` })),
  { id: "mobile-seasonal", label: "Seasonal collections", links: seasonalNavigationLinks },
];

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

function hub(id: string, label: string, href: string, hubId: string): NavigationLink {
  return { id, label, href, hubId, assetCount: getCollectionCountById(hubId) };
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
