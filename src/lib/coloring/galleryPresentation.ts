import type { PublicColoringItem } from "./types";

const GROUPING_STOP_WORDS = new Set(["coloring", "design", "free", "page", "printable"]);
const MAX_CONSECUTIVE_GROUP_ITEMS = 2;

export function diversifyGalleryPresentation(items: PublicColoringItem[]) {
  if (items.length < 3) return [...items];

  const remaining = items.map((item) => ({ item, group: getPresentationGroup(item.title) }));
  const presented: PublicColoringItem[] = [];
  const recentGroups: string[] = [];

  while (remaining.length > 0) {
    const firstGroup = remaining[0].group;
    const repeatsDominantGroup = recentGroups.length === MAX_CONSECUTIVE_GROUP_ITEMS
      && recentGroups.every((group) => group === firstGroup);
    const nextIndex = repeatsDominantGroup
      ? remaining.findIndex((entry) => entry.group !== firstGroup)
      : 0;
    const selectedIndex = nextIndex > 0 ? nextIndex : 0;
    const [selected] = remaining.splice(selectedIndex, 1);

    presented.push(selected.item);
    recentGroups.push(selected.group);
    if (recentGroups.length > MAX_CONSECUTIVE_GROUP_ITEMS) recentGroups.shift();
  }

  return presented;
}

export function getPresentationGroup(title: string) {
  const tokens = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !GROUPING_STOP_WORDS.has(token) && !/^\d+$/.test(token))
    .map(normalizeGroupToken);
  return tokens.slice(0, 2).join(" ") || "other";
}

function normalizeGroupToken(token: string) {
  if (token.length > 3 && !token.endsWith("ss") && token.endsWith("s")) return token.slice(0, -1);
  return token;
}
