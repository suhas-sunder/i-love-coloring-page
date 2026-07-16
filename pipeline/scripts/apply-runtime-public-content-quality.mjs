#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
export const RUNTIME_HUBS_PATH = "src/generated/coloring/runtime-hubs.json";
const INTERNAL_INTRO_PATTERNS = [
  /grouped from descriptive filenames and approved production metadata\./i,
  /supported by actual runtime assets\./i,
];

export async function applyRuntimePublicContentQuality({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const source = JSON.parse(await readFile(path.join(repoRoot, RUNTIME_HUBS_PATH), "utf8"));
  const output = applyPublicContentQuality(source);
  if (write) await writeFile(path.join(repoRoot, RUNTIME_HUBS_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return output;
}

export function applyPublicContentQuality(source) {
  const output = structuredClone(source);
  const membershipHashBefore = hashMembership(output.hubs);
  for (const hub of output.hubs) {
    if (!INTERNAL_INTRO_PATTERNS.some((pattern) => pattern.test(hub.intro))) continue;
    hub.intro = buildApprovedIntro(hub);
  }
  const membershipHashAfter = hashMembership(output.hubs);
  if (membershipHashAfter !== membershipHashBefore) throw new Error("Public content quality changed hub membership");

  const qualityControlledIntroCount = output.hubs.filter((hub) => isApprovedIntro(hub.intro)).length;
  const internalWordingCount = output.hubs.filter((hub) => INTERNAL_INTRO_PATTERNS.some((pattern) => pattern.test(hub.intro))).length;
  if (internalWordingCount !== 0) throw new Error("Internal hub introduction wording remains");
  for (const hub of output.hubs) {
    if (hub.h1 !== hub.title) throw new Error(`Hub H1/title mismatch: ${hub.hubId}`);
    if (hub.assetCount !== hub.assetIds.length) throw new Error(`Hub asset count mismatch: ${hub.hubId}`);
  }
  output.summary = {
    ...output.summary,
    publicContentQualityVersion: 1,
    qualityControlledIntroCount,
    internalIntroWordingCount: internalWordingCount,
  };
  return output;
}

function buildApprovedIntro(hub) {
  const count = hub.assetCount.toLocaleString("en-US");
  if (hub.route === "/coloring-pages") {
    return `Browse ${count} printable pages in the full collection, then search or filter the available designs.`;
  }
  return `Browse ${count} printable pages in the ${collectionLabel(hub.title)} collection, then search or filter the available designs.`;
}

function isApprovedIntro(value) {
  return /^Browse [\d,]+ printable pages (?:in the .+ collection|in the full collection), then search or filter the available designs\.$/.test(value);
}

function collectionLabel(title) {
  return title.replace(/\s+Coloring Pages$/i, "").trim();
}

function hashMembership(hubs) {
  return createHash("sha256").update(JSON.stringify(hubs.map((hub) => ({ hubId: hub.hubId, assetIds: hub.assetIds })))).digest("hex");
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  applyRuntimePublicContentQuality()
    .then((output) => console.log(JSON.stringify(output.summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
