import { AD_BREAKPOINTS, getAdSlotDefinition } from "./config";
import type { AdPageFamily, AdSlotId } from "./types";

export type AdSlotEligibilityInput = {
  slotId: AdSlotId;
  pageFamily: AdPageFamily;
  viewportWidth: number;
  liveAdvertisingEnabled: boolean;
  configurationValid: boolean;
  regionalRequirementsSatisfied: boolean;
  actuallyVisible: boolean;
  nearViewport: boolean;
  alreadyInitialized: boolean;
};

export type AdSlotEligibilityDecision = {
  eligible: boolean;
  reason:
    | "eligible"
    | "live-disabled"
    | "invalid-configuration"
    | "regional-requirements"
    | "page-family"
    | "breakpoint"
    | "css-hidden"
    | "outside-load-range"
    | "already-initialized";
};

export function evaluateAdSlotEligibility(input: AdSlotEligibilityInput): AdSlotEligibilityDecision {
  if (!input.liveAdvertisingEnabled) return denied("live-disabled");
  if (!input.configurationValid) return denied("invalid-configuration");
  if (!input.regionalRequirementsSatisfied) return denied("regional-requirements");

  const slot = getAdSlotDefinition(input.slotId);
  if (!slot.supportedPageFamilies.includes(input.pageFamily)) return denied("page-family");
  if (!isAdSlotAllowedAtWidth(input.slotId, input.viewportWidth)) return denied("breakpoint");
  if (!input.actuallyVisible) return denied("css-hidden");
  if (!input.nearViewport) return denied("outside-load-range");
  if (input.alreadyInitialized) return denied("already-initialized");
  return { eligible: true, reason: "eligible" };
}

export function isAdSlotAllowedAtWidth(slotId: AdSlotId, viewportWidth: number) {
  const slot = getAdSlotDefinition(slotId);
  if (slot.placementFamily === "desktop-rail") return viewportWidth >= AD_BREAKPOINTS.sideRailsMinWidth;
  if (viewportWidth <= AD_BREAKPOINTS.mobileMaxWidth) return slot.eligibility.mobile;
  if (viewportWidth <= AD_BREAKPOINTS.tabletMaxWidth) return slot.eligibility.tablet;
  return slot.eligibility.desktop;
}

export function isAdPageFamily(value: string | undefined): value is AdPageFamily {
  return ["home", "gallery", "gallery-pagination", "hub", "hub-pagination", "printable", "trust", "html-sitemap", "not-found"].includes(value || "");
}

function denied(reason: Exclude<AdSlotEligibilityDecision["reason"], "eligible">): AdSlotEligibilityDecision {
  return { eligible: false, reason };
}
