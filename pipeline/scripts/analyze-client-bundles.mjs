#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeClientBundles } from "../lib/client-bundle-analysis.mjs";

const ROOT = process.cwd();
const labelIndex = process.argv.indexOf("--label");
const label = labelIndex >= 0 && process.argv[labelIndex + 1] ? process.argv[labelIndex + 1] : "current";
const outputDirectory = path.join(ROOT, "pipeline", "review", "client-bundle-hydration");
const outputPath = path.join(outputDirectory, `${label}.json`);
const analysis = analyzeClientBundles(ROOT);

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: path.relative(ROOT, outputPath).replaceAll("\\", "/"),
  aggregate: analysis.aggregate,
  routes: analysis.routes.map((route) => ({
    id: route.id,
    initialChunkCount: route.initialChunkCount,
    initialRawBytes: route.initialRawBytes,
    initialGzipBytes: route.initialGzipBytes,
  })),
  deferredExportChunks: analysis.deferredExportChunks.map((chunk) => ({
    asset: chunk.asset,
    rawBytes: chunk.rawBytes,
    gzipBytes: chunk.gzipBytes,
    owner: chunk.owner,
    phase: chunk.phase,
  })),
}, null, 2));
