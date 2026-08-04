const SHARED_FUNCTIONAL_PHRASES = new Set([
  "coloring page",
  "coloring pages",
  "printable page",
  "printable pages",
  "download image",
  "us letter",
]);

const VAGUE_PHRASES = [
  "appear",
  "designs show",
  "this collection includes",
  "perfect for",
  "great for",
];

const UNSUPPORTED_CLAIMS = /\b(?:all ages|age range|beginner|difficulty|easy to color|educational outcome|therapy|therapeutic|teacher[- ]approved|most popular|trending|download counts?|user ratings?|a4|commercial use)\b/i;
const INTERNAL_LEAKAGE = /(?:chatgpt|\bfailed\b|pipeline|asset[ -]?id|stable[ -]?id|source filename|r2\.dev|cloudflarestorage|amazonaws|file:\/\/|localhost|127\.0\.0\.1|\.(?:svg|png|webp|jpe?g)\s*$)/i;

export function analyzeHubEditorialQuality(hubs, { nearDuplicateThreshold = 0.68 } = {}) {
  const entries = hubs.map((hub) => ({
    hubId: hub.hubId,
    route: hub.route,
    title: hub.title,
    intro: String(hub.intro || "").trim(),
    assetCount: hub.assetCount,
    memberTitles: hub.memberTitles || [],
  }));
  const exactIntroGroups = groupDuplicates(entries, (entry) => normalize(entry.intro));
  const nearDuplicateIntroPairs = [];
  const tokenSets = entries.map((entry) => significantTokens(entry.intro));
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      if (tokenSets[left].size < 5 || tokenSets[right].size < 5) continue;
      const similarity = jaccard(tokenSets[left], tokenSets[right]);
      if (similarity < nearDuplicateThreshold) continue;
      nearDuplicateIntroPairs.push(pairEvidence(entries[left], entries[right], similarity));
    }
  }

  const openingGroups = groupDuplicates(entries, (entry) => sentenceOpening(entry.intro))
    .filter((group) => group.key && group.entries.length >= 3);
  const vaguePhraseFindings = VAGUE_PHRASES.flatMap((phrase) => entries
    .filter((entry) => normalize(entry.intro).includes(phrase))
    .map((entry) => ({ phrase, hubId: entry.hubId, route: entry.route, intro: entry.intro })));
  const unsupportedClaimFindings = entries
    .filter((entry) => UNSUPPORTED_CLAIMS.test(entry.intro))
    .map(summarize);
  const internalLeakageFindings = entries
    .filter((entry) => INTERNAL_LEAKAGE.test(entry.intro))
    .map(summarize);
  const repeatedHubNameFindings = entries
    .filter((entry) => repeatedSubjectPhrase(entry.title, entry.intro))
    .map(summarize);
  const inventoryMismatchFindings = entries
    .filter((entry) => entry.memberTitles.length && !hasInventoryEvidence(entry))
    .map(summarize);

  return {
    summary: {
      hubCount: entries.length,
      exactDuplicateIntroGroupCount: exactIntroGroups.length,
      nearDuplicateIntroPairCount: nearDuplicateIntroPairs.length,
      repeatedOpeningGroupCount: openingGroups.length,
      vaguePhraseFindingCount: vaguePhraseFindings.length,
      unsupportedClaimCount: unsupportedClaimFindings.length,
      internalLeakageCount: internalLeakageFindings.length,
      repeatedHubNameCount: repeatedHubNameFindings.length,
      inventoryMismatchCount: inventoryMismatchFindings.length,
    },
    exactIntroGroups,
    nearDuplicateIntroPairs: nearDuplicateIntroPairs.sort((a, b) => b.similarity - a.similarity),
    openingGroups,
    vaguePhraseFindings,
    unsupportedClaimFindings,
    internalLeakageFindings,
    repeatedHubNameFindings,
    inventoryMismatchFindings,
  };
}

export function normalizeEditorialText(value) {
  return normalize(value);
}

function hasInventoryEvidence(entry) {
  const titleTokens = significantTokens(entry.title);
  const introTokens = significantTokens(entry.intro);
  const memberTokens = significantTokens(entry.memberTitles.join(" "));
  return [...introTokens].some((token) => titleTokens.has(token) || memberTokens.has(token));
}

function repeatedSubjectPhrase(title, intro) {
  const subject = [...significantTokens(title)];
  if (!subject.length) return false;
  const normalizedIntro = ` ${normalize(intro)} `;
  return subject.some((token) => (normalizedIntro.match(new RegExp(`\\b${escapeRegex(token)}\\b`, "g")) || []).length > 2);
}

function sentenceOpening(value) {
  return normalize(value).split(/\s+/).slice(0, 3).join(" ");
}

function significantTokens(value) {
  const tokens = normalize(value).replace(/[^a-z0-9'-]+/g, " ").split(/\s+/).filter((token) => token.length > 2).map(canonicalToken);
  const result = new Set(tokens);
  for (const phrase of SHARED_FUNCTIONAL_PHRASES) {
    for (const token of phrase.split(" ")) result.delete(token);
  }
  return result;
}

function canonicalToken(token) {
  if (token === "mythic" || token === "mythology") return "myth";
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 4) return token.slice(0, -1);
  return token;
}

function groupDuplicates(entries, keyFor) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFor(entry);
    groups.set(key, [...(groups.get(key) || []), summarize(entry)]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, entries: group }));
}

function pairEvidence(left, right, similarity) {
  return { left: summarize(left), right: summarize(right), similarity: Number(similarity.toFixed(4)) };
}

function summarize(entry) {
  return { hubId: entry.hubId, route: entry.route, title: entry.title, intro: entry.intro };
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection || 1);
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
