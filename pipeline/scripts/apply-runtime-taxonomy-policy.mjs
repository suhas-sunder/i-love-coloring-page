#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectClusteredHubIds } from "../lib/taxonomy-promotion-policy.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
export const TAXONOMY_POLICY_PATH = "src/config/taxonomy-promotion-policy.json";
export const RUNTIME_HUBS_PATH = "src/generated/coloring/runtime-hubs.json";

export async function applyRuntimeTaxonomyPolicy({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const policy = await readJson(repoRoot, TAXONOMY_POLICY_PATH);
  const source = await readJson(repoRoot, RUNTIME_HUBS_PATH);
  const output = applyPolicy(source, policy);
  if (write) await writeJson(repoRoot, RUNTIME_HUBS_PATH, output);
  return { policy, output };
}

export function applyPolicy(source, policy) {
  const output = structuredClone(source);
  const hubById = new Map(output.hubs.map((hub) => [hub.hubId, hub]));
  const membershipHashBefore = hashMembership(output.hubs);

  for (const override of policy.parentOverrides) {
    const hub = required(hubById.get(override.hubId), `Missing parent-override hub: ${override.hubId}`);
    const parent = required(hubById.get(override.parentHubId), `Missing replacement parent: ${override.parentHubId}`);
    for (const candidate of output.hubs) {
      candidate.childHubIds = (candidate.childHubIds || []).filter((hubId) => hubId !== hub.hubId);
    }
    parent.childHubIds = [...new Set([...(parent.childHubIds || []), hub.hubId])];
    hub.parentHubId = parent.hubId;
    hub.breadcrumbPath = [
      { label: "Coloring Pages", route: "/coloring-pages" },
      { label: collectionLabel(parent.title), route: parent.route },
      { label: collectionLabel(hub.title), route: "" },
    ];
    hub.relatedHubIds = replaceParentReference(hub.relatedHubIds || [], override, parent.hubId);
    hub.internalLinkingTargets = replaceParentReference(hub.internalLinkingTargets || [], override, parent.hubId);
  }

  const validHubIds = new Set(output.hubs.map((hub) => hub.hubId));
  for (const hub of output.hubs) {
    hub.relatedHubIds = selectClusteredHubIds(
      (hub.relatedHubIds || []).filter((hubId) => validHubIds.has(hubId)),
      { currentHubId: hub.hubId, policy },
    );
    hub.internalLinkingTargets = selectClusteredHubIds(
      (hub.internalLinkingTargets || []).filter((hubId) => validHubIds.has(hubId)),
      { currentHubId: hub.hubId, policy },
    );
  }

  validateParents(output.hubs);
  const membershipHashAfter = hashMembership(output.hubs);
  if (membershipHashAfter !== membershipHashBefore) throw new Error("Taxonomy policy changed hub membership");
  if (membershipHashAfter !== policy.preservationBaseline.hubMembershipSha256) {
    throw new Error("Hub membership no longer matches the approved preservation baseline");
  }

  output.summary = {
    ...output.summary,
    taxonomyPromotionPolicyVersion: policy.version,
    taxonomyPromotionPolicy: TAXONOMY_POLICY_PATH,
    parentOverrideCount: policy.parentOverrides.length,
  };
  return output;
}

function replaceParentReference(values, override, replacement) {
  return [...new Set(values.filter((hubId) => hubId !== override.previousParentHubId && hubId !== override.hubId).concat(replacement))];
}

function validateParents(hubs) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  for (const hub of hubs) {
    if (hub.parentHubId && !hubById.has(hub.parentHubId)) throw new Error(`Unresolved parent: ${hub.hubId} -> ${hub.parentHubId}`);
  }
}

function hashMembership(hubs) {
  const membership = hubs.map((hub) => ({ hubId: hub.hubId, assetIds: hub.assetIds }));
  return createHash("sha256").update(JSON.stringify(membership)).digest("hex");
}

function collectionLabel(title) {
  return title.replace(/ Coloring Pages$/i, "");
}

function required(value, message) {
  if (value == null) throw new Error(message);
  return value;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function writeJson(repoRoot, relativePath, value) {
  await writeFile(path.join(repoRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  applyRuntimeTaxonomyPolicy()
    .then(({ output }) => console.log(JSON.stringify(output.summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
