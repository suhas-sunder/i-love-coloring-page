import type { AdSlotDefinition, AdSlotId } from "./types";

const showAdPlaceholdersValue = process.env.NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS;

export function showAdPlaceholders() {
  return showAdPlaceholdersValue === "1" || showAdPlaceholdersValue?.toLowerCase() === "true";
}

export const AD_SLOT_DEFINITIONS: Record<AdSlotId, AdSlotDefinition> = {
  "global-desktop-rail": {
    slotId: "global-desktop-rail",
    label: "Advertisement",
    placement: "desktop-rail",
    size: "side-rail",
    description: "Optional wide-desktop rail outside the main reading and gallery column.",
  },
  "home-after-hero": {
    slotId: "home-after-hero",
    label: "Advertisement",
    placement: "inline",
    size: "fluid-inline",
    description: "Homepage inline slot after the hero and preview area.",
  },
  "home-lower-content": {
    slotId: "home-lower-content",
    label: "Advertisement",
    placement: "lower-content",
    size: "fluid-inline",
    description: "Homepage lower slot after meaningful browse content.",
  },
  "coloring-pages-after-featured": {
    slotId: "coloring-pages-after-featured",
    label: "Advertisement",
    placement: "inline",
    size: "fluid-inline",
    description: "Coloring pages landing slot after featured art, before secondary browse sections.",
  },
  "coloring-pages-lower-content": {
    slotId: "coloring-pages-lower-content",
    label: "Advertisement",
    placement: "lower-content",
    size: "fluid-inline",
    description: "Coloring pages lower slot after collection groups.",
  },
  "hub-after-gallery": {
    slotId: "hub-after-gallery",
    label: "Advertisement",
    placement: "inline",
    size: "fluid-inline",
    description: "Hub-page slot after users see gallery content and page controls.",
  },
  "hub-lower-content": {
    slotId: "hub-lower-content",
    label: "Advertisement",
    placement: "lower-content",
    size: "fluid-inline",
    description: "Hub-page lower slot near related collections and supporting content.",
  },
};

export function getAdSlotDefinition(slotId: AdSlotId) {
  return AD_SLOT_DEFINITIONS[slotId];
}
