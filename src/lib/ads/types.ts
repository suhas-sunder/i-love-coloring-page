export type AdPageFamily =
  | "home"
  | "gallery"
  | "gallery-pagination"
  | "hub"
  | "hub-pagination"
  | "printable"
  | "trust"
  | "html-sitemap"
  | "not-found";

export type AdLayoutMode = "full" | "condensed" | "none";

export type AdLogicalPlacement =
  | "top-banner"
  | "left-rail"
  | "right-rail"
  | "post-header-banner"
  | "supporting-square"
  | "related-banner";

export type AdPlacementFamily = "responsive-banner" | "desktop-rail" | "supporting-square";

export type AdSlotId =
  | "rail-left-desktop"
  | "rail-right-desktop"
  | "home-header-banner"
  | "home-after-hero"
  | "home-lower-content"
  | "coloring-pages-header-banner"
  | "coloring-pages-after-featured"
  | "coloring-pages-lower-content"
  | "hub-header-banner"
  | "hub-after-gallery"
  | "hub-lower-content"
  | "printable-header-banner"
  | "printable-after-related"
  | "home-supporting-square"
  | "coloring-pages-supporting-square"
  | "hub-post-header-banner"
  | "hub-supporting-square"
  | "printable-post-header-banner"
  | "printable-supporting-square"
  | "trust-header-banner"
  | "sitemap-header-banner";

export type AdViewportDimensions = {
  width: number;
  height: number;
};

export type AdSlotDefinition = {
  slotId: AdSlotId;
  label: "Advertisement";
  logicalPlacement: AdLogicalPlacement;
  placementFamily: AdPlacementFamily;
  supportedPageFamilies: AdPageFamily[];
  eligibility: {
    desktop: boolean;
    tablet: boolean;
    mobile: boolean;
  };
  reservedSize: {
    desktop: AdViewportDimensions;
    tablet: AdViewportDimensions;
    mobile: AdViewportDimensions;
  };
  minimumSpacing: number;
  sideRailsAllowed: boolean;
  suppressedOnPaginatedPages: boolean;
  description: string;
};

export type AdPageLayout = {
  mode: AdLayoutMode;
  sideRailsAllowed: boolean;
  slots: Partial<Record<AdLogicalPlacement, AdSlotId>>;
};
