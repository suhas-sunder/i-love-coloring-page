export type AdPlacement = "inline" | "lower-content" | "desktop-rail";

export type AdSlotId =
  | "global-desktop-rail"
  | "home-after-hero"
  | "home-lower-content"
  | "coloring-pages-after-featured"
  | "coloring-pages-lower-content"
  | "hub-after-gallery"
  | "hub-lower-content";

export type AdSlotDefinition = {
  slotId: AdSlotId;
  label: "Advertisement";
  placement: AdPlacement;
  size: "leaderboard" | "medium-rectangle" | "side-rail" | "fluid-inline";
  description: string;
};
