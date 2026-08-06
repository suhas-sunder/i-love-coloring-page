import type {
  AdLogicalPlacement,
  AdPageFamily,
  AdPageLayout,
  AdSlotDefinition,
  AdSlotId,
  AdViewportDimensions,
} from "./types";
import { AD_RAIL_LAYOUT } from "./layout";

export { AD_RAIL_LAYOUT } from "./layout";

export const AD_BREAKPOINTS = {
  mobileMaxWidth: 640,
  tabletMaxWidth: 1023,
  desktopMinWidth: 1024,
  sideRailsMinWidth: AD_RAIL_LAYOUT.minViewportWidth,
} as const;

export const AD_FIXED_HEADER_SIZES = {
  narrow: { width: 300, height: 50 },
  mobile: { width: 320, height: 50 },
  tablet: { width: 468, height: 60 },
  desktop: { width: 728, height: 90 },
} as const;

export const ADSENSE_PUBLISHER_ID = "pub-4810616735714570";
export const ADSENSE_CLIENT_ID = "ca-pub-4810616735714570";
export const ADS_TXT_RECORD = "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0";

export const ADSENSE_AD_UNIT_IDS = {
  headerBanner: "5574432869",
  leftSidebar: "5115981872",
  rightSidebar: "9929324856",
  square: "2489818539",
  lowerBanner: "5382861174",
} as const;

const bannerSize = sizes({ width: 728, height: 90 }, { width: 468, height: 60 }, { width: 320, height: 50 });
const squareSize = sizes({ width: 300, height: 300 }, { width: 300, height: 300 }, { width: 300, height: 300 });
const railSize = sizes({ width: AD_RAIL_LAYOUT.width, height: AD_RAIL_LAYOUT.height }, { width: 0, height: 0 }, { width: 0, height: 0 });

export const AD_SLOT_DEFINITIONS: Record<AdSlotId, AdSlotDefinition> = {
  "rail-left-desktop": rail("rail-left-desktop", "left-rail", "Wide-desktop left rail outside the main reading and gallery column."),
  "rail-right-desktop": rail("rail-right-desktop", "right-rail", "Wide-desktop right rail outside the main reading and gallery column."),
  "home-header-banner": banner("home-header-banner", "top-banner", ["home"], "Homepage responsive banner below the global header and above the hero."),
  "home-after-hero": banner("home-after-hero", "post-header-banner", ["home"], "Homepage responsive banner after the complete primary-collections section."),
  "home-lower-content": banner("home-lower-content", "related-banner", ["home"], "Homepage responsive banner after the final broader-browsing region."),
  "coloring-pages-header-banner": banner("coloring-pages-header-banner", "top-banner", ["gallery", "gallery-pagination"], "Gallery responsive banner below the global header and above the heading."),
  "coloring-pages-after-featured": banner("coloring-pages-after-featured", "post-header-banner", ["gallery", "gallery-pagination"], "Gallery responsive banner after the initial searchable gallery results."),
  "coloring-pages-lower-content": banner("coloring-pages-lower-content", "related-banner", ["gallery", "gallery-pagination"], "Gallery responsive banner after supporting browse and information content."),
  "hub-header-banner": banner("hub-header-banner", "top-banner", ["hub", "hub-pagination"], "Hub responsive banner below the global header and above the collection heading."),
  "hub-after-gallery": banner("hub-after-gallery", "related-banner", ["hub-pagination"], "Paginated hub banner after the concise return-to-collection region."),
  "hub-lower-content": banner("hub-lower-content", "related-banner", ["hub"], "Hub page-one banner after related and supporting content.", true),
  "printable-header-banner": banner("printable-header-banner", "top-banner", ["printable"], "Printable responsive banner below the global header and before breadcrumbs."),
  "printable-after-related": banner("printable-after-related", "related-banner", ["printable"], "Printable lower banner after related printable and collection content."),
  "home-supporting-square": square("home-supporting-square", ["home"], "Homepage square allocation inside the compact supporting information section."),
  "coloring-pages-supporting-square": square("coloring-pages-supporting-square", ["gallery"], "Gallery square allocation inside the compact information section."),
  "hub-post-header-banner": banner("hub-post-header-banner", "post-header-banner", ["hub", "hub-pagination"], "Hub responsive banner after the initial gallery results and pagination controls."),
  "hub-supporting-square": square("hub-supporting-square", ["hub"], "Hub page-one square allocation between two related-collection groups."),
  "printable-post-header-banner": banner("printable-post-header-banner", "post-header-banner", ["printable"], "Printable responsive banner after the complete artwork and action workspace."),
  "printable-supporting-square": square("printable-supporting-square", ["printable"], "Printable square allocation after related printable cards and before related collections."),
  "trust-header-banner": banner("trust-header-banner", "top-banner", ["trust"], "Reduced trust-page banner below the global header."),
  "sitemap-header-banner": banner("sitemap-header-banner", "top-banner", ["html-sitemap"], "Reduced human-sitemap banner below the global header."),
};

export const ADSENSE_SLOT_IDS: Record<AdSlotId, string> = {
  "rail-left-desktop": ADSENSE_AD_UNIT_IDS.leftSidebar,
  "rail-right-desktop": ADSENSE_AD_UNIT_IDS.rightSidebar,
  "home-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "home-after-hero": ADSENSE_AD_UNIT_IDS.headerBanner,
  "home-lower-content": ADSENSE_AD_UNIT_IDS.lowerBanner,
  "coloring-pages-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "coloring-pages-after-featured": ADSENSE_AD_UNIT_IDS.headerBanner,
  "coloring-pages-lower-content": ADSENSE_AD_UNIT_IDS.lowerBanner,
  "hub-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "hub-after-gallery": ADSENSE_AD_UNIT_IDS.lowerBanner,
  "hub-lower-content": ADSENSE_AD_UNIT_IDS.lowerBanner,
  "printable-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "printable-after-related": ADSENSE_AD_UNIT_IDS.lowerBanner,
  "home-supporting-square": ADSENSE_AD_UNIT_IDS.square,
  "coloring-pages-supporting-square": ADSENSE_AD_UNIT_IDS.square,
  "hub-post-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "hub-supporting-square": ADSENSE_AD_UNIT_IDS.square,
  "printable-post-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "printable-supporting-square": ADSENSE_AD_UNIT_IDS.square,
  "trust-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
  "sitemap-header-banner": ADSENSE_AD_UNIT_IDS.headerBanner,
};

export const AD_PAGE_LAYOUTS: Record<AdPageFamily, AdPageLayout> = {
  home: fullLayout({
    "top-banner": "home-header-banner",
    "post-header-banner": "home-after-hero",
    "supporting-square": "home-supporting-square",
    "related-banner": "home-lower-content",
  }),
  gallery: fullLayout({
    "top-banner": "coloring-pages-header-banner",
    "post-header-banner": "coloring-pages-after-featured",
    "supporting-square": "coloring-pages-supporting-square",
    "related-banner": "coloring-pages-lower-content",
  }),
  "gallery-pagination": condensedLayout({
    "top-banner": "coloring-pages-header-banner",
    "post-header-banner": "coloring-pages-after-featured",
    "related-banner": "coloring-pages-lower-content",
  }),
  hub: fullLayout({
    "top-banner": "hub-header-banner",
    "post-header-banner": "hub-post-header-banner",
    "supporting-square": "hub-supporting-square",
    "related-banner": "hub-lower-content",
  }),
  "hub-pagination": condensedLayout({
    "top-banner": "hub-header-banner",
    "post-header-banner": "hub-post-header-banner",
    "related-banner": "hub-after-gallery",
  }),
  printable: fullLayout({
    "top-banner": "printable-header-banner",
    "post-header-banner": "printable-post-header-banner",
    "supporting-square": "printable-supporting-square",
    "related-banner": "printable-after-related",
  }),
  trust: { mode: "none", sideRailsAllowed: false, slots: {} },
  "html-sitemap": { mode: "none", sideRailsAllowed: false, slots: {} },
  "not-found": { mode: "none", sideRailsAllowed: false, slots: {} },
};

export function getAdSlotDefinition(slotId: AdSlotId) {
  return AD_SLOT_DEFINITIONS[slotId];
}

export function getAdsenseSlotId(slotId: AdSlotId) {
  return ADSENSE_SLOT_IDS[slotId];
}

export function hasValidAdSenseConfiguration() {
  return /^pub-\d{16}$/.test(ADSENSE_PUBLISHER_ID)
    && /^ca-pub-\d{16}$/.test(ADSENSE_CLIENT_ID)
    && Object.values(ADSENSE_SLOT_IDS).every((slotId) => /^\d{10}$/.test(slotId));
}

export function getAdPageLayout(pageFamily: AdPageFamily) {
  return AD_PAGE_LAYOUTS[pageFamily];
}

export function getFixedHeaderSize(viewportWidth: number) {
  if (viewportWidth < 360) return AD_FIXED_HEADER_SIZES.narrow;
  if (viewportWidth <= AD_BREAKPOINTS.mobileMaxWidth) return AD_FIXED_HEADER_SIZES.mobile;
  if (viewportWidth <= AD_BREAKPOINTS.tabletMaxWidth) return AD_FIXED_HEADER_SIZES.tablet;
  return AD_FIXED_HEADER_SIZES.desktop;
}

export function getAdInitializationMinimumSize(placement: AdLogicalPlacement, viewportWidth: number) {
  if (placement === "top-banner") return { ...getFixedHeaderSize(viewportWidth), exact: true } as const;
  if (placement === "left-rail" || placement === "right-rail") {
    return { width: 300, height: 600, exact: true } as const;
  }
  if (placement === "supporting-square") return { width: 250, height: 250, exact: false } as const;
  return { width: 250, height: 50, exact: false } as const;
}

export function getAdSlotForPlacement(pageFamily: AdPageFamily, placement: AdLogicalPlacement) {
  const slotId = AD_PAGE_LAYOUTS[pageFamily].slots[placement];
  if (!slotId) return null;
  const slot = AD_SLOT_DEFINITIONS[slotId];
  if (!slot.supportedPageFamilies.includes(pageFamily)) {
    throw new Error(`Advertisement slot ${slotId} does not support ${pageFamily}`);
  }
  return slotId;
}

function allViewports() {
  return { desktop: true, tablet: true, mobile: true };
}

function sizes(desktop: AdViewportDimensions, tablet: AdViewportDimensions, mobile: AdViewportDimensions) {
  return { desktop, tablet, mobile };
}

function banner(
  slotId: AdSlotId,
  logicalPlacement: Extract<AdLogicalPlacement, "top-banner" | "post-header-banner" | "related-banner">,
  supportedPageFamilies: AdPageFamily[],
  description: string,
  suppressedOnPaginatedPages = false,
): AdSlotDefinition {
  return {
    slotId,
    label: "Advertisement",
    logicalPlacement,
    placementFamily: "responsive-banner",
    supportedPageFamilies,
    eligibility: allViewports(),
    reservedSize: bannerSize,
    minimumSpacing: logicalPlacement === "related-banner" ? 48 : 24,
    sideRailsAllowed: false,
    suppressedOnPaginatedPages,
    description,
  };
}

function square(slotId: AdSlotId, supportedPageFamilies: AdPageFamily[], description: string): AdSlotDefinition {
  return {
    slotId,
    label: "Advertisement",
    logicalPlacement: "supporting-square",
    placementFamily: "supporting-square",
    supportedPageFamilies,
    eligibility: allViewports(),
    reservedSize: squareSize,
    minimumSpacing: 32,
    sideRailsAllowed: false,
    suppressedOnPaginatedPages: true,
    description,
  };
}

function rail(
  slotId: AdSlotId,
  logicalPlacement: Extract<AdLogicalPlacement, "left-rail" | "right-rail">,
  description: string,
): AdSlotDefinition {
  return {
    slotId,
    label: "Advertisement",
    logicalPlacement,
    placementFamily: "desktop-rail",
    supportedPageFamilies: ["home", "gallery", "hub", "printable"],
    eligibility: { desktop: true, tablet: false, mobile: false },
    reservedSize: railSize,
    minimumSpacing: 24,
    sideRailsAllowed: true,
    suppressedOnPaginatedPages: true,
    description,
  };
}

function fullLayout(slots: Partial<Record<AdLogicalPlacement, AdSlotId>>): AdPageLayout {
  return {
    mode: "full",
    sideRailsAllowed: true,
    slots: { ...slots, "left-rail": "rail-left-desktop", "right-rail": "rail-right-desktop" },
  };
}

function condensedLayout(slots: Partial<Record<AdLogicalPlacement, AdSlotId>>): AdPageLayout {
  return { mode: "condensed", sideRailsAllowed: false, slots };
}
