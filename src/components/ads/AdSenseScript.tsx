import { resolveAdMode } from "@/lib/ads/mode";

import { AdSenseRuntime } from "./AdSenseRuntime";

export function AdSenseScript() {
  const configuration = resolveAdMode();
  if (configuration.mode !== "live" || !configuration.publisherId || !configuration.regionalRequirementsSatisfied) return null;
  return <AdSenseRuntime clientId={configuration.publisherId} regionalRequirementsSatisfied />;
}
