import type {
  AdLogicalPlacement,
  AdPageFamily,
  AdPageLayout,
  AdSlotDefinition,
  AdSlotId,
  AdViewportDimensions,
} from "./types";

export const AD_BREAKPOINTS = {
  mobileMaxWidth: 640,
  tabletMaxWidth: 1023,
  desktopMinWidth: 1024,
  sideRailsMinWidth: 1536,
} as const;

const bannerSize = sizes({ width: 728, height: 90 }, { width: 468, height: 60 }, { width: 320, height: 50 });
const squareSize = sizes({ width: 300, height: 300 }, { width: 300, height: 300 }, { width: 280, height: 280 });
const railSize = sizes({ width: 160, height: 600 }, { width: 0, height: 0 }, { width: 0, height: 0 });

export const AD_SLOT_DEFINITIONS: Record<AdSlotId, AdSlotDefinition> = {
  "rail-left-desktop": rail("rail-left-desktop", "left-rail", "Wide-desktop left rail outside the main reading and gallery column."),
  "rail-right-desktop": rail("rail-right-desktop", "right-rail", "Wide-desktop right rail outside the main reading and gallery column."),
  "home-header-banner": banner("home-header-banner", "top-banner", ["home"], "Homepage responsive banner below the global header and above the hero."),
  "home-after-hero": banner("home-after-hero", "post-header-banner", ["home"], "Homepage responsive banner after the complete hero block."),
  "home-lower-content": banner("home-lower-content", "related-banner", ["home"], "Homepage responsive banner after the final broader-browsing region."),
  "coloring-pages-header-banner": banner("coloring-pages-header-banner", "top-banner", ["gallery", "gallery-pagination"], "Gallery responsive banner below the global header and above the heading."),
  "coloring-pages-after-featured": banner("coloring-pages-after-featured", "post-header-banner", ["gallery", "gallery-pagination"], "Gallery responsive banner after breadcrumbs, H1, and the concise introduction."),
  "coloring-pages-lower-content": banner("coloring-pages-lower-content", "related-banner", ["gallery", "gallery-pagination"], "Gallery responsive banner after supporting browse and information content."),
  "hub-header-banner": banner("hub-header-banner", "top-banner", ["hub", "hub-pagination"], "Hub responsive banner below the global header and above the collection heading."),
  "hub-after-gallery": banner("hub-after-gallery", "related-banner", ["hub-pagination"], "Paginated hub banner after the concise return-to-collection region."),
  "hub-lower-content": banner("hub-lower-content", "related-banner", ["hub"], "Hub page-one banner after related and supporting content.", true),
  "printable-header-banner": banner("printable-header-banner", "top-banner", ["printable"], "Printable responsive banner below the global header and before breadcrumbs."),
  "printable-after-related": banner("printable-after-related", "related-banner", ["printable"], "Printable responsive banner immediately after related printable cards."),
  "home-supporting-square": square("home-supporting-square", ["home"], "Homepage square allocation inside the compact supporting information section."),
  "coloring-pages-supporting-square": square("coloring-pages-supporting-square", ["gallery"], "Gallery square allocation inside the compact information section."),
  "hub-post-header-banner": banner("hub-post-header-banner", "post-header-banner", ["hub", "hub-pagination"], "Hub responsive banner after the complete collection heading block."),
  "hub-supporting-square": square("hub-supporting-square", ["hub"], "Hub page-one square allocation inside the supporting information section."),
  "printable-post-header-banner": banner("printable-post-header-banner", "post-header-banner", ["printable"], "Printable responsive banner after breadcrumbs, H1, and the purpose sentence."),
  "printable-supporting-square": square("printable-supporting-square", ["printable"], "Printable square allocation beside printing guidance."),
  "trust-header-banner": banner("trust-header-banner", "top-banner", ["trust"], "Reduced trust-page banner below the global header."),
  "sitemap-header-banner": banner("sitemap-header-banner", "top-banner", ["html-sitemap"], "Reduced human-sitemap banner below the global header."),
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
  trust: condensedLayout({ "top-banner": "trust-header-banner" }),
  "html-sitemap": condensedLayout({ "top-banner": "sitemap-header-banner" }),
  "not-found": { mode: "none", sideRailsAllowed: false, slots: {} },
};

export function getAdSlotDefinition(slotId: AdSlotId) {
  return AD_SLOT_DEFINITIONS[slotId];
}

export function getAdPageLayout(pageFamily: AdPageFamily) {
  return AD_PAGE_LAYOUTS[pageFamily];
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
