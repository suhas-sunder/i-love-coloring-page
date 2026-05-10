import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4A_GENERATED_AT = "2026-05-10";
const ROUND4A_RUN_ID = "round-4a-approved-asset-hub-taxonomy";
const STRONG_HUB_MIN_ASSETS = 20;
const VIABLE_HUB_MIN_ASSETS = 8;
const CANDIDATE_MIN_ASSETS = 3;
const PHASE_1_MAX_HUBS = 64;
const PHASE_1_PROTECTED_SLUGS = new Set([
  "anime-girls",
  "christmas",
  "dinosaurs",
  "mandalas",
  "st-patricks-day",
  "world-landmarks",
]);

const INPUT_PATHS = {
  productionAssets: "pipeline/manifests/round-3c-production-assets.json",
  galleryData: "pipeline/manifests/round-3c-production-gallery-data.json",
  categoryData: "pipeline/manifests/round-3c-production-category-data.json",
  warningAssets: "pipeline/manifests/round-3c-production-warning-assets.json",
  quarantine: "pipeline/manifests/round-3c-production-quarantine.json",
  nextjsContract: "pipeline/manifests/round-3c-nextjs-data-contract.json",
};

export const ROUND4A_PROJECT_MANIFESTS = [
  "pipeline/manifests/round-4a-filename-token-analysis.json",
  "pipeline/manifests/round-4a-token-normalization-rules.json",
  "pipeline/manifests/round-4a-hub-candidates.json",
  "pipeline/manifests/round-4a-approved-hub-taxonomy.json",
  "pipeline/manifests/round-4a-image-to-hub-map.json",
  "pipeline/manifests/round-4a-hub-route-plan.json",
  "pipeline/manifests/round-4a-phase-1-hubs.json",
  "pipeline/manifests/round-4a-phase-2-hub-backlog.json",
  "pipeline/manifests/round-4a-section-only-topics.json",
  "pipeline/manifests/round-4a-rejected-hub-candidates.json",
  "pipeline/manifests/round-4a-nextjs-gallery-data-contract.json",
];

export const ROUND4A_PROJECT_REPORTS = [
  "pipeline/reports/round-4a-content-architecture-report.md",
  "pipeline/reports/round-4a-hub-taxonomy-report.md",
  "pipeline/reports/round-4a-phase-1-hub-plan.md",
  "pipeline/reports/round-4a-rejected-hubs-report.md",
  "pipeline/reports/round-4a-nextjs-build-plan.md",
];

const PHRASE_RULES = [
  {
    canonicalTerm: "t-rex",
    publicLabel: "T-Rex",
    patterns: ["\\bt\\s*rex\\b", "\\btrex\\b", "\\btyrannosaurus(?:\\s+rex)?\\b"],
    reason: "Normalize common Tyrannosaurus Rex variants to a stable public term.",
  },
  {
    canonicalTerm: "anime girl",
    publicLabel: "Anime Girls",
    patterns: ["\\banime\\s+girls?\\b"],
    reason: "Keep anime girl as a phrase instead of separate generic anime and girl tokens.",
  },
  {
    canonicalTerm: "indoor plant",
    publicLabel: "Indoor Plants",
    patterns: ["\\bindoor\\s+plants?\\b", "\\bidoor\\s+plants?\\b"],
    reason: "Correct a source filename typo and preserve the houseplant intent phrase.",
  },
  {
    canonicalTerm: "world landmark",
    publicLabel: "World Landmarks",
    patterns: ["\\bworld\\s+landmarks?\\b"],
    reason: "Preserve world landmark as a public hub phrase.",
  },
  {
    canonicalTerm: "sea life",
    publicLabel: "Sea Life",
    patterns: ["\\bsea\\s+life\\b", "\\bocean\\s+life\\b"],
    reason: "Group ocean animals and sea-life wording under one stable phrase.",
  },
  {
    canonicalTerm: "st patricks day",
    publicLabel: "St. Patrick's Day",
    patterns: ["\\bst\\s+patricks?\\s+day\\b", "\\bsaint\\s+patricks?\\s+day\\b"],
    reason: "Normalize apostrophe and saint abbreviations for public routes.",
  },
  {
    canonicalTerm: "saber toothed tiger",
    publicLabel: "Saber-Toothed Tigers",
    patterns: ["\\bsaber\\s+toothed\\s+tigers?\\b", "\\bsabre\\s+toothed\\s+tigers?\\b"],
    reason: "Keep the prehistoric animal phrase together.",
  },
  {
    canonicalTerm: "playing card",
    publicLabel: "Playing Cards",
    patterns: ["\\bplaying\\s+cards?\\b"],
    reason: "Keep playing cards as a phrase.",
  },
  {
    canonicalTerm: "birthday party",
    publicLabel: "Birthday Party",
    patterns: ["\\bbirthday\\s+party\\b", "\\bparty\\s+hats?\\b"],
    reason: "Group birthday celebration filenames under a useful holiday-party phrase.",
  },
  {
    canonicalTerm: "fantasy creature",
    publicLabel: "Fantasy Creatures",
    patterns: ["\\bfantasy\\s+creatures?\\b", "\\bcreatures?\\b"],
    reason: "Use a public-friendly umbrella for creature-focused fantasy images.",
  },
];

const TOKEN_REPLACEMENTS = {
  dinos: "dinosaur",
  dino: "dinosaur",
  dinosaurs: "dinosaur",
  tyrannosaurus: "t-rex",
  trex: "t-rex",
  rex: "t-rex",
  xmas: "christmas",
  midieval: "medieval",
  mideival: "medieval",
  medival: "medieval",
  vehiacle: "vehicle",
  vehicles: "vehicle",
  geometry: "geometric",
  cars: "car",
  trains: "train",
  planes: "plane",
  pups: "puppy",
  puppies: "puppy",
  dogs: "dog",
  kittens: "kitten",
  kitties: "kitten",
  kitty: "kitten",
  cats: "cat",
  flowers: "flower",
  plants: "plant",
  birds: "bird",
  insects: "insect",
  reptiles: "reptile",
  dragons: "dragon",
  landmarks: "landmark",
  patterns: "pattern",
  plushies: "plushie",
  houses: "house",
  homes: "home",
  locomotives: "locomotive",
  pics: "picture",
  patricks: "patrick",
};

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "without",
  "coloring",
  "page",
  "pages",
  "color",
  "line",
  "lineart",
  "outline",
  "illustration",
  "image",
  "images",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "chatgpt",
  "failed",
  "oct",
  "pm",
  "am",
  "2024",
  "2025",
  "2026",
  "11",
  "10",
  "27",
  "38",
  "05",
  "girl",
  "girls",
  "anime",
  "thing",
  "collection",
  "single",
  "set",
  "scene",
  "over",
]);

const STYLE_TERMS = new Set([
  "cute",
  "chibi",
  "kawaii",
  "cartoon",
  "realistic",
  "simple",
  "detailed",
  "mandala",
  "geometric",
  "pattern",
  "plushie",
  "anime",
  "fantasy",
  "medieval",
  "classic",
  "abstract",
]);

const THEME_TERMS = new Set([
  "christmas",
  "halloween",
  "birthday",
  "holiday",
  "winter",
  "spring",
  "summer",
  "easter",
  "forest",
  "jungle",
  "garden",
  "space",
  "ocean",
  "castle",
  "dungeon",
  "bakery",
  "sushi",
  "classroom",
  "beach",
  "farm",
  "mountain",
  "river",
  "desert",
  "snow",
  "moon",
  "star",
  "st patricks day",
  "birthday party",
]);

const DIFFICULTY_TERMS = new Set([
  "easy",
  "simple",
  "beginner",
  "kids",
  "detailed",
  "advanced",
  "adult",
  "adults",
  "geometric",
  "mandala",
]);

const MODIFIER_TERMS = new Set([
  "roaring",
  "sleeping",
  "sitting",
  "standing",
  "playing",
  "flying",
  "holding",
  "wearing",
  "decorated",
  "dancing",
  "running",
  "swimming",
  "climbing",
  "riding",
  "smiling",
  "happy",
  "angry",
  "family",
  "baby",
  "party",
  "costume",
  "hoodie",
]);

const SUBJECT_DEFINITIONS = {
  animal: { parent: null, publicLabel: "Animals", plural: "animals", kind: "parent_subject" },
  dog: { parent: "animal", publicLabel: "Dogs", plural: "dogs", kind: "specific_subject" },
  puppy: { parent: "dog", publicLabel: "Puppies", plural: "puppies", kind: "specific_subject" },
  cat: { parent: "animal", publicLabel: "Cats", plural: "cats", kind: "specific_subject" },
  kitten: { parent: "cat", publicLabel: "Kittens", plural: "kittens", kind: "specific_subject" },
  bird: { parent: "animal", publicLabel: "Birds", plural: "birds", kind: "specific_subject" },
  butterfly: { parent: "insect", publicLabel: "Butterflies", plural: "butterflies", kind: "specific_subject" },
  insect: { parent: "animal", publicLabel: "Insects", plural: "insects", kind: "parent_subject" },
  bee: { parent: "insect", publicLabel: "Bees", plural: "bees", kind: "specific_subject" },
  beetle: { parent: "insect", publicLabel: "Beetles", plural: "beetles", kind: "specific_subject" },
  spider: { parent: "insect", publicLabel: "Spiders", plural: "spiders", kind: "specific_subject" },
  reptile: { parent: "animal", publicLabel: "Reptiles", plural: "reptiles", kind: "parent_subject" },
  turtle: { parent: "reptile", publicLabel: "Turtles", plural: "turtles", kind: "specific_subject" },
  snake: { parent: "reptile", publicLabel: "Snakes", plural: "snakes", kind: "specific_subject" },
  lizard: { parent: "reptile", publicLabel: "Lizards", plural: "lizards", kind: "specific_subject" },
  chameleon: { parent: "reptile", publicLabel: "Chameleons", plural: "chameleons", kind: "specific_subject" },
  frog: { parent: "animal", publicLabel: "Frogs", plural: "frogs", kind: "specific_subject" },
  dinosaur: { parent: "prehistoric animal", publicLabel: "Dinosaurs", plural: "dinosaurs", kind: "parent_subject" },
  "t-rex": { parent: "dinosaur", publicLabel: "T-Rex", plural: "t-rex", kind: "specific_subject" },
  triceratops: { parent: "dinosaur", publicLabel: "Triceratops", plural: "triceratops", kind: "specific_subject" },
  stegosaurus: { parent: "dinosaur", publicLabel: "Stegosaurus", plural: "stegosaurus", kind: "specific_subject" },
  velociraptor: { parent: "dinosaur", publicLabel: "Velociraptors", plural: "velociraptors", kind: "specific_subject" },
  diplodocus: { parent: "dinosaur", publicLabel: "Diplodocus", plural: "diplodocus", kind: "specific_subject" },
  brachiosaurus: { parent: "dinosaur", publicLabel: "Brachiosaurus", plural: "brachiosaurus", kind: "specific_subject" },
  mammoth: { parent: "prehistoric animal", publicLabel: "Mammoths", plural: "mammoths", kind: "specific_subject" },
  "saber toothed tiger": { parent: "prehistoric animal", publicLabel: "Saber-Toothed Tigers", plural: "saber-toothed-tigers", kind: "specific_subject" },
  "prehistoric animal": { parent: "animal", publicLabel: "Prehistoric Animals", plural: "prehistoric-animals", kind: "parent_subject" },
  dragon: { parent: "fantasy creature", publicLabel: "Dragons", plural: "dragons", kind: "specific_subject" },
  unicorn: { parent: "fantasy creature", publicLabel: "Unicorns", plural: "unicorns", kind: "specific_subject" },
  fairy: { parent: "fantasy creature", publicLabel: "Fairies", plural: "fairies", kind: "specific_subject" },
  mermaid: { parent: "fantasy creature", publicLabel: "Mermaids", plural: "mermaids", kind: "specific_subject" },
  phoenix: { parent: "fantasy creature", publicLabel: "Phoenix", plural: "phoenix", kind: "specific_subject" },
  pegasus: { parent: "fantasy creature", publicLabel: "Pegasus", plural: "pegasus", kind: "specific_subject" },
  hydra: { parent: "fantasy creature", publicLabel: "Hydra", plural: "hydra", kind: "specific_subject" },
  kraken: { parent: "fantasy creature", publicLabel: "Kraken", plural: "kraken", kind: "specific_subject" },
  griffin: { parent: "fantasy creature", publicLabel: "Griffins", plural: "griffins", kind: "specific_subject" },
  centaur: { parent: "fantasy creature", publicLabel: "Centaurs", plural: "centaurs", kind: "specific_subject" },
  "fantasy creature": { parent: "fantasy", publicLabel: "Fantasy Creatures", plural: "fantasy-creatures", kind: "parent_subject" },
  flower: { parent: "plant", publicLabel: "Flowers", plural: "flowers", kind: "parent_subject" },
  rose: { parent: "flower", publicLabel: "Roses", plural: "roses", kind: "specific_subject" },
  lily: { parent: "flower", publicLabel: "Lilies", plural: "lilies", kind: "specific_subject" },
  sunflower: { parent: "flower", publicLabel: "Sunflowers", plural: "sunflowers", kind: "specific_subject" },
  tulip: { parent: "flower", publicLabel: "Tulips", plural: "tulips", kind: "specific_subject" },
  blossom: { parent: "flower", publicLabel: "Blossoms", plural: "blossoms", kind: "specific_subject" },
  plant: { parent: null, publicLabel: "Plants", plural: "plants", kind: "parent_subject" },
  "indoor plant": { parent: "plant", publicLabel: "Indoor Plants", plural: "indoor-plants", kind: "specific_subject" },
  tree: { parent: "plant", publicLabel: "Trees", plural: "trees", kind: "specific_subject" },
  mandala: { parent: "pattern", publicLabel: "Mandalas", plural: "mandalas", kind: "specific_subject" },
  pattern: { parent: null, publicLabel: "Patterns", plural: "patterns", kind: "parent_subject" },
  vehicle: { parent: null, publicLabel: "Vehicles", plural: "vehicles", kind: "parent_subject" },
  car: { parent: "vehicle", publicLabel: "Cars", plural: "cars", kind: "specific_subject" },
  train: { parent: "vehicle", publicLabel: "Trains", plural: "trains", kind: "specific_subject" },
  locomotive: { parent: "train", publicLabel: "Locomotives", plural: "locomotives", kind: "specific_subject" },
  plane: { parent: "vehicle", publicLabel: "Planes", plural: "planes", kind: "specific_subject" },
  house: { parent: "building", publicLabel: "Houses", plural: "houses", kind: "specific_subject" },
  home: { parent: "building", publicLabel: "Homes", plural: "homes", kind: "specific_subject" },
  castle: { parent: "building", publicLabel: "Castles", plural: "castles", kind: "specific_subject" },
  building: { parent: null, publicLabel: "Buildings", plural: "buildings", kind: "parent_subject" },
  landmark: { parent: "building", publicLabel: "Landmarks", plural: "landmarks", kind: "parent_subject" },
  "world landmark": { parent: "landmark", publicLabel: "World Landmarks", plural: "world-landmarks", kind: "specific_subject" },
  bridge: { parent: "landmark", publicLabel: "Bridges", plural: "bridges", kind: "specific_subject" },
  temple: { parent: "landmark", publicLabel: "Temples", plural: "temples", kind: "specific_subject" },
  "playing card": { parent: null, publicLabel: "Playing Cards", plural: "playing-cards", kind: "specific_subject" },
  bakery: { parent: "food", publicLabel: "Bakery", plural: "bakery", kind: "specific_subject" },
  sushi: { parent: "food", publicLabel: "Sushi", plural: "sushi", kind: "specific_subject" },
  cake: { parent: "food", publicLabel: "Cakes", plural: "cakes", kind: "specific_subject" },
  food: { parent: null, publicLabel: "Food", plural: "food", kind: "parent_subject" },
  "sea life": { parent: "animal", publicLabel: "Sea Life", plural: "sea-life", kind: "parent_subject" },
  fish: { parent: "sea life", publicLabel: "Fish", plural: "fish", kind: "specific_subject" },
  whale: { parent: "sea life", publicLabel: "Whales", plural: "whales", kind: "specific_subject" },
  dolphin: { parent: "sea life", publicLabel: "Dolphins", plural: "dolphins", kind: "specific_subject" },
  shark: { parent: "sea life", publicLabel: "Sharks", plural: "sharks", kind: "specific_subject" },
  octopus: { parent: "sea life", publicLabel: "Octopus", plural: "octopus", kind: "specific_subject" },
  crab: { parent: "sea life", publicLabel: "Crabs", plural: "crabs", kind: "specific_subject" },
  anime: { parent: null, publicLabel: "Anime", plural: "anime", kind: "style_subject" },
  "anime girl": { parent: "anime", publicLabel: "Anime Girls", plural: "anime-girls", kind: "style_subject" },
  chibi: { parent: null, publicLabel: "Chibi", plural: "chibi", kind: "style_subject" },
  plushie: { parent: null, publicLabel: "Plushies", plural: "plushies", kind: "style_subject" },
  fantasy: { parent: null, publicLabel: "Fantasy", plural: "fantasy", kind: "theme_subject" },
  mythology: { parent: "fantasy", publicLabel: "Mythology", plural: "mythology", kind: "theme_subject" },
  medieval: { parent: "fantasy", publicLabel: "Medieval Fantasy", plural: "medieval-fantasy", kind: "theme_subject" },
  holiday: { parent: null, publicLabel: "Holidays", plural: "holidays", kind: "theme_subject" },
  christmas: { parent: "holiday", publicLabel: "Christmas", plural: "christmas", kind: "theme_subject" },
  halloween: { parent: "holiday", publicLabel: "Halloween", plural: "halloween", kind: "theme_subject" },
  birthday: { parent: "holiday", publicLabel: "Birthday", plural: "birthday", kind: "theme_subject" },
  "st patricks day": { parent: "holiday", publicLabel: "St. Patrick's Day", plural: "st-patricks-day", kind: "theme_subject" },
};

const CATEGORY_SIGNAL_RULES = {
  animals: { subjects: ["animal"], parents: [], styles: [], themes: [] },
  "animals-playing-cards": { subjects: ["animal", "playing card"], parents: ["animal"], styles: [], themes: [] },
  "anime-girls": { subjects: ["anime girl"], parents: [], styles: ["anime"], themes: [] },
  birds: { subjects: ["bird"], parents: ["animal"], styles: [], themes: [] },
  chibi: { subjects: ["chibi"], parents: [], styles: ["chibi"], themes: [] },
  christmas: { subjects: ["christmas"], parents: ["holiday"], styles: [], themes: ["christmas"] },
  dinosaurs: { subjects: ["dinosaur"], parents: ["prehistoric animal"], styles: [], themes: ["prehistoric"] },
  dogs: { subjects: ["dog"], parents: ["animal"], styles: [], themes: [] },
  dragons: { subjects: ["dragon"], parents: ["fantasy creature"], styles: [], themes: ["fantasy"] },
  fantasy: { subjects: ["fantasy"], parents: [], styles: ["fantasy"], themes: ["fantasy"] },
  flowers: { subjects: ["flower"], parents: ["plant"], styles: [], themes: ["garden"] },
  gardening: { subjects: ["plant"], parents: [], styles: [], themes: ["garden"] },
  holiday: { subjects: ["holiday"], parents: [], styles: [], themes: ["holiday"] },
  homes: { subjects: ["home"], parents: ["building"], styles: [], themes: [] },
  "indoor-plants": { subjects: ["indoor plant"], parents: ["plant"], styles: [], themes: [] },
  insects: { subjects: ["insect"], parents: ["animal"], styles: [], themes: [] },
  mandala: { subjects: ["mandala"], parents: ["pattern"], styles: ["mandala"], themes: [] },
  "mandala-geometry-patterns": { subjects: ["mandala", "pattern"], parents: [], styles: ["mandala", "geometric"], themes: [] },
  midieval: { subjects: ["medieval"], parents: ["fantasy"], styles: ["medieval"], themes: ["fantasy"] },
  mythology: { subjects: ["mythology"], parents: ["fantasy"], styles: ["fantasy"], themes: ["mythology"] },
  plushie: { subjects: ["plushie"], parents: [], styles: ["plushie", "cute"], themes: [] },
  reptiles: { subjects: ["reptile"], parents: ["animal"], styles: [], themes: [] },
  "sea-life": { subjects: ["sea life"], parents: ["animal"], styles: [], themes: ["ocean"] },
  "st-patricks-day": { subjects: ["st patricks day"], parents: ["holiday"], styles: [], themes: ["st patricks day"] },
  "world-landmarks": { subjects: ["world landmark"], parents: ["landmark"], styles: [], themes: [] },
};

const WEAK_STANDALONE_TERMS = new Set([
  "family",
  "hoodie",
  "costume",
  "summoning",
  "jutsu",
  "pose",
  "old",
  "red",
  "blue",
  "black",
  "golden",
  "great",
  "classic",
  "happy",
  "smiling",
  "wearing",
  "holding",
]);

export async function runRound4AHubTaxonomy(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const state = await loadRound4AInputState({ repoRoot });
  const normalizationRules = buildNormalizationRulesManifest();
  const tokenAnalysis = buildFilenameTokenAnalysis(state);
  const candidateBundle = buildHubCandidateBundle({ state, tokenAnalysis });
  const taxonomy = buildApprovedHubTaxonomy({ state, tokenAnalysis, candidateBundle });
  const imageToHubMap = buildImageToHubMap({ state, taxonomy });
  const routePlan = buildHubRoutePlan({ taxonomy });
  const nextjsContract = buildNextjsGalleryDataContract({ taxonomy, routePlan });
  const reports = buildReports({
    state,
    tokenAnalysis,
    candidateBundle,
    taxonomy,
    imageToHubMap,
    routePlan,
    nextjsContract,
  });

  const manifests = {
    "pipeline/manifests/round-4a-filename-token-analysis.json": tokenAnalysis,
    "pipeline/manifests/round-4a-token-normalization-rules.json": normalizationRules,
    "pipeline/manifests/round-4a-hub-candidates.json": candidateBundle.allCandidatesManifest,
    "pipeline/manifests/round-4a-approved-hub-taxonomy.json": taxonomy.approvedHubTaxonomy,
    "pipeline/manifests/round-4a-image-to-hub-map.json": imageToHubMap,
    "pipeline/manifests/round-4a-hub-route-plan.json": routePlan,
    "pipeline/manifests/round-4a-phase-1-hubs.json": taxonomy.phase1Manifest,
    "pipeline/manifests/round-4a-phase-2-hub-backlog.json": taxonomy.phase2Manifest,
    "pipeline/manifests/round-4a-section-only-topics.json": taxonomy.sectionOnlyManifest,
    "pipeline/manifests/round-4a-rejected-hub-candidates.json": taxonomy.rejectedManifest,
    "pipeline/manifests/round-4a-nextjs-gallery-data-contract.json": nextjsContract,
  };

  for (const [relativePath, payload] of Object.entries(manifests)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }

  return {
    state,
    tokenAnalysis,
    candidateBundle,
    taxonomy,
    imageToHubMap,
    routePlan,
    nextjsContract,
    reports,
  };
}

async function loadRound4AInputState({ repoRoot }) {
  const productionAssets = await readJson(path.join(repoRoot, INPUT_PATHS.productionAssets));
  const galleryData = await readJson(path.join(repoRoot, INPUT_PATHS.galleryData));
  const categoryData = await readJson(path.join(repoRoot, INPUT_PATHS.categoryData));
  const warningAssets = await readJson(path.join(repoRoot, INPUT_PATHS.warningAssets));
  const quarantine = await readJson(path.join(repoRoot, INPUT_PATHS.quarantine));
  const nextjsContract = await readJson(path.join(repoRoot, INPUT_PATHS.nextjsContract));

  const assets = [...productionAssets.assets].sort(compareAssets);
  const successfulAssetIds = new Set(assets.map((asset) => asset.assetId));
  const quarantineIds = new Set((quarantine.entries || []).map((entry) => entry.assetId));
  const warningIds = new Set((warningAssets.warningAssets || []).map((entry) => entry.assetId));
  const quarantinedSuccessfulOverlap = [...quarantineIds].filter((assetId) => successfulAssetIds.has(assetId)).sort();
  const warningSuccessfulMisses = [...warningIds].filter((assetId) => !successfulAssetIds.has(assetId)).sort();
  const traceabilityProblems = assets
    .filter((asset) => {
      return !asset.sourceRelativePath
        || !asset.svgPath
        || !asset.pngPreviewPath
        || !asset.thumbnailPath
        || !asset.filenameSlug
        || !asset.titleCandidate;
    })
    .map((asset) => asset.assetId)
    .sort();

  if (quarantinedSuccessfulOverlap.length > 0) {
    throw new Error(`Round 4A input blocker: quarantined assets appear in successful assets: ${quarantinedSuccessfulOverlap.join(", ")}`);
  }
  if (warningSuccessfulMisses.length > 0) {
    throw new Error(`Round 4A input blocker: warning assets missing from successful assets: ${warningSuccessfulMisses.join(", ")}`);
  }
  if (traceabilityProblems.length > 0) {
    throw new Error(`Round 4A input blocker: production assets missing traceability fields: ${traceabilityProblems.join(", ")}`);
  }

  const categoryCounts = Object.fromEntries(
    [...assets.reduce((map, asset) => incrementMap(map, asset.categorySlug, 1), new Map()).entries()]
      .sort((a, b) => a[0].localeCompare(b[0])),
  );

  return {
    generatedAt: ROUND4A_GENERATED_AT,
    runId: ROUND4A_RUN_ID,
    inputPaths: INPUT_PATHS,
    productionAssets,
    galleryData,
    categoryData,
    warningAssets,
    quarantine,
    nextjsContract,
    assets,
    assetById: new Map(assets.map((asset) => [asset.assetId, asset])),
    successfulAssetIds,
    quarantineIds,
    warningIds,
    productionState: {
      productionAssetsManifestExists: true,
      galleryDataManifestExists: true,
      categoryDataManifestExists: true,
      quarantineManifestExists: true,
      successfulAssetCount: assets.length,
      quarantinedAssetCount: quarantine.entries?.length || 0,
      skippedAssetCount: quarantine.skipped?.length || 0,
      warningAssetCount: warningAssets.warningAssets?.length || 0,
      quarantinedAssetsExcluded: quarantinedSuccessfulOverlap.length === 0,
      warningAssetsPreservedAsInternalMetadataOnly: true,
      sourcePathsTraceable: traceabilityProblems.length === 0,
      generatedAssetPathsTraceable: traceabilityProblems.length === 0,
      sourcePathField: "sourceRelativePath",
      generatedAssetPathFields: ["svgPath", "pngPreviewPath", "thumbnailPath"],
      categoryCounts,
    },
  };
}

function buildFilenameTokenAnalysis(state) {
  const tokenFrequency = new Map();
  const subjectFrequency = new Map();
  const parentSubjectFrequency = new Map();
  const styleFrequency = new Map();
  const themeFrequency = new Map();
  const difficultyFrequency = new Map();
  const modifierFrequency = new Map();
  const tokenCategoryMap = new Map();
  const subjectCategoryMap = new Map();
  const styleCategoryMap = new Map();
  const themeCategoryMap = new Map();

  const assets = state.assets.map((asset) => {
    const signals = extractAssetSignals(asset);
    for (const token of signals.normalizedTokens) {
      incrementMap(tokenFrequency, token, 1);
      addMapSet(tokenCategoryMap, token, asset.categorySlug);
    }
    for (const term of signals.primarySubjects) {
      incrementMap(subjectFrequency, term, 1);
      addMapSet(subjectCategoryMap, term, asset.categorySlug);
    }
    for (const term of signals.parentSubjects) incrementMap(parentSubjectFrequency, term, 1);
    for (const term of signals.styles) {
      incrementMap(styleFrequency, term, 1);
      addMapSet(styleCategoryMap, term, asset.categorySlug);
    }
    for (const term of signals.themes) {
      incrementMap(themeFrequency, term, 1);
      addMapSet(themeCategoryMap, term, asset.categorySlug);
    }
    for (const term of signals.audienceDifficulty) incrementMap(difficultyFrequency, term, 1);
    for (const term of signals.objectContextModifiers) incrementMap(modifierFrequency, term, 1);

    return {
      assetId: asset.assetId,
      sourceRelativePath: asset.sourceRelativePath,
      originalFilename: path.posix.basename(asset.sourceRelativePath),
      originalCategory: asset.originalCategory,
      categorySlug: asset.categorySlug,
      titleCandidate: asset.titleCandidate,
      filenameSlug: asset.filenameSlug,
      generatedAssetPaths: {
        svg: asset.svgPath,
        pngPreview: asset.pngPreviewPath,
        thumbnail: asset.thumbnailPath,
      },
      normalizedTokens: signals.normalizedTokens,
      primarySubjects: signals.primarySubjects,
      parentSubjects: signals.parentSubjects,
      styles: signals.styles,
      sceneThemes: signals.themes,
      audienceDifficulty: signals.audienceDifficulty,
      objectContextModifiers: signals.objectContextModifiers,
      warningFlags: asset.round3a1WarningFlags || [],
      warningMetadataPolicy: "internal_metadata_only",
    };
  });

  return {
    generatedAt: ROUND4A_GENERATED_AT,
    runId: ROUND4A_RUN_ID,
    inputs: {
      productionAssets: INPUT_PATHS.productionAssets,
      galleryData: INPUT_PATHS.galleryData,
      categoryData: INPUT_PATHS.categoryData,
      warningAssets: INPUT_PATHS.warningAssets,
      quarantine: INPUT_PATHS.quarantine,
    },
    summary: {
      successfulAssetsAnalyzed: state.assets.length,
      quarantinedAssetsExcluded: state.productionState.quarantinedAssetCount,
      warningAssetsRetainedAsInternalMetadata: state.productionState.warningAssetCount,
      uniqueNormalizedTokens: tokenFrequency.size,
      totalUniqueNormalizedSubjectTokens: subjectFrequency.size,
      totalUniqueParentSubjectTokens: parentSubjectFrequency.size,
      totalUniqueStyleTokens: styleFrequency.size,
      totalUniqueThemeTokens: themeFrequency.size,
      sourceAndGeneratedPathsTraceable: state.productionState.sourcePathsTraceable && state.productionState.generatedAssetPathsTraceable,
    },
    normalizationApplied: {
      lowercase: true,
      punctuationToSpaces: true,
      singularPluralCleanup: true,
      phraseNormalization: true,
      rawFolderNamesUsedOnlyAsInputSignals: true,
    },
    strongestSubjectClusters: topClusterRows(subjectFrequency, subjectCategoryMap, 50),
    strongestParentSubjectClusters: topClusterRows(parentSubjectFrequency, new Map(), 40),
    strongestStyleClusters: topClusterRows(styleFrequency, styleCategoryMap, 30),
    strongestHolidayThemeClusters: topClusterRows(themeFrequency, themeCategoryMap, 40),
    strongestModifierClusters: topClusterRows(modifierFrequency, new Map(), 30),
    tokenFrequencies: topClusterRows(tokenFrequency, tokenCategoryMap, 250),
    assets,
  };
}

function buildNormalizationRulesManifest() {
  return {
    generatedAt: ROUND4A_GENERATED_AT,
    runId: ROUND4A_RUN_ID,
    deterministicRules: {
      lowercaseBeforeMatching: true,
      splitOnPunctuationAndHyphens: true,
      removeNoiseTokens: [...STOP_TOKENS].sort(),
      normalizePluralTokens: true,
      preserveEnoughSpecificVariants: [
        "puppy is retained as a possible subject while also rolling up under dog",
        "kitten is retained as a possible subject while also rolling up under cat",
        "kawaii and cute are related style signals but stay separate tokens",
      ],
      routeSlugsUseAsciiLowercaseHyphenation: true,
    },
    phraseNormalizationRules: PHRASE_RULES.map((rule) => ({
      canonicalTerm: rule.canonicalTerm,
      publicLabel: rule.publicLabel,
      patterns: rule.patterns,
      reason: rule.reason,
    })),
    tokenReplacementRules: Object.entries(TOKEN_REPLACEMENTS)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([from, to]) => ({ from, to })),
    parentSubjectRules: Object.entries(SUBJECT_DEFINITIONS)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([term, definition]) => ({
        term,
        publicLabel: definition.publicLabel,
        parent: definition.parent,
        kind: definition.kind,
      })),
    categorySignalRules: Object.entries(CATEGORY_SIGNAL_RULES)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([categorySlug, signals]) => ({ categorySlug, ...signals })),
    publicRouteCleanupRules: [
      { input: "midieval", output: "medieval", reason: "Correct misspelling before public route planning." },
      { input: "vehiacle", output: "vehicle", reason: "Correct misspelling before public route planning." },
      { input: "xmas", output: "christmas", reason: "Use standard public holiday wording." },
      { input: "singular/plural variants", output: "single canonical slug", reason: "Prevent duplicate indexable hubs." },
    ],
  };
}

function buildHubCandidateBundle({ state, tokenAnalysis }) {
  const signalIndexes = buildSignalIndexes(tokenAnalysis.assets);
  const candidateMap = new Map();

  addBaseCandidates({ candidateMap, signalIndexes, state });
  addSubjectCandidates({ candidateMap, signalIndexes });
  addParentSubjectCandidates({ candidateMap, signalIndexes });
  addStyleCandidates({ candidateMap, signalIndexes });
  addThemeCandidates({ candidateMap, signalIndexes });
  addAudienceCandidates({ candidateMap, signalIndexes });
  addCrossSignalCandidates({ candidateMap, signalIndexes });
  addRejectedAliasCandidates({ candidateMap, signalIndexes });

  const scored = scoreAndTierCandidates({
    candidates: [...candidateMap.values()],
    signalIndexes,
    state,
  });

  return {
    signalIndexes,
    candidates: scored,
    allCandidatesManifest: {
      generatedAt: ROUND4A_GENERATED_AT,
      runId: ROUND4A_RUN_ID,
      summary: summarizeCandidateTiers(scored),
      scoringSystem: {
        asset_count: "Number of successful Round 3C production assets assigned to the candidate.",
        unique_subject_score: "0 to 20 score based on subject specificity and source category diversity.",
        search_intent_clarity_score: "0 to 20 score for public usefulness and query clarity.",
        content_depth_score: "0 to 20 score based on usable asset depth.",
        overlap_risk_score: "0 to 20 risk score where higher means the hub is likely redundant with a better parent.",
        duplicate_risk_score: "0 to 20 risk score where higher means singular, plural, synonym, or route duplication.",
        user_value_score: "0 to 20 score for whether the hub can support useful browsing sections and filtering.",
        final_recommendation_score: "0 to 100 weighted score after risk penalties.",
        publish_tier: "phase_1_publish, phase_2_backlog, section_only, or rejected.",
      },
      thresholds: {
        strongHubMinimumAssets: STRONG_HUB_MIN_ASSETS,
        viableHubMinimumAssets: VIABLE_HUB_MIN_ASSETS,
        generatedCandidateMinimumAssets: CANDIDATE_MIN_ASSETS,
        phase1MaximumHubs: PHASE_1_MAX_HUBS,
      },
      candidates: scored,
    },
  };
}

function buildApprovedHubTaxonomy({ state, tokenAnalysis, candidateBundle }) {
  const allCandidates = candidateBundle.candidates;
  const phase1 = allCandidates.filter((candidate) => candidate.publish_tier === "phase_1_publish");
  const phase2 = allCandidates.filter((candidate) => candidate.publish_tier === "phase_2_backlog");
  const sectionOnly = allCandidates.filter((candidate) => candidate.publish_tier === "section_only");
  const rejected = allCandidates.filter((candidate) => candidate.publish_tier === "rejected");
  const allApproved = [...phase1, ...phase2];

  const relationshipReady = allCandidates
    .filter((candidate) => candidate.publish_tier !== "rejected")
    .map((candidate) => buildHubContentModel({ candidate, allCandidates, state, tokenAnalysis }));

  const byId = new Map(relationshipReady.map((hub) => [hub.hubId, hub]));
  for (const hub of relationshipReady) {
    if (hub.parentHubId && byId.has(hub.parentHubId)) {
      byId.get(hub.parentHubId).childHubIds.push(hub.hubId);
    }
  }
  for (const hub of relationshipReady) {
    hub.childHubIds = [...new Set(hub.childHubIds)].sort().slice(0, 30);
    hub.internalLinkingTargets = [...new Set([
      hub.parentHubId,
      ...hub.childHubIds.slice(0, 12),
      ...hub.relatedHubIds.slice(0, 8),
    ].filter(Boolean))].sort();
  }

  const phase1Hubs = relationshipReady
    .filter((hub) => hub.publish_tier === "phase_1_publish")
    .sort(compareHubRecords);
  const phase2Hubs = relationshipReady
    .filter((hub) => hub.publish_tier === "phase_2_backlog")
    .sort(compareHubRecords);
  const sectionOnlyTopics = relationshipReady
    .filter((hub) => hub.publish_tier === "section_only")
    .sort(compareHubRecords);

  const summary = {
    successfulAssetsAnalyzed: state.assets.length,
    quarantinedAssetsExcluded: state.productionState.quarantinedAssetCount,
    warningAssetsPreservedAsInternalMetadata: state.productionState.warningAssetCount,
    totalHubCandidatesGenerated: allCandidates.length,
    approvedIndexableHubCount: allApproved.length,
    phase1HubCount: phase1Hubs.length,
    phase2BacklogCount: phase2Hubs.length,
    sectionOnlyTopicCount: sectionOnlyTopics.length,
    rejectedCandidateCount: rejected.length,
    uniqueNormalizedSubjectTokens: tokenAnalysis.summary.totalUniqueNormalizedSubjectTokens,
    noIndexablePerImageRoutes: true,
  };

  return {
    approvedHubTaxonomy: {
      generatedAt: ROUND4A_GENERATED_AT,
      runId: ROUND4A_RUN_ID,
      summary,
      architectureRules: [
        "Do not use raw source folders as the final site taxonomy.",
        "Use approved production assets, descriptive filenames, and Round 4A hub maps.",
        "Allow one image to belong to multiple useful hubs.",
        "Do not create indexable per-image pages.",
        "Keep warning metadata internal.",
      ],
      rootHub: buildRootHubRecord(state),
      phase1Hubs,
      phase2BacklogHubs: phase2Hubs,
      sectionOnlyTopics,
      rejectedCandidateIds: rejected.map((candidate) => candidate.hubId).sort(),
    },
    phase1Manifest: {
      generatedAt: ROUND4A_GENERATED_AT,
      runId: ROUND4A_RUN_ID,
      summary: { ...summary, hubCount: phase1Hubs.length },
      hubs: phase1Hubs,
    },
    phase2Manifest: {
      generatedAt: ROUND4A_GENERATED_AT,
      runId: ROUND4A_RUN_ID,
      summary: { ...summary, hubCount: phase2Hubs.length },
      hubs: phase2Hubs,
    },
    sectionOnlyManifest: {
      generatedAt: ROUND4A_GENERATED_AT,
      runId: ROUND4A_RUN_ID,
      summary: { ...summary, topicCount: sectionOnlyTopics.length },
      topics: sectionOnlyTopics,
    },
    rejectedManifest: {
      generatedAt: ROUND4A_GENERATED_AT,
      runId: ROUND4A_RUN_ID,
      summary: { ...summary, rejectedCandidateCount: rejected.length },
      candidates: rejected.sort(compareCandidates),
    },
  };
}

function buildImageToHubMap({ state, taxonomy }) {
  const rootHubId = "root_coloring_pages";
  const hubRecords = [
    ...taxonomy.approvedHubTaxonomy.phase1Hubs,
    ...taxonomy.approvedHubTaxonomy.phase2BacklogHubs,
    ...taxonomy.approvedHubTaxonomy.sectionOnlyTopics,
  ];
  const assignments = new Map(state.assets.map((asset) => [
    asset.assetId,
    {
      assetId: asset.assetId,
      sourceRelativePath: asset.sourceRelativePath,
      categorySlug: asset.categorySlug,
      hubIds: [rootHubId],
      phase1HubIds: [],
      phase2HubIds: [],
      sectionOnlyTopicIds: [],
      warningFlags: asset.round3a1WarningFlags || [],
      warningMetadataPolicy: "internal_metadata_only",
    },
  ]));

  for (const hub of hubRecords) {
    for (const assetId of hub.assetIds) {
      const assignment = assignments.get(assetId);
      if (!assignment) continue;
      assignment.hubIds.push(hub.hubId);
      if (hub.publish_tier === "phase_1_publish") assignment.phase1HubIds.push(hub.hubId);
      if (hub.publish_tier === "phase_2_backlog") assignment.phase2HubIds.push(hub.hubId);
      if (hub.publish_tier === "section_only") assignment.sectionOnlyTopicIds.push(hub.hubId);
    }
  }

  const images = [...assignments.values()]
    .map((assignment) => ({
      ...assignment,
      hubIds: [...new Set(assignment.hubIds)].sort(),
      phase1HubIds: [...new Set(assignment.phase1HubIds)].sort(),
      phase2HubIds: [...new Set(assignment.phase2HubIds)].sort(),
      sectionOnlyTopicIds: [...new Set(assignment.sectionOnlyTopicIds)].sort(),
    }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));

  return {
    generatedAt: ROUND4A_GENERATED_AT,
    runId: ROUND4A_RUN_ID,
    summary: {
      assetCount: images.length,
      rootHubId,
      phase1HubCount: taxonomy.approvedHubTaxonomy.phase1Hubs.length,
      phase2HubCount: taxonomy.approvedHubTaxonomy.phase2BacklogHubs.length,
      sectionOnlyTopicCount: taxonomy.approvedHubTaxonomy.sectionOnlyTopics.length,
      oneImageMayMapToMultipleHubs: true,
      quarantinedAssetsExcluded: state.productionState.quarantinedAssetCount,
    },
    images,
  };
}

function buildHubRoutePlan({ taxonomy }) {
  const rootHub = taxonomy.approvedHubTaxonomy.rootHub;
  const routeHubs = [
    ...taxonomy.approvedHubTaxonomy.phase1Hubs,
    ...taxonomy.approvedHubTaxonomy.phase2BacklogHubs,
  ].sort(compareHubRecords);

  return {
    generatedAt: ROUND4A_GENERATED_AT,
    runId: ROUND4A_RUN_ID,
    baseRoute: {
      hubId: rootHub.hubId,
      route: "/coloring-pages",
      title: rootHub.canonicalTitle,
      indexabilityRecommendation: "indexable",
      sitemapRecommendation: "include",
    },
    routePattern: "/coloring-pages/[hubSlug]",
    noPerImageRoutes: true,
    noDeepNestingDefault: true,
    routes: [
      {
        hubId: rootHub.hubId,
        hubSlug: "",
        route: "/coloring-pages",
        canonicalTitle: rootHub.canonicalTitle,
        indexabilityRecommendation: "indexable",
        sitemapRecommendation: "include",
      },
      ...routeHubs.map((hub) => ({
        hubId: hub.hubId,
        hubSlug: hub.slug,
        route: hub.route,
        canonicalTitle: hub.canonicalTitle,
        parentHubId: hub.parentHubId,
        publish_tier: hub.publish_tier,
        assetCount: hub.assetCount,
        indexabilityRecommendation: hub.indexabilityRecommendation,
        sitemapRecommendation: hub.sitemapRecommendation,
      })),
    ],
    rejectedRoutePatterns: [
      "/coloring-pages/animals/dinosaurs/t-rex/cute",
      "/coloring-pages/[hubSlug]/[assetId]",
      "/images/[assetId]",
      "routes copied directly from raw source folder names",
    ],
  };
}

function buildNextjsGalleryDataContract({ taxonomy, routePlan }) {
  return {
    generatedAt: ROUND4A_GENERATED_AT,
    runId: ROUND4A_RUN_ID,
    noPerImageIndexPages: true,
    sourceDataForRound4B: {
      hubTaxonomy: "pipeline/manifests/round-4a-approved-hub-taxonomy.json",
      imageToHubMap: "pipeline/manifests/round-4a-image-to-hub-map.json",
      routePlan: "pipeline/manifests/round-4a-hub-route-plan.json",
      productionGalleryData: "pipeline/manifests/round-3c-production-gallery-data.json",
      productionAssets: "pipeline/manifests/round-3c-production-assets.json",
    },
    warningMetadataPolicy: "internal_metadata_only",
    routeContract: {
      baseRoute: routePlan.baseRoute.route,
      hubRoutePattern: routePlan.routePattern,
      deepNestingDefault: false,
      individualImageRouteIndexable: false,
    },
    hubRecordShape: {
      hubId: "stable string",
      slug: "stable lowercase route segment",
      route: "/coloring-pages/[hubSlug]",
      canonicalTitle: "string",
      h1: "string",
      metaTitleCandidate: "string",
      metaDescriptionCandidate: "string",
      introCopyCandidate: "string",
      assetIds: "string[]",
      featuredAssetIds: "string[]",
      sectionGroupings: "array",
      relatedHubIds: "string[]",
      parentHubId: "string|null",
      childHubIds: "string[]",
      breadcrumbPath: "array",
      internalLinkingTargets: "string[]",
      indexabilityRecommendation: "indexable|noindex|section_only",
      sitemapRecommendation: "include|exclude",
      noPerImageIndexableRoute: "true",
    },
    galleryBehaviorRecommendation: {
      largeHubThreshold: 120,
      defaultInitialVisibleCards: 48,
      galleryPagination: "load_more_or_cursor_pagination",
      filters: ["style", "difficulty", "subject", "theme"],
      cardActions: ["print", "download"],
      emptyState: "Show a concise empty state and link back to related hubs. Do not create thin fallback pages.",
    },
    phase1Hubs: taxonomy.approvedHubTaxonomy.phase1Hubs.map((hub) => ({
      hubId: hub.hubId,
      slug: hub.slug,
      route: hub.route,
      assetCount: hub.assetCount,
    })),
  };
}

function buildReports({ state, tokenAnalysis, candidateBundle, taxonomy, routePlan }) {
  const summary = taxonomy.approvedHubTaxonomy.summary;
  const phase1 = taxonomy.approvedHubTaxonomy.phase1Hubs;
  const phase2 = taxonomy.approvedHubTaxonomy.phase2BacklogHubs;
  const sectionOnly = taxonomy.approvedHubTaxonomy.sectionOnlyTopics;
  const rejected = taxonomy.rejectedManifest.candidates;
  const top50 = candidateBundle.candidates
    .filter((candidate) => candidate.publish_tier !== "rejected")
    .sort(compareCandidates)
    .slice(0, 50);
  const crossFolderExamples = phase1
    .filter((hub) => hub.sourceEvidence.sourceCategoryCount > 1)
    .slice(0, 12);
  const folderSplitExamples = buildFolderSplitExamples(phase1, state.assets);
  const multiFolderHubExamples = crossFolderExamples.slice(0, 8);
  const subjectFilenameExamples = phase1
    .filter((hub) => ["specific_subject", "broad_subject"].includes(hub.candidateType))
    .slice(0, 12);

  return {
    "pipeline/reports/round-4a-content-architecture-report.md": [
      "# Round 4A Content Architecture Report",
      "",
      `Generated: ${ROUND4A_GENERATED_AT}`,
      "",
      "## Production Data State",
      "",
      `- Production assets manifest exists: ${yesNo(state.productionState.productionAssetsManifestExists)}`,
      `- Gallery data manifest exists: ${yesNo(state.productionState.galleryDataManifestExists)}`,
      `- Category data manifest exists: ${yesNo(state.productionState.categoryDataManifestExists)}`,
      `- Quarantine manifest exists: ${yesNo(state.productionState.quarantineManifestExists)}`,
      `- Successful assets analyzed: ${summary.successfulAssetsAnalyzed}`,
      `- Quarantined assets excluded: ${state.productionState.quarantinedAssetCount}`,
      `- Warning assets retained as internal metadata only: ${state.productionState.warningAssetCount}`,
      `- Source and generated asset paths traceable: ${yesNo(state.productionState.sourcePathsTraceable && state.productionState.generatedAssetPathsTraceable)}`,
      "",
      "## Why Raw Folders Are Not The Final Architecture",
      "",
      "The 29 source folders are production input organization, not public navigation. The filenames contain richer user intent signals such as specific subjects, styles, holidays, scenes, and difficulty cues. Round 4A therefore uses folders as one input signal, then normalizes filename terms and scores hubs by asset depth, clarity, overlap risk, and user value.",
      "",
      "## Cluster Summary",
      "",
      `- Total unique normalized subject tokens: ${summary.uniqueNormalizedSubjectTokens}`,
      `- Total hub candidates generated: ${summary.totalHubCandidatesGenerated}`,
      `- Phase 1 hub count: ${summary.phase1HubCount}`,
      `- Phase 2 backlog count: ${summary.phase2BacklogCount}`,
      `- Section-only topic count: ${summary.sectionOnlyTopicCount}`,
      `- Rejected candidate count: ${summary.rejectedCandidateCount}`,
      "",
      "## Strongest Subject Clusters",
      "",
      markdownTable(["Subject", "Assets", "Categories"], tokenAnalysis.strongestSubjectClusters.slice(0, 20).map((row) => [displayTerm(row.term), row.assetCount, row.sourceCategories.join(", ")])),
      "",
      "## Strongest Style Clusters",
      "",
      markdownTable(["Style", "Assets", "Categories"], tokenAnalysis.strongestStyleClusters.slice(0, 20).map((row) => [displayTerm(row.term), row.assetCount, row.sourceCategories.join(", ")])),
      "",
      "## Strongest Holiday And Theme Clusters",
      "",
      markdownTable(["Theme", "Assets", "Categories"], tokenAnalysis.strongestHolidayThemeClusters.slice(0, 20).map((row) => [displayTerm(row.term), row.assetCount, row.sourceCategories.join(", ")])),
      "",
      "## Cross-Folder Hub Examples",
      "",
      markdownTable(["Hub", "Assets", "Source folders"], multiFolderHubExamples.map((hub) => [hub.canonicalTitle, hub.assetCount, hub.sourceEvidence.sourceCategories.map((row) => `${row.categorySlug} (${row.assetCount})`).join(", ")])),
      "",
      "## Multiple Folders Feeding One Hub",
      "",
      markdownBulletList(multiFolderHubExamples.map((hub) => `${hub.canonicalTitle}: ${hub.sourceEvidence.sourceCategories.map((row) => row.categorySlug).join(", ")}`)),
      "",
      "## One Folder Splitting Into Multiple Useful Hubs",
      "",
      markdownBulletList(folderSplitExamples.map((example) => `${example.categorySlug}: ${example.hubs.map((hub) => `${hub.canonicalTitle} (${hub.assetCount})`).join(", ")}`)),
      "",
      "## URL Structure Recommendation",
      "",
      `Use \`${routePlan.baseRoute.route}\` for the root gallery hub and \`${routePlan.routePattern}\` for public hubs. Keep routes shallow, stable, readable, and based on normalized hub slugs rather than raw folder names.`,
      "",
      "## Sitemap And Indexing Strategy",
      "",
      "Include the root gallery and Phase 1 hub routes in the initial sitemap. Phase 2 hubs should remain backlog routes until Round 4B or later explicitly promotes them. Section-only topics should be anchors or filter sections inside larger hubs, not indexable pages. Individual image pages must not be indexable routes.",
    ].join("\n") + "\n",

    "pipeline/reports/round-4a-hub-taxonomy-report.md": [
      "# Round 4A Hub Taxonomy Report",
      "",
      `Generated: ${ROUND4A_GENERATED_AT}`,
      "",
      "## Scoring Model",
      "",
      "Each candidate receives asset count, unique subject score, search intent clarity score, content depth score, overlap risk score, duplicate risk score, user value score, final recommendation score, and publish tier. High overlap or duplicate risk can push a candidate into section-only or rejected even when it has enough assets.",
      "",
      "## Top 50 Recommended Hubs",
      "",
      markdownTable(
        ["Rank", "Hub", "Tier", "Assets", "Score", "Reason"],
        top50.map((hub, index) => [
          index + 1,
          hub.canonicalTitle,
          hub.publish_tier,
          hub.asset_count,
          hub.final_recommendation_score,
          hub.recommendationReason,
        ]),
      ),
      "",
      "## Candidate Totals",
      "",
      `- Total candidates: ${summary.totalHubCandidatesGenerated}`,
      `- Phase 1 publish: ${summary.phase1HubCount}`,
      `- Phase 2 backlog: ${summary.phase2BacklogCount}`,
      `- Section-only: ${summary.sectionOnlyTopicCount}`,
      `- Rejected: ${summary.rejectedCandidateCount}`,
      "",
      "## Duplicate And Thin Page Controls",
      "",
      markdownBulletList([
        "Plural and singular variants normalize to one canonical slug.",
        "Weak modifier-only topics are rejected instead of creating SEO shells.",
        "Small but coherent topics become section-only or Phase 2 backlog.",
        "High-overlap cross hubs are kept only when they provide a useful browsing angle.",
        "Raw folder names can support a hub, but they do not automatically become final routes.",
      ]),
    ].join("\n") + "\n",

    "pipeline/reports/round-4a-phase-1-hub-plan.md": [
      "# Round 4A Phase 1 Hub Plan",
      "",
      `Generated: ${ROUND4A_GENERATED_AT}`,
      "",
      `Phase 1 hub count: ${phase1.length}`,
      "",
      "## Phase 1 Hubs",
      "",
      markdownTable(
        ["Hub", "Route", "Assets", "Featured", "Parent", "Reason"],
        phase1.map((hub) => [
          hub.canonicalTitle,
          hub.route,
          hub.assetCount,
          hub.featuredAssetIds.length,
          hub.parentHubId || "",
          hub.recommendationReason,
        ]),
      ),
      "",
      "## Hub Page Layout Recommendation",
      "",
      markdownBulletList([
        "Start with a concise H1, one short intro, and a featured set selected from diverse source folders.",
        "Use sections for popular subjects, styles, themes, and difficulty where those signals exist.",
        "Use filters for subject, style, difficulty, and theme instead of creating thin near-duplicate pages.",
        "Use load-more or cursor pagination for large hubs rather than dumping thousands of images at once.",
        "Cards should expose print and download actions, but no card should link to an indexable per-image page.",
        "Warning metadata remains internal and should not become public badge copy.",
      ]),
      "",
      "## Internal Linking Strategy",
      "",
      "Every hub should link to its parent hub, strongest child hubs, and closely related sibling hubs. The root gallery should link to Phase 1 hubs first, with Phase 2 topics represented as filters or section anchors until promoted.",
    ].join("\n") + "\n",

    "pipeline/reports/round-4a-rejected-hubs-report.md": [
      "# Round 4A Rejected Hubs Report",
      "",
      `Generated: ${ROUND4A_GENERATED_AT}`,
      "",
      `Rejected candidate count: ${rejected.length}`,
      "",
      "## Rejected Candidate Summary",
      "",
      markdownTable(
        ["Candidate", "Assets", "Reasons"],
        rejected.slice(0, 250).map((candidate) => [
          candidate.canonicalTitle,
          candidate.asset_count,
          candidate.rejectionReasons.join(", "),
        ]),
      ),
      "",
      "## Rejection Policy",
      "",
      markdownBulletList([
        "Reject candidates with fewer than three supporting assets.",
        "Reject awkward filename noise and weak modifier-only topics.",
        "Reject singular, plural, typo, and synonym duplicates after normalization.",
        "Reject candidates that would feel like keyword-stuffed pages instead of useful browsing hubs.",
        "Prefer section anchors inside a stronger parent when intent is useful but too narrow.",
      ]),
    ].join("\n") + "\n",

    "pipeline/reports/round-4a-nextjs-build-plan.md": [
      "# Round 4A Next.js Build Plan",
      "",
      `Generated: ${ROUND4A_GENERATED_AT}`,
      "",
      "## Exact Round 4B Recommendation",
      "",
      "Build the Next.js public gallery shell using `pipeline/manifests/round-4a-approved-hub-taxonomy.json`, `pipeline/manifests/round-4a-image-to-hub-map.json`, `pipeline/manifests/round-4a-hub-route-plan.json`, and the Round 3C gallery and asset manifests. Implement `/coloring-pages` plus Phase 1 `/coloring-pages/[hubSlug]` routes only, keep Phase 2 topics as data-backed backlog or sections, do not create indexable per-image routes, and keep production media outside `public/` until the asset hosting policy is explicitly approved.",
      "",
      "## Data Contract",
      "",
      markdownBulletList([
        "Use hub records for route metadata, H1, intro copy, featured assets, related hubs, breadcrumbs, and sitemap inclusion.",
        "Use image-to-hub mapping so one image can appear in multiple relevant hubs without duplicating asset metadata.",
        "Use Round 3C production gallery data for asset paths, alt text candidates, print/download availability, and warning flags.",
        "Do not import thousands of images into React components. Load metadata and resolve assets through the approved public or CDN path strategy.",
      ]),
      "",
      "## Sitemap And Indexing",
      "",
      markdownBulletList([
        "Include `/coloring-pages` and Phase 1 hub routes in the first sitemap.",
        "Exclude section-only topics and rejected candidates from the sitemap.",
        "Do not generate individual image URLs as indexable HTML pages.",
        "Phase 2 backlog hubs need an explicit promotion pass before sitemap inclusion.",
      ]),
      "",
      "## Round 4B Implementation Order",
      "",
      markdownNumberedList([
        "Create a server-side data loader that reads the Round 4A taxonomy, route plan, image-to-hub map, and Round 3C gallery data.",
        "Implement `/coloring-pages` as the root hub using featured Phase 1 hub links and structured gallery sections.",
        "Implement `/coloring-pages/[hubSlug]` for Phase 1 hubs only, returning 404 or noindex handling for non-promoted slugs.",
        "Add hub page components for featured assets, filters, related hubs, breadcrumbs, and print/download actions.",
        "Add sitemap generation from the Round 4A route plan and assert no per-image routes are emitted.",
        "Run a local crawl and build validation before copying or publishing any production media.",
      ]),
    ].join("\n") + "\n",
  };
}

function buildSignalIndexes(analysisAssets) {
  const indexes = {
    subjects: new Map(),
    parents: new Map(),
    styles: new Map(),
    themes: new Map(),
    difficulties: new Map(),
    modifiers: new Map(),
    categories: new Map(),
    allAssetIds: new Set(analysisAssets.map((asset) => asset.assetId)),
    assetSignalsById: new Map(analysisAssets.map((asset) => [asset.assetId, asset])),
  };

  for (const asset of analysisAssets) {
    addManyToIndex(indexes.subjects, asset.primarySubjects, asset.assetId);
    addManyToIndex(indexes.parents, asset.parentSubjects, asset.assetId);
    addManyToIndex(indexes.styles, asset.styles, asset.assetId);
    addManyToIndex(indexes.themes, asset.sceneThemes, asset.assetId);
    addManyToIndex(indexes.difficulties, asset.audienceDifficulty, asset.assetId);
    addManyToIndex(indexes.modifiers, asset.objectContextModifiers, asset.assetId);
    addManyToIndex(indexes.categories, [asset.categorySlug], asset.assetId);
  }

  return indexes;
}

function addBaseCandidates({ candidateMap, signalIndexes }) {
  addCandidate(candidateMap, {
    candidateType: "root",
    labelTerm: "coloring pages",
    slug: "coloring-pages",
    assetIds: [...signalIndexes.allAssetIds],
    intentModel: "Root public gallery hub. This is the base route, not a keyword-stuffed duplicate page.",
    terms: ["coloring pages"],
    indexable: true,
    sitemap: true,
  });
}

function addSubjectCandidates({ candidateMap, signalIndexes }) {
  for (const [term, ids] of signalIndexes.subjects.entries()) {
    if (ids.size < CANDIDATE_MIN_ASSETS) continue;
    if (WEAK_STANDALONE_TERMS.has(term)) continue;
    if (["anime", "pattern"].includes(term)) continue;
    const definition = SUBJECT_DEFINITIONS[term];
    addCandidate(candidateMap, {
      candidateType: definition?.kind === "parent_subject" ? "broad_subject" : "specific_subject",
      labelTerm: term,
      slug: routeSlugForTerm(term),
      assetIds: [...ids],
      intentModel: "Subject hub inferred from descriptive filenames and metadata.",
      terms: [term],
    });
  }
}

function addParentSubjectCandidates({ candidateMap, signalIndexes }) {
  for (const [term, ids] of signalIndexes.parents.entries()) {
    if (ids.size < CANDIDATE_MIN_ASSETS) continue;
    if (WEAK_STANDALONE_TERMS.has(term)) continue;
    if (["anime", "pattern"].includes(term)) continue;
    addCandidate(candidateMap, {
      candidateType: "broad_subject",
      labelTerm: term,
      slug: routeSlugForTerm(term),
      assetIds: [...ids],
      intentModel: "Parent hub inferred from subject rollups and cross-folder filename evidence.",
      terms: [term],
    });
  }
}

function addStyleCandidates({ candidateMap, signalIndexes }) {
  for (const [term, ids] of signalIndexes.styles.entries()) {
    if (ids.size < VIABLE_HUB_MIN_ASSETS) continue;
    if (["anime", "fantasy", "geometry", "medieval", "pattern"].includes(term)) continue;
    addCandidate(candidateMap, {
      candidateType: "style",
      labelTerm: term,
      slug: routeSlugForTerm(term),
      assetIds: [...ids],
      intentModel: "Style hub inferred from filename style terms and source metadata.",
      terms: [term],
    });
  }
}

function addThemeCandidates({ candidateMap, signalIndexes }) {
  for (const [term, ids] of signalIndexes.themes.entries()) {
    if (ids.size < CANDIDATE_MIN_ASSETS) continue;
    if (WEAK_STANDALONE_TERMS.has(term)) continue;
    if (term === "prehistoric") continue;
    addCandidate(candidateMap, {
      candidateType: "theme",
      labelTerm: term,
      slug: routeSlugForTerm(term),
      assetIds: [...ids],
      intentModel: "Holiday, scene, or theme hub inferred from filenames.",
      terms: [term],
    });
  }
}

function addAudienceCandidates({ candidateMap, signalIndexes }) {
  const easyIds = unionSets([
    signalIndexes.styles.get("simple"),
    signalIndexes.styles.get("cute"),
    signalIndexes.styles.get("cartoon"),
    signalIndexes.styles.get("kawaii"),
    signalIndexes.styles.get("chibi"),
  ]);
  const kidsIds = unionSets([
    signalIndexes.styles.get("cute"),
    signalIndexes.styles.get("chibi"),
    signalIndexes.styles.get("kawaii"),
    signalIndexes.styles.get("cartoon"),
    signalIndexes.subjects.get("puppy"),
    signalIndexes.subjects.get("kitten"),
  ]);
  const adultsIds = unionSets([
    signalIndexes.styles.get("mandala"),
    signalIndexes.styles.get("geometric"),
    signalIndexes.styles.get("detailed"),
  ]);

  if (easyIds.size >= VIABLE_HUB_MIN_ASSETS) {
    addCandidate(candidateMap, {
      candidateType: "audience",
      labelTerm: "easy",
      slug: "easy",
      assetIds: [...easyIds],
      intentModel: "Use-case hub inferred from simple, cute, cartoon, kawaii, and chibi filename/style signals.",
      terms: ["easy", "simple", "cute", "cartoon", "kawaii", "chibi"],
    });
  }
  if (kidsIds.size >= VIABLE_HUB_MIN_ASSETS) {
    addCandidate(candidateMap, {
      candidateType: "audience",
      labelTerm: "for kids",
      slug: "for-kids",
      assetIds: [...kidsIds],
      intentModel: "Audience hub inferred from kid-friendly style signals, not fake search volume.",
      terms: ["kids", "cute", "chibi", "kawaii", "cartoon"],
      thresholdException: null,
    });
  }
  if (adultsIds.size >= VIABLE_HUB_MIN_ASSETS) {
    addCandidate(candidateMap, {
      candidateType: "audience",
      labelTerm: "detailed for adults",
      slug: "detailed-for-adults",
      assetIds: [...adultsIds],
      intentModel: "Audience and difficulty hub inferred from detailed, mandala, and geometric signals.",
      terms: ["detailed", "adult", "mandala", "geometric"],
    });
  }
}

function addCrossSignalCandidates({ candidateMap, signalIndexes }) {
  const usefulStyles = ["cute", "chibi", "kawaii", "cartoon", "plushie"];
  const usefulThemes = ["christmas", "halloween", "birthday", "holiday", "garden", "forest", "ocean", "winter", "fantasy", "medieval"];
  const usefulSubjects = [
    "animal",
    "dinosaur",
    "dog",
    "cat",
    "bird",
    "butterfly",
    "dragon",
    "unicorn",
    "flower",
    "plant",
    "indoor plant",
    "mandala",
    "fantasy creature",
    "sea life",
    "reptile",
    "world landmark",
    "vehicle",
    "bakery",
    "anime girl",
  ];

  for (const style of usefulStyles) {
    const styleIds = signalIndexes.styles.get(style);
    if (!styleIds) continue;
    for (const subject of usefulSubjects) {
      const subjectIds = signalIndexes.subjects.get(subject) || signalIndexes.parents.get(subject);
      if (!subjectIds) continue;
      if (subject.includes(style)) continue;
      if (style === "mandala" && ["anime girl", "mandala", "plushie"].includes(subject)) continue;
      if (style === "plushie" && ["anime girl", "indoor plant", "mandala", "plant", "vehicle", "world landmark", "bakery"].includes(subject)) continue;
      const ids = intersectSets(styleIds, subjectIds);
      if (ids.size < CANDIDATE_MIN_ASSETS) continue;
      if (style === "mandala" && subject === "mandala") continue;
      addCandidate(candidateMap, {
        candidateType: "cross_folder",
        labelTerm: `${style} ${pluralDisplay(subject)}`,
        slug: slugify(`${style} ${pluralRouteTerm(subject)}`),
        assetIds: [...ids],
        intentModel: "Cross-folder hub inferred from style plus subject filename signals.",
        terms: [style, subject],
      });
    }
  }

  for (const theme of usefulThemes) {
    const themeIds = signalIndexes.themes.get(theme) || signalIndexes.subjects.get(theme);
    if (!themeIds) continue;
    for (const subject of usefulSubjects) {
      const subjectIds = signalIndexes.subjects.get(subject) || signalIndexes.parents.get(subject);
      if (!subjectIds) continue;
      const ids = intersectSets(themeIds, subjectIds);
      if (ids.size < CANDIDATE_MIN_ASSETS) continue;
      if (theme === subject) continue;
      if (subject.includes(theme)) continue;
      if (theme === "ocean" && subject === "sea life") continue;
      addCandidate(candidateMap, {
        candidateType: "cross_folder",
        labelTerm: `${theme} ${pluralDisplay(subject)}`,
        slug: slugify(`${routeSlugForTerm(theme)} ${pluralRouteTerm(subject)}`),
        assetIds: [...ids],
        intentModel: "Cross-folder hub inferred from holiday or scene plus subject filename signals.",
        terms: [theme, subject],
      });
    }
  }
}

function addRejectedAliasCandidates({ candidateMap, signalIndexes }) {
  const aliases = [
    { raw: "dinosaurs", canonical: "dinosaur", reason: "plural_duplicate_normalized_to_canonical_subject" },
    { raw: "dino", canonical: "dinosaur", reason: "synonym_duplicate_normalized_to_dinosaur" },
    { raw: "tyrannosaurus rex", canonical: "t-rex", reason: "synonym_duplicate_normalized_to_t_rex" },
    { raw: "trex", canonical: "t-rex", reason: "synonym_duplicate_normalized_to_t_rex" },
    { raw: "xmas", canonical: "christmas", reason: "synonym_duplicate_normalized_to_christmas" },
    { raw: "midieval fantasy", canonical: "medieval", reason: "typo_duplicate_normalized_to_medieval" },
    { raw: "vehicle typo vehiacle", canonical: "vehicle", reason: "typo_duplicate_normalized_to_vehicle" },
    { raw: "family", canonical: null, reason: "weak_modifier_only_topic" },
    { raw: "wearing hoodie", canonical: null, reason: "weak_modifier_only_topic" },
  ];

  for (const alias of aliases) {
    const canonicalIds = alias.canonical
      ? signalIndexes.subjects.get(alias.canonical)
        || signalIndexes.parents.get(alias.canonical)
        || signalIndexes.styles.get(alias.canonical)
        || signalIndexes.themes.get(alias.canonical)
      : unionSets([signalIndexes.modifiers.get("family"), signalIndexes.modifiers.get("hoodie")]);
    if (!canonicalIds || canonicalIds.size === 0) continue;
    addCandidate(candidateMap, {
      candidateType: "rejected_alias",
      labelTerm: alias.raw,
      slug: slugify(alias.raw),
      assetIds: [...canonicalIds],
      intentModel: "Rejected candidate retained for auditability.",
      terms: [alias.raw],
      forcedTier: "rejected",
      forcedRejectionReasons: [alias.reason],
      duplicateRiskOverride: 20,
      hubIdOverride: `hub_rejected_${slugify(alias.raw).replace(/-/g, "_")}`,
    });
  }
}

function addCandidate(candidateMap, options) {
  const slug = options.slug || routeSlugForTerm(options.labelTerm);
  const hubId = options.hubIdOverride || `hub_${slug.replace(/-/g, "_")}`;
  const existing = candidateMap.get(hubId);
  const assetIds = [...new Set(options.assetIds)].sort();
  if (assetIds.length === 0) return;

  const routeSlug = slug === "coloring-pages" ? "" : slug;
  const title = canonicalHubTitle(options.labelTerm, options.candidateType);
  const base = {
    hubId,
    slug,
    normalizedSlug: slug,
    canonicalTitle: title,
    h1: title,
    route: routeSlug ? `/coloring-pages/${routeSlug}` : "/coloring-pages",
    candidateType: options.candidateType,
    intentModel: options.intentModel,
    terms: [...new Set(options.terms || [options.labelTerm])].sort(),
    assetIds,
    asset_count: assetIds.length,
    thresholdException: options.thresholdException || null,
    forcedTier: options.forcedTier || null,
    forcedRejectionReasons: options.forcedRejectionReasons || [],
    duplicateRiskOverride: options.duplicateRiskOverride,
    indexable: options.indexable,
    sitemap: options.sitemap,
  };

  if (!existing) {
    candidateMap.set(hubId, base);
    return;
  }

  existing.assetIds = [...new Set([...existing.assetIds, ...assetIds])].sort();
  existing.asset_count = existing.assetIds.length;
  existing.terms = [...new Set([...existing.terms, ...base.terms])].sort();
  existing.intentModel = `${existing.intentModel} ${base.intentModel}`.trim();
  existing.forcedRejectionReasons = [...new Set([...existing.forcedRejectionReasons, ...base.forcedRejectionReasons])].sort();
  if (base.duplicateRiskOverride) existing.duplicateRiskOverride = Math.max(existing.duplicateRiskOverride || 0, base.duplicateRiskOverride);
}

function scoreAndTierCandidates({ candidates, signalIndexes, state }) {
  const candidatesWithEvidence = candidates
    .map((candidate) => enrichCandidateEvidence({ candidate, signalIndexes, state }))
    .map((candidate) => scoreCandidate({ candidate, signalIndexes }))
    .sort(compareCandidates);

  const initiallyTiered = candidatesWithEvidence.map((candidate) => ({
    ...candidate,
    publish_tier: determinePublishTier(candidate),
  }));

  const phase1Qualified = initiallyTiered
    .filter((candidate) => candidate.publish_tier === "phase_1_publish")
    .sort(compareCandidates);
  const allowedPhase1Ids = new Set(phase1Qualified.slice(0, PHASE_1_MAX_HUBS).map((candidate) => candidate.hubId));
  for (const candidate of phase1Qualified) {
    if (PHASE_1_PROTECTED_SLUGS.has(candidate.slug)) {
      allowedPhase1Ids.add(candidate.hubId);
    }
  }

  return initiallyTiered
    .map((candidate) => {
      if (candidate.publish_tier === "phase_1_publish" && !allowedPhase1Ids.has(candidate.hubId)) {
        return {
          ...candidate,
          publish_tier: "phase_2_backlog",
          recommendationReason: `${candidate.recommendationReason} Deferred by Phase 1 cap.`,
        };
      }
      return candidate;
    })
    .sort(compareCandidates);
}

function enrichCandidateEvidence({ candidate, signalIndexes, state }) {
  const sourceCategoryCounts = new Map();
  const subjectCounts = new Map();
  const styleCounts = new Map();
  const themeCounts = new Map();
  const examples = [];

  for (const assetId of candidate.assetIds) {
    const asset = state.assetById.get(assetId);
    const signals = signalIndexes.assetSignalsById.get(assetId);
    if (!asset || !signals) continue;
    incrementMap(sourceCategoryCounts, asset.categorySlug, 1);
    for (const term of signals.primarySubjects) incrementMap(subjectCounts, term, 1);
    for (const term of signals.styles) incrementMap(styleCounts, term, 1);
    for (const term of signals.sceneThemes) incrementMap(themeCounts, term, 1);
    if (examples.length < 12) {
      examples.push({
        assetId,
        filename: path.posix.basename(asset.sourceRelativePath),
        sourceRelativePath: asset.sourceRelativePath,
      });
    }
  }

  return {
    ...candidate,
    sourceEvidence: {
      sourceCategoryCount: sourceCategoryCounts.size,
      sourceCategories: mapToCountRows(sourceCategoryCounts, "categorySlug").slice(0, 20),
      strongestSubjects: mapToCountRows(subjectCounts, "term").slice(0, 12),
      strongestStyles: mapToCountRows(styleCounts, "term").slice(0, 12),
      strongestThemes: mapToCountRows(themeCounts, "term").slice(0, 12),
      exampleFilenames: examples.map((example) => example.filename),
      exampleSourcePaths: examples.map((example) => example.sourceRelativePath),
      exampleAssetIds: examples.map((example) => example.assetId),
    },
  };
}

function scoreCandidate({ candidate, signalIndexes }) {
  const assetCount = candidate.asset_count;
  const sourceCategoryCount = candidate.sourceEvidence.sourceCategoryCount;
  const strongestSubjectCount = candidate.sourceEvidence.strongestSubjects.length;
  const content_depth_score = scoreContentDepth(assetCount);
  const search_intent_clarity_score = scoreIntentClarity(candidate);
  const unique_subject_score = clamp(Math.round(Math.min(20, strongestSubjectCount * 2 + sourceCategoryCount * 2 + (candidate.candidateType === "specific_subject" ? 4 : 0))), 0, 20);
  const overlap_risk_score = scoreOverlapRisk(candidate, signalIndexes);
  const duplicate_risk_score = candidate.duplicateRiskOverride ?? scoreDuplicateRisk(candidate);
  const user_value_score = clamp(Math.round((content_depth_score + search_intent_clarity_score) / 2 + Math.min(4, sourceCategoryCount)), 0, 20);
  const final_recommendation_score = clamp(Math.round(
    search_intent_clarity_score * 1.5
    + content_depth_score * 1.35
    + unique_subject_score * 0.85
    + user_value_score * 1.4
    - overlap_risk_score * 0.7
    - duplicate_risk_score * 1.1,
  ), 0, 100);
  const rejectionReasons = buildRejectionReasons({
    candidate,
    assetCount,
    search_intent_clarity_score,
    overlap_risk_score,
    duplicate_risk_score,
  });
  const recommendationReason = buildRecommendationReason({
    candidate,
    assetCount,
    sourceCategoryCount,
    search_intent_clarity_score,
    overlap_risk_score,
    duplicate_risk_score,
  });

  return {
    ...candidate,
    asset_count: assetCount,
    unique_subject_score,
    search_intent_clarity_score,
    content_depth_score,
    overlap_risk_score,
    duplicate_risk_score,
    user_value_score,
    final_recommendation_score,
    rejectionReasons,
    recommendationReason,
  };
}

function determinePublishTier(candidate) {
  if (candidate.forcedTier) return candidate.forcedTier;
  if (candidate.rejectionReasons.length > 0) return "rejected";
  if (candidate.candidateType === "root") return "phase_1_publish";
  if (
    candidate.asset_count >= STRONG_HUB_MIN_ASSETS
    && candidate.search_intent_clarity_score >= 13
    && candidate.final_recommendation_score >= 58
    && candidate.overlap_risk_score < 17
    && candidate.duplicate_risk_score < 12
  ) {
    return "phase_1_publish";
  }
  if (
    candidate.asset_count >= VIABLE_HUB_MIN_ASSETS
    && candidate.search_intent_clarity_score >= 11
    && candidate.final_recommendation_score >= 45
    && candidate.duplicate_risk_score < 16
  ) {
    return "phase_2_backlog";
  }
  if (candidate.asset_count >= CANDIDATE_MIN_ASSETS && candidate.search_intent_clarity_score >= 8) {
    return "section_only";
  }
  return "rejected";
}

function buildRejectionReasons({ candidate, assetCount, search_intent_clarity_score, overlap_risk_score, duplicate_risk_score }) {
  const reasons = [...candidate.forcedRejectionReasons];
  if (assetCount < CANDIDATE_MIN_ASSETS) reasons.push("too_few_assets");
  if (duplicate_risk_score >= 18) reasons.push("duplicate_or_synonym_route_risk");
  if (search_intent_clarity_score < 8) reasons.push("unclear_search_or_user_intent");
  if (candidate.terms.some((term) => WEAK_STANDALONE_TERMS.has(term))) reasons.push("weak_modifier_only_topic");
  if (overlap_risk_score >= 19 && assetCount < STRONG_HUB_MIN_ASSETS) reasons.push("thin_high_overlap_topic");
  return [...new Set(reasons)].sort();
}

function buildRecommendationReason({ candidate, assetCount, sourceCategoryCount, search_intent_clarity_score, overlap_risk_score, duplicate_risk_score }) {
  if (candidate.forcedTier === "rejected") {
    return "Rejected audit candidate from normalization or weak modifier controls.";
  }
  const parts = [];
  if (assetCount >= STRONG_HUB_MIN_ASSETS) parts.push(`${assetCount} assets`);
  else parts.push(`${assetCount} supporting assets`);
  if (sourceCategoryCount > 1) parts.push(`${sourceCategoryCount} source folders`);
  if (search_intent_clarity_score >= 15) parts.push("clear user intent");
  if (overlap_risk_score >= 12) parts.push("monitor overlap with parent hub");
  if (duplicate_risk_score >= 8) parts.push("normalization reduces duplicate risk");
  return `${parts.join(", ")}.`;
}

function buildHubContentModel({ candidate, allCandidates, state, tokenAnalysis }) {
  const assetIds = [...candidate.assetIds].sort((a, b) => compareAssetIdsBySource(a, b, state.assetById));
  const featuredAssetIds = pickFeaturedAssetIds(assetIds, state.assetById, 12);
  const sectionGroupings = buildSectionGroupings(candidate, state, tokenAnalysis);
  const relatedHubIds = findRelatedHubIds(candidate, allCandidates);
  const parentHubId = findParentHubId(candidate, allCandidates);
  const indexable = candidate.publish_tier === "phase_1_publish" || candidate.publish_tier === "phase_2_backlog";
  const sectionOnly = candidate.publish_tier === "section_only";

  return {
    hubId: candidate.hubId,
    slug: candidate.slug === "coloring-pages" ? "" : candidate.slug,
    normalizedSlug: candidate.normalizedSlug,
    route: candidate.route,
    canonicalTitle: candidate.canonicalTitle,
    h1: candidate.h1,
    metaTitleCandidate: `${candidate.canonicalTitle} | Printable Coloring Pages`,
    metaDescriptionCandidate: buildMetaDescription(candidate),
    introCopyCandidate: buildIntroCopy(candidate),
    candidateType: candidate.candidateType,
    publish_tier: candidate.publish_tier,
    assetCount: assetIds.length,
    assetIds,
    featuredAssetIds,
    sectionGroupings,
    relatedHubIds,
    parentHubId,
    childHubIds: [],
    breadcrumbPath: [
      { label: "Coloring Pages", route: "/coloring-pages" },
      ...(candidate.route === "/coloring-pages" ? [] : [{ label: candidate.canonicalTitle.replace(/ Coloring Pages$/, ""), route: candidate.route }]),
    ],
    internalLinkingTargets: [],
    indexabilityRecommendation: sectionOnly ? "section_only" : (indexable ? "indexable" : "noindex"),
    sitemapRecommendation: candidate.publish_tier === "phase_1_publish" ? "include" : "exclude",
    noPerImageIndexableRoute: true,
    galleryBehavior: buildGalleryBehavior(assetIds.length),
    parentHubCandidate: parentHubId,
    childHubCandidates: [],
    sourceEvidence: candidate.sourceEvidence,
    recommendationReason: candidate.recommendationReason,
    score: {
      asset_count: candidate.asset_count,
      unique_subject_score: candidate.unique_subject_score,
      search_intent_clarity_score: candidate.search_intent_clarity_score,
      content_depth_score: candidate.content_depth_score,
      overlap_risk_score: candidate.overlap_risk_score,
      duplicate_risk_score: candidate.duplicate_risk_score,
      user_value_score: candidate.user_value_score,
      final_recommendation_score: candidate.final_recommendation_score,
    },
    thresholdException: candidate.asset_count < STRONG_HUB_MIN_ASSETS && candidate.publish_tier === "phase_1_publish"
      ? { reason: "Phase 1 exception approved by score and clear user intent." }
      : null,
    warningMetadataPolicy: "internal_metadata_only",
  };
}

function buildRootHubRecord(state) {
  const assetIds = state.assets.map((asset) => asset.assetId).sort((a, b) => compareAssetIdsBySource(a, b, state.assetById));
  return {
    hubId: "root_coloring_pages",
    slug: "",
    normalizedSlug: "coloring-pages",
    route: "/coloring-pages",
    canonicalTitle: "Coloring Pages",
    h1: "Coloring Pages",
    metaTitleCandidate: "Printable Coloring Pages",
    metaDescriptionCandidate: "Browse printable coloring pages organized by subject, style, holiday, and theme.",
    introCopyCandidate: "Browse printable coloring pages organized into useful subject, style, holiday, and theme hubs.",
    assetCount: assetIds.length,
    assetIds,
    featuredAssetIds: pickFeaturedAssetIds(assetIds, state.assetById, 18),
    breadcrumbPath: [{ label: "Coloring Pages", route: "/coloring-pages" }],
    indexabilityRecommendation: "indexable",
    sitemapRecommendation: "include",
    noPerImageIndexableRoute: true,
  };
}

function extractAssetSignals(asset) {
  const sourceFilename = path.posix.basename(asset.sourceRelativePath, path.posix.extname(asset.sourceRelativePath));
  const rawText = [
    sourceFilename,
    asset.filenameSlug,
    asset.titleCandidate,
    asset.displayNameCandidate,
    asset.categorySlug,
    asset.originalCategory,
  ].filter(Boolean).join(" ");

  const normalizedSpaceText = normalizeTextForMatching(rawText);
  const phraseTerms = extractPhraseTerms(normalizedSpaceText);
  const normalizedTokens = extractNormalizedTokens(normalizedSpaceText);
  const primarySubjects = new Set();
  const parentSubjects = new Set();
  const styles = new Set();
  const themes = new Set();
  const audienceDifficulty = new Set();
  const objectContextModifiers = new Set();

  const categorySignals = CATEGORY_SIGNAL_RULES[asset.categorySlug] || {};
  for (const term of categorySignals.subjects || []) addSubjectWithParents(term, primarySubjects, parentSubjects);
  for (const term of categorySignals.parents || []) parentSubjects.add(term);
  for (const term of categorySignals.styles || []) styles.add(term);
  for (const term of categorySignals.themes || []) themes.add(term);

  for (const term of phraseTerms) {
    if (SUBJECT_DEFINITIONS[term]) addSubjectWithParents(term, primarySubjects, parentSubjects);
    if (STYLE_TERMS.has(term)) styles.add(term);
    if (THEME_TERMS.has(term)) themes.add(term);
  }

  for (const token of normalizedTokens) {
    if (SUBJECT_DEFINITIONS[token]) addSubjectWithParents(token, primarySubjects, parentSubjects);
    if (STYLE_TERMS.has(token)) styles.add(token);
    if (THEME_TERMS.has(token)) themes.add(token);
    if (DIFFICULTY_TERMS.has(token)) audienceDifficulty.add(normalizeAudienceDifficulty(token));
    if (MODIFIER_TERMS.has(token)) objectContextModifiers.add(token);
    if (token === "christmas") addSubjectWithParents("christmas", primarySubjects, parentSubjects);
    if (token === "halloween") addSubjectWithParents("halloween", primarySubjects, parentSubjects);
    if (token === "birthday") addSubjectWithParents("birthday", primarySubjects, parentSubjects);
    if (token === "fantasy") addSubjectWithParents("fantasy", primarySubjects, parentSubjects);
    if (token === "mythology") addSubjectWithParents("mythology", primarySubjects, parentSubjects);
    if (token === "medieval") addSubjectWithParents("medieval", primarySubjects, parentSubjects);
    if (token === "mandala") addSubjectWithParents("mandala", primarySubjects, parentSubjects);
    if (token === "geometry") styles.add("geometric");
  }

  if (styles.has("cute") || styles.has("chibi") || styles.has("kawaii") || styles.has("cartoon")) {
    audienceDifficulty.add("kids");
    audienceDifficulty.add("easy");
  }
  if (styles.has("mandala") || styles.has("geometric") || styles.has("detailed")) {
    audienceDifficulty.add("adults");
    audienceDifficulty.add("detailed");
  }

  return {
    normalizedTokens: [...new Set([...normalizedTokens, ...phraseTerms])].sort(),
    primarySubjects: [...primarySubjects].sort(),
    parentSubjects: [...parentSubjects].sort(),
    styles: [...styles].sort(),
    themes: [...themes].sort(),
    audienceDifficulty: [...audienceDifficulty].sort(),
    objectContextModifiers: [...objectContextModifiers].sort(),
  };
}

function addSubjectWithParents(term, primarySubjects, parentSubjects) {
  primarySubjects.add(term);
  let parent = SUBJECT_DEFINITIONS[term]?.parent;
  const seen = new Set([term]);
  while (parent && !seen.has(parent)) {
    parentSubjects.add(parent);
    seen.add(parent);
    parent = SUBJECT_DEFINITIONS[parent]?.parent;
  }
}

function normalizeTextForMatching(text) {
  return text
    .toLowerCase()
    .replace(/\bmidieval\b/g, "medieval")
    .replace(/\bmideival\b/g, "medieval")
    .replace(/\bvehiacle\b/g, "vehicle")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhraseTerms(normalizedSpaceText) {
  const terms = new Set();
  for (const rule of PHRASE_RULES) {
    if (rule.patterns.some((pattern) => new RegExp(pattern).test(normalizedSpaceText))) {
      terms.add(rule.canonicalTerm);
    }
  }
  if (/\bsea\b/.test(normalizedSpaceText) && /\b(life|ocean|fish|whale|dolphin|shark|octopus|crab)\b/.test(normalizedSpaceText)) {
    terms.add("sea life");
  }
  return [...terms].sort();
}

function extractNormalizedTokens(normalizedSpaceText) {
  return [...new Set(normalizedSpaceText
    .split(" ")
    .map((token) => normalizeToken(token))
    .filter(Boolean))]
    .sort();
}

function normalizeToken(token) {
  if (!token || token.length < 2) return null;
  if (STOP_TOKENS.has(token)) return null;
  const replaced = TOKEN_REPLACEMENTS[token] || singularizeToken(token);
  if (!replaced || STOP_TOKENS.has(replaced)) return null;
  return replaced;
}

function singularizeToken(token) {
  if (SUBJECT_DEFINITIONS[token]) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) {
    const singular = token.slice(0, -1);
    if (SUBJECT_DEFINITIONS[singular] || STYLE_TERMS.has(singular) || THEME_TERMS.has(singular)) return singular;
  }
  return token;
}

function normalizeAudienceDifficulty(token) {
  if (token === "adult") return "adults";
  if (token === "simple" || token === "beginner") return "easy";
  if (token === "advanced") return "detailed";
  return token;
}

function buildSectionGroupings(candidate, state) {
  const subjectCounts = new Map();
  const styleCounts = new Map();
  const themeCounts = new Map();
  const difficultyCounts = new Map();
  const categoryCounts = new Map();

  for (const assetId of candidate.assetIds) {
    const asset = state.assetById.get(assetId);
    if (!asset) continue;
    const signals = extractAssetSignals(asset);
    incrementMap(categoryCounts, asset.categorySlug, 1);
    for (const term of signals.primarySubjects) incrementMap(subjectCounts, term, 1);
    for (const term of signals.styles) incrementMap(styleCounts, term, 1);
    for (const term of signals.themes) incrementMap(themeCounts, term, 1);
    for (const term of signals.audienceDifficulty) incrementMap(difficultyCounts, term, 1);
  }

  const sections = [
    groupingFromCounts("popular_subjects", "Popular Subjects", subjectCounts),
    groupingFromCounts("styles", "Styles", styleCounts),
    groupingFromCounts("themes", "Themes", themeCounts),
    groupingFromCounts("difficulty", "Difficulty", difficultyCounts),
    groupingFromCounts("source_categories", "Source Categories", categoryCounts),
  ].filter((section) => section.items.length > 1);

  return sections;
}

function groupingFromCounts(groupingId, label, counts) {
  return {
    groupingId,
    label,
    items: mapToCountRows(counts, "term")
      .filter((row) => row.assetCount >= CANDIDATE_MIN_ASSETS)
      .slice(0, 12)
      .map((row) => ({
        label: groupingId === "source_categories" ? row.term : displayTerm(row.term),
        term: row.term,
        assetCount: row.assetCount,
      })),
  };
}

function findRelatedHubIds(candidate, allCandidates) {
  return allCandidates
    .filter((other) => other.hubId !== candidate.hubId && other.publish_tier !== "rejected")
    .map((other) => ({
      hubId: other.hubId,
      score: relationScore(candidate, other),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.hubId.localeCompare(b.hubId))
    .slice(0, 10)
    .map((row) => row.hubId);
}

function relationScore(a, b) {
  const sharedTerms = a.terms.filter((term) => b.terms.includes(term)).length;
  const sharedCategories = intersectArray(
    a.sourceEvidence.sourceCategories.map((row) => row.categorySlug),
    b.sourceEvidence.sourceCategories.map((row) => row.categorySlug),
  ).length;
  const assetOverlap = intersectSortedArrays(a.assetIds, b.assetIds).length;
  return sharedTerms * 10 + sharedCategories * 2 + Math.min(8, Math.floor(assetOverlap / 20));
}

function findParentHubId(candidate, allCandidates) {
  if (candidate.candidateType === "root") return null;
  const parentTerms = candidate.terms
    .map((term) => SUBJECT_DEFINITIONS[term]?.parent)
    .filter(Boolean);
  for (const parentTerm of parentTerms) {
    const parentSlug = routeSlugForTerm(parentTerm);
    const parent = allCandidates.find((other) => other.slug === parentSlug && other.publish_tier !== "rejected");
    if (parent) return parent.hubId;
  }
  const broader = allCandidates
    .filter((other) => other.hubId !== candidate.hubId && other.publish_tier !== "rejected")
    .filter((other) => candidate.assetIds.every((assetId) => other.assetIds.includes(assetId)))
    .sort((a, b) => a.asset_count - b.asset_count || a.hubId.localeCompare(b.hubId))[0];
  return broader?.hubId || "root_coloring_pages";
}

function buildMetaDescription(candidate) {
  const label = candidate.canonicalTitle.replace(/ Coloring Pages$/, "").toLowerCase();
  return `Browse printable ${label} coloring pages selected from approved production assets, with no indexable per-image pages.`;
}

function buildIntroCopy(candidate) {
  const label = candidate.canonicalTitle.replace(/ Coloring Pages$/, "").toLowerCase();
  return `Explore ${label} coloring pages grouped from descriptive filenames and approved production metadata.`;
}

function buildGalleryBehavior(assetCount) {
  return {
    featuredSection: true,
    popularSubjectsSection: assetCount >= 40,
    styleFilters: true,
    difficultyFilters: true,
    relatedSubHubs: true,
    galleryPagination: assetCount > 120 ? "load_more" : "single_page",
    initialVisibleAssetCount: Math.min(48, assetCount),
    cardActions: ["print", "download"],
    emptyState: "Link back to related hubs instead of generating filler copy.",
  };
}

function pickFeaturedAssetIds(assetIds, assetById, limit) {
  const byCategory = new Map();
  for (const assetId of assetIds) {
    const asset = assetById.get(assetId);
    const category = asset?.categorySlug || "unknown";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(assetId);
  }
  for (const ids of byCategory.values()) {
    ids.sort((a, b) => compareAssetIdsBySource(a, b, assetById));
  }
  const categories = [...byCategory.keys()].sort();
  const picked = [];
  let index = 0;
  while (picked.length < limit) {
    let added = false;
    for (const category of categories) {
      const id = byCategory.get(category)[index];
      if (id && !picked.includes(id)) {
        picked.push(id);
        added = true;
        if (picked.length >= limit) break;
      }
    }
    if (!added) break;
    index += 1;
  }
  return picked;
}

function scoreContentDepth(assetCount) {
  if (assetCount >= 500) return 20;
  if (assetCount >= 200) return 19;
  if (assetCount >= 100) return 18;
  if (assetCount >= 60) return 16;
  if (assetCount >= 40) return 14;
  if (assetCount >= 20) return 12;
  if (assetCount >= 12) return 9;
  if (assetCount >= 8) return 7;
  if (assetCount >= 3) return 4;
  return 1;
}

function scoreIntentClarity(candidate) {
  if (candidate.candidateType === "root") return 20;
  if (candidate.forcedTier === "rejected") return 4;
  if (candidate.terms.some((term) => WEAK_STANDALONE_TERMS.has(term))) return 5;
  if (candidate.candidateType === "specific_subject") return 18;
  if (candidate.candidateType === "broad_subject") return 16;
  if (candidate.candidateType === "theme") return 16;
  if (candidate.candidateType === "style") return 15;
  if (candidate.candidateType === "audience") return 14;
  if (candidate.candidateType === "cross_folder") {
    if (candidate.asset_count >= STRONG_HUB_MIN_ASSETS) return 15;
    return 11;
  }
  return 10;
}

function scoreOverlapRisk(candidate, signalIndexes) {
  if (candidate.candidateType === "root") return 0;
  if (candidate.candidateType === "rejected_alias") return 20;
  const term = candidate.terms[candidate.terms.length - 1];
  const parent = SUBJECT_DEFINITIONS[term]?.parent;
  if (["anime girl", "mandala", "world landmark", "indoor plant"].includes(term)) return 4;
  if (!parent) {
    return candidate.candidateType === "cross_folder" && candidate.asset_count < VIABLE_HUB_MIN_ASSETS ? 14 : 4;
  }
  const parentIds = signalIndexes.subjects.get(parent) || signalIndexes.parents.get(parent);
  if (!parentIds || parentIds.size === 0) return 4;
  const overlapRatio = candidate.asset_count / parentIds.size;
  if (overlapRatio >= 0.95 && candidate.candidateType !== "broad_subject") return 18;
  if (overlapRatio >= 0.75) return 12;
  if (overlapRatio >= 0.5) return 8;
  return 3;
}

function scoreDuplicateRisk(candidate) {
  if (candidate.candidateType === "rejected_alias") return 20;
  if (candidate.terms.some((term) => TOKEN_REPLACEMENTS[term] && TOKEN_REPLACEMENTS[term] !== term)) return 12;
  if (candidate.slug.includes("coloring-pages")) return candidate.candidateType === "root" ? 0 : 12;
  return 2;
}

function buildFolderSplitExamples(phase1Hubs, assets) {
  const categories = [...new Set(assets.map((asset) => asset.categorySlug))].sort();
  return categories
    .map((categorySlug) => {
      const hubs = phase1Hubs
        .filter((hub) => hub.sourceEvidence.sourceCategories.some((row) => row.categorySlug === categorySlug))
        .slice(0, 6);
      return { categorySlug, hubs };
    })
    .filter((example) => example.hubs.length >= 3)
    .slice(0, 10);
}

function summarizeCandidateTiers(candidates) {
  const byTier = candidates.reduce((map, candidate) => incrementMap(map, candidate.publish_tier || "unassigned", 1), new Map());
  return {
    totalHubCandidatesGenerated: candidates.length,
    phase1HubCount: byTier.get("phase_1_publish") || 0,
    phase2BacklogCount: byTier.get("phase_2_backlog") || 0,
    sectionOnlyTopicCount: byTier.get("section_only") || 0,
    rejectedCandidateCount: byTier.get("rejected") || 0,
  };
}

function canonicalHubTitle(labelTerm, candidateType) {
  if (candidateType === "audience") {
    if (labelTerm === "for kids") return "Coloring Pages for Kids";
    if (labelTerm === "detailed for adults") return "Detailed Coloring Pages for Adults";
  }
  if (candidateType === "root") return "Coloring Pages";
  return `${titleCaseLabel(labelTerm)} Coloring Pages`;
}

function titleCaseLabel(value) {
  const display = displayTerm(value);
  return display
    .split(" ")
    .map((word) => {
      if (["for", "and", "of"].includes(word.toLowerCase())) return word.toLowerCase();
      if (word.toLowerCase() === "t-rex") return "T-Rex";
      if (word.toLowerCase() === "st.") return "St.";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function displayTerm(term) {
  const definition = SUBJECT_DEFINITIONS[term];
  if (definition) return definition.publicLabel;
  const phraseRule = PHRASE_RULES.find((rule) => rule.canonicalTerm === term);
  if (phraseRule) return phraseRule.publicLabel;
  if (term === "for kids") return "For Kids";
  if (term === "detailed for adults") return "Detailed for Adults";
  if (term === "st patricks day") return "St. Patrick's Day";
  if (term === "t-rex") return "T-Rex";
  return term
    .split(/[\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function pluralDisplay(term) {
  return SUBJECT_DEFINITIONS[term]?.publicLabel || displayTerm(term);
}

function pluralRouteTerm(term) {
  return SUBJECT_DEFINITIONS[term]?.plural || routeSlugForTerm(term);
}

function routeSlugForTerm(term) {
  const definition = SUBJECT_DEFINITIONS[term];
  if (definition?.plural) return slugify(definition.plural);
  if (term === "for kids") return "for-kids";
  if (term === "detailed for adults") return "detailed-for-adults";
  return slugify(term);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function compareCandidates(a, b) {
  const tierRank = {
    phase_1_publish: 0,
    phase_2_backlog: 1,
    section_only: 2,
    rejected: 3,
    undefined: 4,
  };
  return (tierRank[a.publish_tier] ?? 4) - (tierRank[b.publish_tier] ?? 4)
    || b.final_recommendation_score - a.final_recommendation_score
    || b.asset_count - a.asset_count
    || a.slug.localeCompare(b.slug);
}

function compareHubRecords(a, b) {
  return b.score.final_recommendation_score - a.score.final_recommendation_score
    || b.assetCount - a.assetCount
    || a.slug.localeCompare(b.slug);
}

function compareAssets(a, b) {
  return a.assetId.localeCompare(b.assetId);
}

function compareAssetIdsBySource(a, b, assetById) {
  const first = assetById.get(a);
  const second = assetById.get(b);
  return String(first?.sourceRelativePath || a).localeCompare(String(second?.sourceRelativePath || b))
    || a.localeCompare(b);
}

function topClusterRows(countMap, categoryMap, limit) {
  return mapToCountRows(countMap, "term")
    .slice(0, limit)
    .map((row) => ({
      ...row,
      sourceCategories: [...(categoryMap.get(row.term) || [])].sort(),
    }));
}

function mapToCountRows(map, keyName) {
  return [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, term: key, assetCount: count }))
    .sort((a, b) => b.assetCount - a.assetCount || String(a.term).localeCompare(String(b.term)));
}

function incrementMap(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
  return map;
}

function addMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function addManyToIndex(index, terms, assetId) {
  for (const term of terms) {
    if (!index.has(term)) index.set(term, new Set());
    index.get(term).add(assetId);
  }
}

function unionSets(sets) {
  const result = new Set();
  for (const set of sets) {
    if (!set) continue;
    for (const value of set) result.add(value);
  }
  return result;
}

function intersectSets(a, b) {
  const result = new Set();
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) {
    if (large.has(value)) result.add(value);
  }
  return result;
}

function intersectArray(a, b) {
  const bSet = new Set(b);
  return a.filter((value) => bSet.has(value));
}

function intersectSortedArrays(a, b) {
  const bSet = new Set(b);
  return a.filter((value) => bSet.has(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "_No rows._";
  const cleanRows = rows.map((row) => row.map((cell) => String(cell).replace(/\|/g, "\\|")));
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...cleanRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function markdownBulletList(items) {
  if (items.length === 0) return "- None.";
  return items.map((item) => `- ${item}`).join("\n");
}

function markdownNumberedList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function yesNo(value) {
  return value ? "yes" : "no";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound4AHubTaxonomy()
    .then((result) => {
      const summary = result.taxonomy.approvedHubTaxonomy.summary;
      console.log(JSON.stringify({
        generatedAt: ROUND4A_GENERATED_AT,
        runId: ROUND4A_RUN_ID,
        successfulAssetsAnalyzed: summary.successfulAssetsAnalyzed,
        totalHubCandidatesGenerated: summary.totalHubCandidatesGenerated,
        phase1HubCount: summary.phase1HubCount,
        phase2BacklogCount: summary.phase2BacklogCount,
        sectionOnlyTopicCount: summary.sectionOnlyTopicCount,
        rejectedCandidateCount: summary.rejectedCandidateCount,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
