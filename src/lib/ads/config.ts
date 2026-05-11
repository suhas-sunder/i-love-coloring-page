import type { AdSlotDefinition, AdSlotId } from "./types";

export const AD_SLOT_DEFINITIONS: Record<AdSlotId, AdSlotDefinition> = {
  "rail-left-desktop": {
    slotId: "rail-left-desktop",
    label: "Advertisement",
    placement: "desktop-rail",
    size: "side-rail",
    description: "Wide-desktop left rail outside the main reading and gallery column.",
  },
  "rail-right-desktop": {
    slotId: "rail-right-desktop",
    label: "Advertisement",
    placement: "desktop-rail",
    size: "side-rail",
    description: "Wide-desktop right rail outside the main reading and gallery column.",
  },
  "home-header-banner": {
    slotId: "home-header-banner",
    label: "Advertisement",
    placement: "header-banner",
    size: "responsive-banner",
    description: "Homepage desktop responsive banner below the header and above the hero.",
  },
  "home-after-hero": {
    slotId: "home-after-hero",
    label: "Advertisement",
    placement: "inline",
    size: "fluid-inline",
    description: "Homepage mobile and tablet banner after the hero and preview area.",
  },
  "home-lower-content": {
    slotId: "home-lower-content",
    label: "Advertisement",
    placement: "lower-content",
    size: "fluid-inline",
    description: "Homepage lower slot reserved for a future density pass.",
  },
  "coloring-pages-header-banner": {
    slotId: "coloring-pages-header-banner",
    label: "Advertisement",
    placement: "header-banner",
    size: "responsive-banner",
    description: "Gallery landing desktop responsive banner below the header and above the page hero.",
  },
  "coloring-pages-after-featured": {
    slotId: "coloring-pages-after-featured",
    label: "Advertisement",
    placement: "inline",
    size: "fluid-inline",
    description: "Coloring pages landing mobile and tablet banner after featured art, before secondary browse sections.",
  },
  "coloring-pages-lower-content": {
    slotId: "coloring-pages-lower-content",
    label: "Advertisement",
    placement: "lower-content",
    size: "fluid-inline",
    description: "Coloring pages lower slot reserved for a future density pass.",
  },
  "hub-header-banner": {
    slotId: "hub-header-banner",
    label: "Advertisement",
    placement: "header-banner",
    size: "responsive-banner",
    description: "Hub-page desktop responsive banner below the header and above the hub hero.",
  },
  "hub-after-gallery": {
    slotId: "hub-after-gallery",
    label: "Advertisement",
    placement: "inline",
    size: "fluid-inline",
    description: "Hub-page mobile and tablet banner after users see gallery content and page controls.",
  },
  "hub-lower-content": {
    slotId: "hub-lower-content",
    label: "Advertisement",
    placement: "lower-content",
    size: "fluid-inline",
    description: "Hub-page lower slot reserved for a future density pass.",
  },
};

export function getAdSlotDefinition(slotId: AdSlotId) {
  return AD_SLOT_DEFINITIONS[slotId];
}
