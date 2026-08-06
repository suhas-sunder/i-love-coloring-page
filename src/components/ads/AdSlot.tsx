import { ADSENSE_CLIENT_ID, getAdsenseSlotId, getAdSlotDefinition, hasValidAdSenseConfiguration } from "@/lib/ads/config";
import type { AdPageFamily, AdSlotId } from "@/lib/ads/types";

type AdSlotProps = {
  slotId: AdSlotId;
  pageFamily: AdPageFamily;
  className?: string;
};

export function AdSlot({ slotId, pageFamily, className }: AdSlotProps) {
  const slot = getAdSlotDefinition(slotId);
  const isFixedHeader = slot.logicalPlacement === "top-banner";
  const positionMarker = slot.logicalPlacement === "post-header-banner"
    ? "post-header"
    : slot.logicalPlacement === "supporting-square"
      ? "supporting-square"
      : slot.logicalPlacement === "related-banner"
        ? "lower-content"
        : undefined;
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
      data-ad-position={positionMarker}
      data-ad-flow-version={slot.logicalPlacement === "post-header-banner" ? "balanced-mid-content-v1" : undefined}
      data-ad-size-policy={isFixedHeader ? "fixed-header-v1" : undefined}
      data-ad-fixed-width={isFixedHeader ? "728" : undefined}
      data-ad-fixed-height={isFixedHeader ? "90" : undefined}
    >
      <ins
        className="adsbygoogle ad-slot-live-unit"
        aria-label="Advertisement"
        style={isFixedHeader ? { display: "block", width: "100%", height: "100%" } : undefined}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={externalSlotId}
        data-ad-format={isFixedHeader ? undefined : "auto"}
        data-full-width-responsive={isFixedHeader ? undefined : "true"}
      />
      <div className="ad-slot-fallback" aria-hidden="true" data-ad-fallback="true" hidden>
        <span className="ad-slot-label">Advertisement</span>
        <span className="ad-slot-fallback-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
