import { showAdPlaceholders } from "@/lib/ads/config";
import type { AdSlotId } from "@/lib/ads/types";

import { AdSlot } from "./AdSlot";

type AdRailProps = {
  slotId?: AdSlotId;
};

export function AdRail({ slotId = "global-desktop-rail" }: AdRailProps) {
  if (!showAdPlaceholders()) return null;

  return (
    <aside className="ad-rail" aria-label="Desktop advertising rail">
      <AdSlot slotId={slotId} />
    </aside>
  );
}
