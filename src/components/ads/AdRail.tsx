import type { AdSlotId } from "@/lib/ads/types";

import { AdSlot } from "./AdSlot";

type AdRailProps = {
  side: "left" | "right";
  slotId: AdSlotId;
};

export function AdRail({ side, slotId }: AdRailProps) {
  const sideClass = side === "left" ? "ad-rail-left" : "ad-rail-right";

  return (
    <aside className={`ad-rail ${sideClass}`} aria-label={`${side} desktop advertising rail`}>
      <AdSlot slotId={slotId} />
    </aside>
  );
}
