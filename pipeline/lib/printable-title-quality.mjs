import { createHash } from "node:crypto";

export const DISPLAY_DESIGN_SEPARATOR = ": Design ";
export const METADATA_TITLE_SUFFIX = " | Free Printable";
export const METADATA_TITLE_MAX_LENGTH = 128;

const LEGACY_DESIGN_SEPARATOR = String.fromCodePoint(0x2014);
const DESIGN_SUFFIX_PATTERN = new RegExp(`\\s+(?::|${LEGACY_DESIGN_SEPARATOR})\\s+Design\\s+(\\d+)$`, "i");
const NORMALIZED_DASH_PATTERN = new RegExp(`[${[0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212].map((codePoint) => String.fromCodePoint(codePoint)).join("")}]`, "g");
const PUBLIC_TECHNICAL_PATTERN = /(?:chatgpt|\bfailed\b|pipeline|asset[ -]?id|stable[ -]?id|source filename|object key|r2\.dev|cloudflarestorage|amazonaws|file:\/\/|localhost|127\.0\.0\.1|[A-Za-z]:\\|\.(?:svg|png|webp|jpe?g)\s*$)/i;
const PLACEHOLDER_PATTERN = /^(?:untitled|unknown|placeholder|generic coloring page|printable|coloring page)$/i;
const HASH_FRAGMENT_PATTERN = /(?:^|[-_\s])[a-f0-9]{10,}(?:$|[-_\s])/i;
const UNCERTAIN_SPELLING_PATTERN = /\b(?:Astera|Stratofortresse|Spirite|Mustange)\b/i;
const BRAND_OR_MODEL_PATTERN = /\b(?:Audi|BMW|Chevrolet|Ferrari|Fiat|Ford|Honda|Jeep|Lamborghini|Mercedes(?: Benz)?|Nissan|Porsche|Subaru|Tesla|Toyota|Volkswagen|Volvo|Boeing|Airbus|Cessna|Lockheed|Northrop Grumman)\b/i;
const VEHICLE_CONTEXT_PATTERN = /\b(?:Vehicle|Vehiacle|Cars?|Planes?|Aircraft|Truck|Train)\b/i;
const AMBIGUOUS_NUMERIC_SUFFIX_STABLE_IDS = new Set([
  "b471567c78",
  "fa2d0c4eb0",
  "4630c54cfc",
  "f7eaf07716",
  "b8179f4941",
  "f0402271c5",
  "2848bf7c34",
  "138ccd54a8",
  "f6a28289c6",
  "2d0cdb0f1d",
]);

export const APPROVED_UNCOMMON_TITLE_WORDS = new Set([
  "ankylosaurus",
  "iguanodon",
  "mosasaurus",
  "plesiosaurus",
  "pteranodon",
  "pterodactyl",
]);

const CONFIRMED_SPELLING_DEFECT_PATTERN = /\b(?:Aligator|Bakini|Celetbrating|Dalmation|Midieval|Vehiacle)\b/i;
const PHRASE_ORDER_DEFECT_PATTERN = /\b(?:Holiday Christmas Holiday|Christmas Holiday Christmas)\b/i;
const REPEATED_ADJACENT_WORD_PATTERN = /\b([a-z][a-z'-]*)\s+\1\b/i;
const REDUNDANT_COLORING_PAGE_PATTERN = /\bcoloring page(?:\s*: Design \d+)?$/i;
const UNEXPLAINED_NUMERIC_SUFFIX_PATTERN = /\s\d+$/;

const MECHANICAL_REPLACEMENTS = Object.freeze([
  { pattern: /\bVehiacle\b/gi, replacement: "Vehicle", flag: "corrected-spelling-vehiacle" },
  { pattern: /\bMidieval\b/gi, replacement: "Medieval", flag: "corrected-spelling-midieval" },
  { pattern: /\bBakini\b/gi, replacement: "Bikini", flag: "corrected-spelling-bakini" },
  { pattern: /\bCeletbrating\b/gi, replacement: "Celebrating", flag: "corrected-spelling-celetbrating" },
  { pattern: /\bAligator\b/gi, replacement: "Alligator", flag: "corrected-spelling-aligator" },
  { pattern: /\bDalmation\b/gi, replacement: "Dalmatian", flag: "corrected-spelling-dalmation" },
  { pattern: /\bAnima Plushie\b/gi, replacement: "Animal Plushie", flag: "corrected-spelling-anima-plushie" },
  { pattern: /\bPolarbear\b/gi, replacement: "Polar Bear", flag: "corrected-spacing-polar-bear" },
  { pattern: /\bHoliday Christmas Holiday\b/gi, replacement: "Holiday Christmas", flag: "corrected-phrase-holiday-christmas-holiday" },
  { pattern: /\bChristmas Holiday Christmas\b/gi, replacement: "Christmas", flag: "corrected-phrase-christmas-holiday-christmas" },
]);

export function buildPrintableTitleAssignments(records, { previousManifest = null } = {}) {
  const previousByStableId = new Map((previousManifest?.entries || []).map((entry) => [entry.stableId, entry]));
  const prepared = records.map((record) => {
    const correction = mechanicallyCorrectTitle(record.publicTitle);
    return { ...record, correctedBaseTitle: correction.title, correctionFlags: correction.flags };
  });
  const groups = groupBy(prepared, (record) => normalizeExactTitle(record.correctedBaseTitle));
  const assignmentByAssetId = new Map();

  for (const group of groups.values()) {
    const ordered = [...group].sort(compareFrozenIdentity);
    const designNumberByStableId = assignDesignNumbers(ordered, previousByStableId);
    for (const record of ordered) {
      const designNumber = ordered.length > 1 ? designNumberByStableId.get(record.stableId) : null;
      const displayTitle = designNumber == null
        ? record.correctedBaseTitle
        : `${stripDesignSuffix(record.correctedBaseTitle)}${DISPLAY_DESIGN_SEPARATOR}${designNumber}`;
      const metadataTitle = buildMetadataTitle(displayTitle);
      assignmentByAssetId.set(record.assetId, {
        baseTitle: normalizeVisibleTitle(record.publicTitle),
        correctedBaseTitle: record.correctedBaseTitle,
        displayTitle,
        metadataTitle,
        altText: buildPrintableAltText(displayTitle),
        duplicateGroupSize: ordered.length,
        designNumber,
        correctionFlags: record.correctionFlags,
      });
    }
  }

  return assignmentByAssetId;
}

export function mechanicallyCorrectTitle(value) {
  let title = normalizeVisibleTitle(value);
  const flags = [];
  for (const correction of MECHANICAL_REPLACEMENTS) {
    if (!correction.pattern.test(title)) continue;
    correction.pattern.lastIndex = 0;
    title = title.replace(correction.pattern, correction.replacement);
    flags.push(correction.flag);
  }

  const words = title.split(" ");
  const deduplicated = [];
  let removedAdjacentWord = false;
  for (const word of words) {
    const key = normalizeWord(word);
    const previousKey = normalizeWord(deduplicated.at(-1) || "");
    if (key && key === previousKey) {
      removedAdjacentWord = true;
      continue;
    }
    deduplicated.push(word);
  }
  if (removedAdjacentWord) flags.push("corrected-duplicate-adjacent-word");
  title = deduplicated.join(" ");
  if (/\bColoring Page$/i.test(title)) {
    title = title.replace(/\s+Coloring Page$/i, "").trim();
    flags.push("corrected-redundant-coloring-page-suffix");
  }
  return { title, flags };
}

export function getGeneratedTitleQualityFlags(value, { approvedWords = APPROVED_UNCOMMON_TITLE_WORDS } = {}) {
  const title = normalizeVisibleTitle(value);
  const flags = [];
  const base = stripDesignSuffix(title);
  const words = base.split(/\s+/).filter(Boolean);
  if (!title) flags.push("empty-title");
  else if (words.length < 2) flags.push("extremely-short-title");
  if (title.length > 80) flags.push("long-title-review");
  if (CONFIRMED_SPELLING_DEFECT_PATTERN.test(title)) flags.push("confirmed-spelling-defect");
  if (REPEATED_ADJACENT_WORD_PATTERN.test(base)) flags.push("repeated-adjacent-word");
  if (PHRASE_ORDER_DEFECT_PATTERN.test(base)) flags.push("repeated-phrase-order-defect");
  if (REDUNDANT_COLORING_PAGE_PATTERN.test(title)) flags.push("redundant-coloring-page-wording");
  if (UNEXPLAINED_NUMERIC_SUFFIX_PATTERN.test(base)) flags.push("numeric-suffix-review");
  if (PUBLIC_TECHNICAL_PATTERN.test(title) || HASH_FRAGMENT_PATTERN.test(title)) flags.push("internal-leakage");
  if (PLACEHOLDER_PATTERN.test(title)) flags.push("generic-title");

  const approved = new Set([...approvedWords].map((word) => normalizeWord(word)));
  if (UNCERTAIN_SPELLING_PATTERN.test(title) && !words.some((word) => approved.has(normalizeWord(word)))) {
    flags.push("uncertain-term-review");
  }
  return flags;
}

export function buildMetadataTitle(displayTitle) {
  const subject = toColoringPageTitle(displayTitle);
  const maxSubjectLength = METADATA_TITLE_MAX_LENGTH - METADATA_TITLE_SUFFIX.length;
  const boundedSubject = subject.length <= maxSubjectLength ? subject : truncateAtWordPreservingDesign(subject, maxSubjectLength);
  return `${boundedSubject}${METADATA_TITLE_SUFFIX}`;
}

export function buildPrintableAltText(displayTitle) {
  return toColoringPageTitle(displayTitle).replace(/\s+/g, " ").trim();
}

export function toColoringPageTitle(displayTitle) {
  const normalized = normalizeVisibleTitle(displayTitle);
  const base = stripDesignSuffix(normalized);
  if (/\bcoloring page$/i.test(base)) return normalized;
  return `${normalized} coloring page`;
}

export function stripDesignSuffix(value) {
  return normalizeVisibleTitle(value).replace(DESIGN_SUFFIX_PATTERN, "").trim();
}

export function getDesignNumber(value) {
  const match = normalizeVisibleTitle(value).match(DESIGN_SUFFIX_PATTERN);
  return match ? Number(match[1]) : null;
}

export function normalizeExactTitle(value) {
  return normalizeVisibleTitle(value)
    .toLocaleLowerCase("en-US")
    .replace(/[‘’`´]/g, "'")
    .replace(NORMALIZED_DASH_PATTERN, "-");
}

export function normalizePunctuationInsensitiveTitle(value) {
  return normalizeExactTitle(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeVisibleTitle(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function getPublicTitleSafetyFlags(value, { assetId = "", stableId = "" } = {}) {
  const title = normalizeVisibleTitle(value);
  const flags = [];
  if (!title) flags.push("empty-title");
  if (PUBLIC_TECHNICAL_PATTERN.test(title)) flags.push("technical-or-file-like-title");
  if (PLACEHOLDER_PATTERN.test(title)) flags.push("placeholder-or-generic-title");
  if (/coloring page\s+coloring page/i.test(title)) flags.push("repeated-coloring-page");
  if (HASH_FRAGMENT_PATTERN.test(title)) flags.push("hash-like-fragment");
  if (stableId && title.toLowerCase().includes(stableId.toLowerCase())) flags.push("stable-id-leak");
  if (assetId && title.toLowerCase().includes(assetId.toLowerCase())) flags.push("asset-id-leak");
  if (/^[\p{P}\p{S}]|[\p{P}\p{S}]$/u.test(title.replace(DESIGN_SUFFIX_PATTERN, ""))) flags.push("leading-or-trailing-punctuation");
  return flags;
}

export function getEditorialQualityFlags(record, { manualReviewAssetIds = new Set() } = {}) {
  const flags = [];
  if (manualReviewAssetIds.has(record.assetId)) flags.push("source-context-required");
  if (AMBIGUOUS_NUMERIC_SUFFIX_STABLE_IDS.has(record.stableId)) flags.push("ambiguous-numeric-suffix");
  if (UNCERTAIN_SPELLING_PATTERN.test(record.publicTitle)) flags.push("uncertain-spelling");
  if (VEHICLE_CONTEXT_PATTERN.test(record.publicTitle) && BRAND_OR_MODEL_PATTERN.test(record.publicTitle)) {
    flags.push("brand-or-model-name-review");
  }
  return flags;
}

export function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assignDesignNumbers(group, previousByStableId) {
  if (group.length === 1) return new Map([[group[0].stableId, null]]);
  const assigned = new Map();
  const used = new Set();

  for (const record of group) {
    const previous = previousByStableId.get(record.stableId);
    const previousNumber = Number(previous?.designNumber);
    if (!Number.isInteger(previousNumber) || previousNumber < 1 || used.has(previousNumber)) continue;
    if (normalizeExactTitle(previous.baseTitle) !== normalizeExactTitle(record.publicTitle)) continue;
    assigned.set(record.stableId, previousNumber);
    used.add(previousNumber);
  }

  let next = 1;
  for (const record of group) {
    if (assigned.has(record.stableId)) continue;
    while (used.has(next)) next += 1;
    assigned.set(record.stableId, next);
    used.add(next);
  }
  return assigned;
}

function compareFrozenIdentity(left, right) {
  return left.canonicalPath.localeCompare(right.canonicalPath) || left.stableId.localeCompare(right.stableId);
}

function truncateAtWordPreservingDesign(value, maxLength) {
  const designMatch = value.match(DESIGN_SUFFIX_PATTERN);
  const suffix = designMatch ? designMatch[0] : "";
  const base = designMatch ? value.slice(0, -suffix.length) : value;
  const available = maxLength - suffix.length;
  if (available <= 0) throw new Error(`Printable metadata design suffix cannot fit within ${maxLength} characters`);
  const candidate = base.slice(0, available + 1);
  const boundary = candidate.lastIndexOf(" ");
  if (boundary <= 0) throw new Error(`Printable metadata title cannot fit within ${maxLength} characters`);
  return `${candidate.slice(0, boundary).trimEnd()}${suffix}`;
}

function normalizeWord(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) || [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}
