import { getAdSlotDefinition } from "@/lib/ads/config";
import { resolveAdMode } from "@/lib/ads/mode";
import type { AdSlotId } from "@/lib/ads/types";

type AdSlotProps = {
  slotId: AdSlotId;
  className?: string;
};

export function AdSlot({ slotId, className }: AdSlotProps) {
  const slot = getAdSlotDefinition(slotId);
  const configuration = resolveAdMode();
  if (configuration.mode === "off") return null;

  const classes = [...new Set(["ad-slot", `ad-slot-${slot.logicalPlacement}`, `ad-slot-${slot.placementFamily}`, className].filter(Boolean))].join(" ");
  const externalSlotId = configuration.slotIds[slotId];
  if (configuration.mode === "live" && (!configuration.publisherId || !externalSlotId)) return null;

  return (
    <div
      className={classes}
      id={`ad-slot-${slot.slotId}`}
      aria-label={configuration.mode === "placeholder" ? "Advertisement" : undefined}
      data-ad-mode={configuration.mode}
      data-ad-placeholder={configuration.mode === "placeholder" ? "true" : undefined}
      data-ad-slot={slot.slotId}
      data-ad-logical-placement={slot.logicalPlacement}
    >
      {configuration.mode === "placeholder" ? (
        <>
          <span className="ad-slot-label">Advertisement</span>
          <span className="ad-slot-development-note">Development placeholder</span>
        </>
      ) : (
        <ins
          className="ad-slot-live-unit"
          data-ad-client={configuration.publisherId!}
          data-ad-slot={externalSlotId!}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </div>
  );
}
