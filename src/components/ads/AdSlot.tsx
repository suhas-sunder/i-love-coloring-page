import { ADSENSE_CLIENT_ID, getAdsenseSlotId, getAdSlotDefinition, hasValidAdSenseConfiguration } from "@/lib/ads/config";
import type { AdPageFamily, AdSlotId } from "@/lib/ads/types";

type AdSlotProps = {
  slotId: AdSlotId;
  pageFamily: AdPageFamily;
  className?: string;
};

export function AdSlot({ slotId, pageFamily, className }: AdSlotProps) {
  const slot = getAdSlotDefinition(slotId);
  const classes = [...new Set(["ad-slot", `ad-slot-${slot.logicalPlacement}`, `ad-slot-${slot.placementFamily}`, className].filter(Boolean))].join(" ");
  const externalSlotId = getAdsenseSlotId(slotId);
  if (!hasValidAdSenseConfiguration() || !externalSlotId) return null;

  return (
    <div
      className={classes}
      id={`ad-slot-${slot.slotId}`}
      aria-label="Advertisement"
      role="complementary"
      data-ad-fallback-policy="page-all-or-none-v1"
      data-ad-slot={slot.slotId}
      data-ad-page-family={pageFamily}
      data-ad-logical-placement={slot.logicalPlacement}
    >
      <ins
        className="adsbygoogle ad-slot-live-unit"
        aria-label="Advertisement"
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={externalSlotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <div className="ad-slot-fallback" aria-label="Advertisement" data-ad-fallback="true" hidden>
        <span className="ad-slot-label">Advertisement</span>
      </div>
    </div>
  );
}
