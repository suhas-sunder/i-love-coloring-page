export type NavigationPrintableSearchRecord = {
  stableId: string;
  title: string;
  path: string;
  webpPath: string;
  primaryLabel: string;
  searchText: string;
};

export type NavigationCollectionSearchRecord = {
  hubId: string;
  label: string;
  path: string;
  assetCount: number;
  searchText: string;
};

export type NavigationSearchData = {
  printables: NavigationPrintableSearchRecord[];
  collections: NavigationCollectionSearchRecord[];
};

type PrintableTuple = [string, string, string, string, string, string];
type CollectionTuple = [string, string, string, number, string];
type CompactNavigationSearchPayload = { v: 2; p: PrintableTuple[]; c: CollectionTuple[] };

export const NAVIGATION_SEARCH_TIMEOUT_MS = 8_000;

let completedData: NavigationSearchData | null = null;
let pendingRequest: Promise<NavigationSearchData> | null = null;

export function loadNavigationSearchData() {
  if (completedData) return Promise.resolve(completedData);
  if (pendingRequest) return pendingRequest;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), NAVIGATION_SEARCH_TIMEOUT_MS);

  pendingRequest = fetch("/search-data/navigation.json", { cache: "no-store", signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("Search is temporarily unavailable");
      const payload = (await response.json()) as CompactNavigationSearchPayload;
      if (payload.v !== 2 || !Array.isArray(payload.p) || !Array.isArray(payload.c)) {
        throw new Error("Search is temporarily unavailable");
      }
      const data = {
        printables: payload.p.map(toPrintableRecord),
        collections: payload.c.map(toCollectionRecord),
      };
      completedData = data;
      return data;
    })
    .finally(() => window.clearTimeout(timeout))
    .catch((error) => {
      pendingRequest = null;
      throw error;
    });

  return pendingRequest;
}

function toPrintableRecord(tuple: PrintableTuple): NavigationPrintableSearchRecord {
  const [stableId, title, path, webpPath, primaryLabel, searchText] = tuple;
  return { stableId, title, path, webpPath, primaryLabel, searchText };
}

function toCollectionRecord(tuple: CollectionTuple): NavigationCollectionSearchRecord {
  const [hubId, label, path, assetCount, searchText] = tuple;
  return { hubId, label, path, assetCount, searchText };
}
