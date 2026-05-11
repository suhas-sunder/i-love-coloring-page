export type AdPlacement = "header-banner" | "inline" | "lower-content" | "desktop-rail";

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
  | "hub-lower-content";

export type AdSlotDefinition = {
  slotId: AdSlotId;
  label: "Advertisement";
  placement: AdPlacement;
  size: "responsive-banner" | "leaderboard" | "medium-rectangle" | "side-rail" | "fluid-inline";
  description: string;
};
