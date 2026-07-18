#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = JSON.parse(await readFile(path.join(root, "src/generated/coloring/runtime-hubs.json"), "utf8"));
const NAVIGATION_HUB_IDS = new Set([
  "hub_for_kids", "hub_detailed_for_adults", "hub_animals", "hub_plushies", "hub_mandalas", "hub_fantasy",
  "hub_dinosaurs", "hub_vehicles", "hub_easy", "hub_chibi", "hub_kawaii", "hub_cute", "hub_flowers",
  "hub_sea_life", "hub_dogs", "hub_birds", "hub_prehistoric_animals", "hub_food", "hub_buildings",
  "hub_fantasy_creatures", "hub_christmas", "hub_halloween",
]);
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
