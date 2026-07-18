#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = JSON.parse(await readFile(path.join(root, "src/generated/coloring/runtime-hubs.json"), "utf8"));
const navigationSource = await readFile(path.join(root, "src/lib/navigation/siteNav.ts"), "utf8");
const NAVIGATION_HUB_IDS = new Set([...navigationSource.matchAll(/\bhub\("[^"]+",\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)"\)/g)].map((match) => match[1]));
const counts = Object.fromEntries(
  [...source.hubs]
    .filter((hub) => NAVIGATION_HUB_IDS.has(hub.hubId))
    .sort((left, right) => left.hubId.localeCompare(right.hubId))
    .map((hub) => [hub.hubId, new Set(hub.assetIds).size]),
);
if (Object.keys(counts).length !== NAVIGATION_HUB_IDS.size) throw new Error("A configured navigation hub is missing from runtime hubs.");
const output = {
  schemaVersion: 1,
  sourceGeneratedAt: source.generatedAt,
  source: "runtime-hubs.json unique assetIds for the curated navigation subset",
  sourceHubCount: source.hubs.length,
  navigationHubCount: NAVIGATION_HUB_IDS.size,
  counts,
  countsSha256: createHash("sha256").update(JSON.stringify(counts)).digest("hex"),
};
await writeFile(path.join(root, "src/generated/coloring/runtime-hub-counts.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ navigationHubCount: output.navigationHubCount, countsSha256: output.countsSha256 }, null, 2));
