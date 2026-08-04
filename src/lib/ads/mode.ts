import { ADSENSE_CLIENT_ID, ADSENSE_SLOT_IDS, hasValidAdSenseConfiguration } from "./config";
import type { AdMode, AdRuntimeEnvironment, ResolvedAdMode } from "./types";

type ResolveAdModeOptions = {
  runtimeEnvironment?: AdRuntimeEnvironment;
  configurationValid?: boolean;
};

export function resolveAdMode(options: ResolveAdModeOptions = {}): ResolvedAdMode {
  const runtimeEnvironment = options.runtimeEnvironment ?? getRuntimeEnvironment();
  const configurationValid = options.configurationValid ?? hasValidAdSenseConfiguration();

  if (!configurationValid) {
    return resolved("off", "Advertising was disabled because the centralized publisher or slot configuration is invalid.");
  }

  if (runtimeEnvironment !== "production") {
    return resolved("placeholder", "Stable, non-interactive development placeholders are enabled without loading AdSense.");
  }

  return {
    mode: "live",
    publisherId: ADSENSE_CLIENT_ID,
    slotIds: ADSENSE_SLOT_IDS,
    reason: "Production uses the valid centralized AdSense publisher and slot configuration.",
  };
}

function getRuntimeEnvironment(): AdRuntimeEnvironment {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

function resolved(mode: AdMode, reason: string): ResolvedAdMode {
  return { mode, publisherId: null, slotIds: {}, reason };
}
