import { getAdSlotForPlacement } from "@/lib/ads/config";
import type { AdPageFamily } from "@/lib/ads/types";

import { AdSlot } from "./AdSlot";

type AdRailProps = {
  side: "left" | "right";
  pageFamily: AdPageFamily;
};

export function AdRail({ side, pageFamily }: AdRailProps) {
  const sideClass = side === "left" ? "ad-rail-left" : "ad-rail-right";
  const slotId = getAdSlotForPlacement(pageFamily, side === "left" ? "left-rail" : "right-rail");
  if (!slotId) return null;

  return (
    <aside
      className={`ad-rail ${sideClass}`}
      aria-label={`${side} desktop advertising rail`}
      data-ad-rail={side}
      data-ad-rail-size="300x600"
    >
      <AdSlot slotId={slotId} pageFamily={pageFamily} />
    </aside>
  );
}
