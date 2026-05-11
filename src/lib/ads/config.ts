import type { AdSlotDefinition, AdSlotId } from "./types";

const showAdPlaceholdersValue = process.env.NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS;

export function showAdPlaceholders() {
  return showAdPlaceholdersValue === "1" || showAdPlaceholdersValue?.toLowerCase() === "true";
}

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
    description: "Homepage responsive banner below the header and above the hero.",
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
  "coloring-pages-header-banner": {
    slotId: "coloring-pages-header-banner",
    label: "Advertisement",
    placement: "header-banner",
    size: "responsive-banner",
    description: "Gallery landing responsive banner below the header and above the page hero.",
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
  "hub-header-banner": {
    slotId: "hub-header-banner",
    label: "Advertisement",
    placement: "header-banner",
    size: "responsive-banner",
    description: "Hub-page responsive banner below the header and above the hub hero.",
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
