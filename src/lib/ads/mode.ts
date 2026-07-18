import type { AdMode, AdSlotId, ResolvedAdMode } from "./types";

const publisherPrefix = ["ca", "pub"].join("-");
const publisherPattern = new RegExp(`^${publisherPrefix}-\\d{10,}$`);
const numericSlotPattern = /^\d+$/;

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

  const publisherId = environment.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID?.trim() ?? "";
  const slotIds = parseSlotConfiguration(environment.NEXT_PUBLIC_ADSENSE_SLOTS_JSON);
  if (!publisherPattern.test(publisherId) || Object.keys(slotIds).length === 0) {
    return resolved("off", requestedMode, "LIVE was rejected because publisher or slot configuration is missing or invalid.");
  }

  return {
    mode: "live",
    requestedMode,
    publisherId,
    slotIds,
    reason: "LIVE was explicitly requested with valid publisher and slot configuration.",
  };
}

function parseSlotConfiguration(raw: string | undefined): Partial<Record<AdSlotId, string>> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [AdSlotId, string] => typeof entry[1] === "string" && numericSlotPattern.test(entry[1])),
    );
  } catch {
    return {};
  }
}

function resolved(mode: AdMode, requestedMode: string | null, reason: string): ResolvedAdMode {
  return { mode, requestedMode, publisherId: null, slotIds: {}, reason };
}
