const DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAY_WINDOW_SIZE = 3;

type UniqueKey = string | number;

type RotatingFeaturedOptions<T> = {
  candidates: T[];
  fallbackItems: T[];
  count: number;
  seed: string;
  keyFn: (item: T) => UniqueKey;
};

export function getThreeDayWindowKey(now: Date = new Date()) {
  const year = now.getUTCFullYear();
  const dayStart = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
  const yearStart = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((dayStart - yearStart) / DAY_MS);
  const windowIndex = Math.floor(dayOfYear / THREE_DAY_WINDOW_SIZE);
  return `${year}-utc-3day-${windowIndex}`;
}

export function getHubRotationSeed(hubSlug: string, now: Date = new Date()) {
  return `hub:${hubSlug}:${getThreeDayWindowKey(now)}`;
}

export function getHomepageReloadSeed(entropy?: string | number) {
  if (entropy !== undefined) return `home:${entropy}`;

  const cryptoSource = globalThis.crypto;
  if (cryptoSource?.getRandomValues) {
    const values = new Uint32Array(2);
    cryptoSource.getRandomValues(values);
    return `home:${values[0].toString(36)}:${values[1].toString(36)}`;
  }

  const performanceTicks =
    typeof globalThis.performance?.now === "function" ? Math.round(globalThis.performance.now() * 1000) : 0;
  return `home:${Date.now()}:${performanceTicks}`;
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const shuffled = items.slice();
  const random = mulberry32(hashSeed(seed));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function pickUnique<T>(items: T[], count: number, keyFn: (item: T) => UniqueKey): T[] {
  const selected: T[] = [];
  const seen = new Set<UniqueKey>();

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= count) break;
  }

  return selected;
}

export function getRotatingFeaturedItems<T>({
  candidates,
  fallbackItems,
  count,
  seed,
  keyFn,
}: RotatingFeaturedOptions<T>): T[] {
  const safeCount = Math.max(0, count);
  if (safeCount === 0) return [];

  const fallback = pickUnique(fallbackItems, safeCount, keyFn);
  const uniqueCandidates = pickUnique(candidates, candidates.length, keyFn);
  if (uniqueCandidates.length === 0) return fallback;

  const rotated = pickUnique(seededShuffle(uniqueCandidates, seed), safeCount, keyFn);
  if (rotated.length >= safeCount) return rotated;

  return pickUnique([...rotated, ...fallback], safeCount, keyFn);
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function mulberry32(seed: number) {
  return function nextRandom() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
