import { ADSENSE_CLIENT_ID, hasValidAdSenseConfiguration } from "@/lib/ads/config";

import { AdSenseRuntime } from "./AdSenseRuntime";

export function AdSenseScript() {
  if (!hasValidAdSenseConfiguration()) return null;
  return <AdSenseRuntime clientId={ADSENSE_CLIENT_ID} />;
}
