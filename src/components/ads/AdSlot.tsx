import { getAdSlotDefinition } from "@/lib/ads/config";
import type { AdSlotId } from "@/lib/ads/types";

type AdSlotProps = {
  slotId: AdSlotId;
  className?: string;
};

export function AdSlot({ slotId, className }: AdSlotProps) {
  const slot = getAdSlotDefinition(slotId);
  const classes = [...new Set(["ad-slot", `ad-slot-${slot.logicalPlacement}`, `ad-slot-${slot.placementFamily}`, className].filter(Boolean))].join(" ");

  return (
    <div
      className={classes}
      id={`ad-slot-${slot.slotId}`}
      data-ad-placeholder="true"
      data-ad-slot={slot.slotId}
      data-ad-logical-placement={slot.logicalPlacement}
    >
      <span className="ad-slot-label">Advertisement</span>
    </div>
  );
}
