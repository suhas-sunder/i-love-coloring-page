export function getPromotionCluster(policy, hubId) {
  return policy.promotionClusters.find((cluster) => cluster.hubIds.includes(hubId)) || null;
}

export function selectClusteredHubIds(candidateHubIds, { currentHubId = null, limit = candidateHubIds.length, policy }) {
  const candidates = [...new Set(candidateHubIds)].filter((hubId) => hubId && hubId !== currentHubId);
  const candidateSet = new Set(candidates);
  const selectedByCluster = new Map();

  for (const cluster of policy.promotionClusters) {
    const available = cluster.hubIds.filter((hubId) => candidateSet.has(hubId) && hubId !== currentHubId);
    if (available.length === 0) continue;

    let selected = available.includes(cluster.preferredHubId) ? cluster.preferredHubId : available[0];
    const exactDuplicates = cluster.exactDuplicateHubIds || [];
    if (exactDuplicates.includes(currentHubId)) {
      if (currentHubId === cluster.preferredHubId) {
        selected = available.find((hubId) => !exactDuplicates.includes(hubId)) || null;
      } else if (available.includes(cluster.preferredHubId)) {
        selected = cluster.preferredHubId;
      }
    }
    selectedByCluster.set(cluster.id, selected);
  }

  const output = [];
  const emittedClusters = new Set();
  for (const hubId of candidates) {
    const cluster = getPromotionCluster(policy, hubId);
    if (cluster) {
      if (emittedClusters.has(cluster.id)) continue;
      emittedClusters.add(cluster.id);
      const selected = selectedByCluster.get(cluster.id);
      if (selected) output.push(selected);
    } else {
      output.push(hubId);
    }
    if (output.length >= limit) break;
  }
  return output;
}

export function hasPromotionClusterConflict(hubIds, policy, currentHubId = null) {
  for (const cluster of policy.promotionClusters) {
    const members = hubIds.filter((hubId) => hubId !== currentHubId && cluster.hubIds.includes(hubId));
    if (members.length > 1) return true;
  }
  return false;
}
