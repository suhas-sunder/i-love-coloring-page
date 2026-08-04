import { getAdSlotForPlacement } from "@/lib/ads/config";
import type { AdLogicalPlacement, AdPageFamily } from "@/lib/ads/types";

import { AdSlot } from "./AdSlot";

type PageAdSlotProps = {
  pageFamily: AdPageFamily;
  placement: Exclude<AdLogicalPlacement, "left-rail" | "right-rail">;
  className?: string;
};

export function PageAdSlot({ pageFamily, placement, className }: PageAdSlotProps) {
  const slotId = getAdSlotForPlacement(pageFamily, placement);
  if (!slotId) return null;
  return <AdSlot slotId={slotId} pageFamily={pageFamily} className={className} />;
}
