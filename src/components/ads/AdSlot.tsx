import { getAdSlotDefinition } from "@/lib/ads/config";
import type { AdSlotId } from "@/lib/ads/types";

type AdSlotProps = {
  slotId: AdSlotId;
  className?: string;
};

export function AdSlot({ slotId, className }: AdSlotProps) {
  const slot = getAdSlotDefinition(slotId);
  const classes = ["ad-slot", `ad-slot-${slot.placement}`, `ad-slot-${slot.size}`, className].filter(Boolean).join(" ");

  return (
    <aside
      className={classes}
      id={`ad-slot-${slot.slotId}`}
      aria-label="Advertisement"
      data-ad-placeholder="true"
      data-ad-slot={slot.slotId}
    >
      <span className="ad-slot-label">Advertisement</span>
    </aside>
  );
}
