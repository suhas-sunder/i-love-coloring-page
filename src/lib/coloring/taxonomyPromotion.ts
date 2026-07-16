import policyJson from "@/config/taxonomy-promotion-policy.json";

import type { ColoringHub } from "./types";

type PromotionCluster = {
  id: string;
  preferredHubId: string;
  hubIds: string[];
  exactDuplicateHubIds?: string[];
};

type TaxonomyPromotionPolicy = {
  promotionClusters: PromotionCluster[];
};

const policy = policyJson as TaxonomyPromotionPolicy;

export function selectPromotedHubs(currentHub: ColoringHub, candidates: ColoringHub[], limit: number) {
  const byId = new Map(candidates.map((hub) => [hub.hubId, hub]));
  const candidateIds = [...byId.keys()].filter((hubId) => hubId !== currentHub.hubId);
  const selectedByCluster = new Map<string, string | null>();

  for (const cluster of policy.promotionClusters) {
    const available = cluster.hubIds.filter((hubId) => byId.has(hubId) && hubId !== currentHub.hubId);
    if (available.length === 0) continue;
    let selected: string | null = available.includes(cluster.preferredHubId) ? cluster.preferredHubId : available[0];
    const exactDuplicates = cluster.exactDuplicateHubIds || [];
    if (exactDuplicates.includes(currentHub.hubId)) {
      selected = available.find((hubId) => !exactDuplicates.includes(hubId)) || null;
    }
    selectedByCluster.set(cluster.id, selected);
  }

  const output: ColoringHub[] = [];
  const emittedClusters = new Set<string>();
  for (const hubId of candidateIds) {
    const cluster = policy.promotionClusters.find((entry) => entry.hubIds.includes(hubId));
    if (cluster) {
      if (emittedClusters.has(cluster.id)) continue;
      emittedClusters.add(cluster.id);
      const selected = selectedByCluster.get(cluster.id);
      const hub = selected ? byId.get(selected) : null;
      if (hub) output.push(hub);
    } else {
      const hub = byId.get(hubId);
      if (hub) output.push(hub);
    }
    if (output.length >= Math.max(0, limit)) break;
  }
  return output;
}
