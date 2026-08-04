#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { collectPerformanceAccessibilitySnapshot } from "../lib/performance-accessibility-quality.mjs";

const ROOT = process.cwd();
const labelIndex = process.argv.indexOf("--label");
const label = labelIndex >= 0 && process.argv[labelIndex + 1] ? process.argv[labelIndex + 1] : "current";
const outputDirectory = path.join(ROOT, "pipeline/review/performance-accessibility");
const outputPath = path.join(outputDirectory, `${label}.json`);
const snapshot = collectPerformanceAccessibilitySnapshot(ROOT, { label });

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: path.relative(ROOT, outputPath).replaceAll("\\", "/"),
  passedMeasuredBudgets: snapshot.passedMeasuredBudgets,
  unresolvedCssVariables: snapshot.cssAudit.unresolved,
  routeMeasurements: snapshot.routes.map((route) => ({
    id: route.id,
    htmlBytes: route.htmlBytes,
    javascriptGzipBytes: route.javascriptGzipBytes,
    cssGzipBytes: route.cssGzipBytes,
    initialImageBytes: route.initialImageBytes,
  })),
}, null, 2));

if (!snapshot.passedMeasuredBudgets || snapshot.cssAudit.unresolved.length > 0) process.exitCode = 1;
