import { ADSENSE_CLIENT_ID, ADSENSE_SLOT_IDS, hasValidAdSenseConfiguration } from "./config";
import type { AdMode, ResolvedAdMode } from "./types";

export function resolveAdMode(environment: NodeJS.ProcessEnv = process.env): ResolvedAdMode {
  const requestedMode = environment.NEXT_PUBLIC_AD_MODE?.trim().toLowerCase() ?? null;
  const defaultMode: AdMode = environment.NODE_ENV === "production" ? "off" : "placeholder";
  const candidate = requestedMode || defaultMode;

  if (candidate === "off") {
    return resolved("off", requestedMode, "Advertising is explicitly disabled or production used the safe default.");
  }

  if (candidate === "placeholder") {
    return resolved("placeholder", requestedMode, "Stable development-only layout placeholders are enabled.");
  }

  if (candidate !== "live") {
    return resolved("off", requestedMode, `Unknown ad mode "${candidate}" was rejected.`);
  }

  if (!hasValidAdSenseConfiguration()) {
    return resolved("off", requestedMode, "LIVE was rejected because the centralized publisher or slot configuration is invalid.");
  }

  const regionalRequirementsSatisfied = environment.NEXT_PUBLIC_AD_REGIONAL_REQUIREMENTS_SATISFIED?.trim().toLowerCase() === "true";
  if (!regionalRequirementsSatisfied) {
    return resolved(
      "off",
      requestedMode,
      "LIVE was rejected because a certified regional consent flow or reliable regional exclusion has not been confirmed.",
    );
  }

  return {
    mode: "live",
    requestedMode,
    publisherId: ADSENSE_CLIENT_ID,
    slotIds: ADSENSE_SLOT_IDS,
    regionalRequirementsSatisfied,
    reason: "LIVE was explicitly requested with valid centralized configuration and a confirmed regional-requirements gate.",
  };
}

function resolved(mode: AdMode, requestedMode: string | null, reason: string): ResolvedAdMode {
  return { mode, requestedMode, publisherId: null, slotIds: {}, regionalRequirementsSatisfied: false, reason };
}
