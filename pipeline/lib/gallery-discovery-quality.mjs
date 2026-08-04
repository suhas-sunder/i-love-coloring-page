const GENERIC_TOKENS = new Set([
  "color",
  "coloring",
  "design",
  "free",
  "page",
  "printable",
]);

const BROAD_TOKENS = new Set([
  "animal",
  "anime",
  "chibi",
  "creature",
  "fantasy",
  "girl",
  "holiday",
  "pattern",
  "plant",
  "plushie",
  "vehicle",
]);

export function getDiscoveryTokenProfile(value) {
  const tokens = [...new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizeToken)
      .filter((token) => token && !GENERIC_TOKENS.has(token)),
  )];

  return {
    tokens,
    strongTokens: tokens.filter((token) => !BROAD_TOKENS.has(token) && !/^\d+$/.test(token)),
    broadTokens: tokens.filter((token) => BROAD_TOKENS.has(token)),
  };
}

export function countTokenOverlap(left, right) {
  const rightStrong = new Set(right.strongTokens);
  const rightBroad = new Set(right.broadTokens);
  return {
    strong: left.strongTokens.reduce((count, token) => count + Number(rightStrong.has(token)), 0),
    broad: left.broadTokens.reduce((count, token) => count + Number(rightBroad.has(token)), 0),
  };
}

export function buildHubTokenProfile(assetIds, recordByAssetId) {
  const strongMemberCounts = new Map();
  const broadMemberCounts = new Map();

  for (const assetId of assetIds) {
    const record = recordByAssetId.get(assetId);
    if (!record) continue;
    const profile = getDiscoveryTokenProfile(record.publicTitle || record.displayTitle);
    for (const token of profile.strongTokens) increment(strongMemberCounts, token);
    for (const token of profile.broadTokens) increment(broadMemberCounts, token);
  }

  return { strongMemberCounts, broadMemberCounts };
}

export function scoreHubInventoryTokenMatch(recordProfile, hubProfile, hubAssetCount) {
  const safeAssetCount = Math.max(1, hubAssetCount);
  let matchedStrongMembers = 0;
  let matchedBroadMembers = 0;
  let matchedStrongTokenCount = 0;

  for (const token of recordProfile.strongTokens) {
    const memberCount = hubProfile.strongMemberCounts.get(token) || 0;
    matchedStrongMembers += memberCount;
    matchedStrongTokenCount += Number(memberCount > 0);
  }
  for (const token of recordProfile.broadTokens) {
    matchedBroadMembers += hubProfile.broadMemberCounts.get(token) || 0;
  }

  const cappedStrongMatches = Math.min(matchedStrongMembers, 12);
  const strongCoverage = Math.min(1, matchedStrongMembers / safeAssetCount);
  const requiredStrongTokenMatches = Math.min(2, recordProfile.strongTokens.length);
  const hasBalancedStrongEvidence = requiredStrongTokenMatches > 0
    && matchedStrongMembers >= 2
    && matchedStrongTokenCount >= requiredStrongTokenMatches;
  return {
    matchedStrongMembers,
    matchedStrongTokenCount,
    matchedBroadMembers,
    score:
      Number(hasBalancedStrongEvidence) * 200_000
      + cappedStrongMatches * 5_000
      + Math.round(strongCoverage * 5_000_000)
      + Math.min(matchedBroadMembers, 12) * 1_000,
  };
}

function increment(counts, token) {
  counts.set(token, (counts.get(token) || 0) + 1);
}

function normalizeToken(token) {
  if (token.length <= 3 || token.endsWith("ss")) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ches") || token.endsWith("shes") || token.endsWith("xes") || token.endsWith("zes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}
