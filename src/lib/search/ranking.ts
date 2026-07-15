export type SearchRankInput = {
  title: string;
  stableKey: string;
  primaryLabel?: string;
  searchTerms?: string | string[];
  normalizedText?: string;
};

export type RankedSearchResult<T> = {
  item: T;
  rankClass: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  titleOnly: boolean;
};

/**
 * Shared deterministic ranking for global navigation search and client-side galleries.
 * Internal filenames, source paths, asset IDs, and source order are never ranking inputs.
 */
export function rankSearchItems<T extends SearchRankInput>(items: T[], rawQuery: string): RankedSearchResult<T>[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  return items
    .map((item) => rankOne(item, query))
    .filter((result): result is RankedSearchResult<T> => Boolean(result))
    .sort(compareRankedResults);
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´']/g, "")
    .replace(/[‐‑‒–—−-]/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankOne<T extends SearchRankInput>(item: T, query: string): RankedSearchResult<T> | null {
  const title = normalizeSearchText(item.title);
  const primaryLabel = normalizeSearchText(item.primaryLabel || "");
  const searchTerms = normalizeSearchText(Array.isArray(item.searchTerms) ? item.searchTerms.join(" ") : item.searchTerms || "");
  const normalizedText = normalizeSearchText(item.normalizedText || "");
  const queryTokens = query.split(" ");
  const titleTokens = title.split(" ").filter(Boolean);

  if (title === query) return result(item, 1, true);
  if (title.startsWith(query)) return result(item, 2, true);
  if (tokensAppearInText(queryTokens, title)) return result(item, 3, true);
  if (orderedTokenPrefixes(queryTokens, titleTokens)) return result(item, 4, true);
  if (matchesSearchField(primaryLabel, query, queryTokens)) return result(item, 5, false);
  if (matchesSearchField(searchTerms, query, queryTokens)) return result(item, 6, false);

  const combined = `${title} ${primaryLabel} ${searchTerms} ${normalizedText}`.trim();
  if (combined.includes(query)) return result(item, 7, false);
  return null;
}

function result<T>(item: T, rankClass: RankedSearchResult<T>["rankClass"], titleOnly: boolean): RankedSearchResult<T> {
  return { item, rankClass, titleOnly };
}

function compareRankedResults<T extends SearchRankInput>(left: RankedSearchResult<T>, right: RankedSearchResult<T>) {
  return left.rankClass - right.rankClass
    || Number(right.titleOnly) - Number(left.titleOnly)
    || normalizeSearchText(left.item.title).length - normalizeSearchText(right.item.title).length
    || left.item.title.localeCompare(right.item.title)
    || left.item.stableKey.localeCompare(right.item.stableKey);
}

function matchesSearchField(field: string, query: string, queryTokens: string[]) {
  return Boolean(field && (field.includes(query) || tokensAppearInText(queryTokens, field)));
}

function tokensAppearInText(tokens: string[], text: string) {
  const textTokens = new Set(text.split(" ").filter(Boolean));
  return tokens.length > 0 && tokens.every((token) => textTokens.has(token));
}

function orderedTokenPrefixes(queryTokens: string[], titleTokens: string[]) {
  if (queryTokens.length === 0 || queryTokens.length > titleTokens.length) return false;
  for (let start = 0; start <= titleTokens.length - queryTokens.length; start += 1) {
    if (queryTokens.every((token, index) => titleTokens[start + index].startsWith(token))) return true;
  }
  return false;
}
